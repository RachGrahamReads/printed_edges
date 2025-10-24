import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MockupRequest {
  coverImagePath?: string; // Storage path (optional, for legacy)
  coverImageBase64?: string; // Base64 encoded image (preferred)
  edgeDesignBase64?: string; // Base64 encoded edge design image (optional)
  trimWidth?: number; // Book trim width in inches (e.g., 6)
  trimHeight?: number; // Book trim height in inches (e.g., 9)
  pageCount?: number; // Total number of pages (e.g., 200)
  scaleMode?: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'; // Edge image scaling mode
  outputPath?: string; // Optional output path for storage
}

// Helper: Check if point is inside quadrilateral using barycentric coordinates
function isPointInQuad(
  x: number,
  y: number,
  quad: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] }
): boolean {
  const sign = (p1: [number, number], p2: [number, number], p3: [number, number]) => {
    return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  };

  const pt: [number, number] = [x, y];
  const d1 = sign(pt, quad.tl, quad.tr);
  const d2 = sign(pt, quad.tr, quad.br);
  const d3 = sign(pt, quad.br, quad.bl);
  const d4 = sign(pt, quad.bl, quad.tl);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0 || d4 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0 || d4 > 0;

  return !(hasNeg && hasPos);
}

// Helper: Map quad coordinates to normalized UV (0-1) with inverse bilinear interpolation
function quadToUV(
  x: number,
  y: number,
  quad: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] }
): [number, number] | null {
  let u = 0.5;
  let v = 0.5;

  // Newton-Raphson iteration for inverse bilinear interpolation
  for (let iter = 0; iter < 10; iter++) {
    const px =
      (1 - u) * (1 - v) * quad.tl[0] +
      u * (1 - v) * quad.tr[0] +
      (1 - u) * v * quad.bl[0] +
      u * v * quad.br[0];
    const py =
      (1 - u) * (1 - v) * quad.tl[1] +
      u * (1 - v) * quad.tr[1] +
      (1 - u) * v * quad.bl[1] +
      u * v * quad.br[1];

    const dx = x - px;
    const dy = y - py;

    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      break;
    }

    const dPx_du = -(1 - v) * quad.tl[0] + (1 - v) * quad.tr[0] - v * quad.bl[0] + v * quad.br[0];
    const dPx_dv = -(1 - u) * quad.tl[0] - u * quad.tr[0] + (1 - u) * quad.bl[0] + u * quad.br[0];
    const dPy_du = -(1 - v) * quad.tl[1] + (1 - v) * quad.tr[1] - v * quad.bl[1] + v * quad.br[1];
    const dPy_dv = -(1 - u) * quad.tl[1] - u * quad.tr[1] + (1 - u) * quad.bl[1] + u * quad.br[1];

    const det = dPx_du * dPy_dv - dPx_dv * dPy_du;
    if (Math.abs(det) < 0.0001) break;

    const inv_det = 1 / det;
    const du = inv_det * (dPy_dv * dx - dPx_dv * dy);
    const dv = inv_det * (-dPy_du * dx + dPx_du * dy);

    u += du * 0.5;
    v += dv * 0.5;

    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));
  }

  return [u, v];
}

// Helper: Apply scaling mode to UV coordinates for edge design mapping
function applyScaleMode(
  u: number,
  v: number,
  scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides',
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number
): [number, number] | null {
  const imageAspect = imageWidth / imageHeight;
  const targetAspect = targetWidth / targetHeight;

  switch (scaleMode) {
    case 'stretch':
      // Use UV as-is (stretches to fit)
      return [u, v];

    case 'fit': {
      // Fit entire image within target (may have letterboxing)
      if (imageAspect > targetAspect) {
        // Image is wider - letterbox top/bottom
        const scale = imageAspect / targetAspect;
        const newV = (v - 0.5) * scale + 0.5;
        if (newV < 0 || newV > 1) return null; // Outside image bounds
        return [u, newV];
      } else {
        // Image is taller - letterbox left/right
        const scale = targetAspect / imageAspect;
        const newU = (u - 0.5) * scale + 0.5;
        if (newU < 0 || newU > 1) return null; // Outside image bounds
        return [newU, v];
      }
    }

    case 'fill': {
      // Fill target (may crop image)
      if (imageAspect > targetAspect) {
        // Image is wider - crop left/right
        const scale = targetAspect / imageAspect;
        const newU = (u - 0.5) * scale + 0.5;
        return [newU, v];
      } else {
        // Image is taller - crop top/bottom
        const scale = imageAspect / targetAspect;
        const newV = (v - 0.5) * scale + 0.5;
        return [u, newV];
      }
    }

    case 'none': {
      // Use image at original scale (1:1 pixel mapping)
      // Center the image and show gaps if smaller than target
      const targetPixelWidth = targetWidth;
      const targetPixelHeight = targetHeight;

      // Calculate what portion of the target the original image covers
      const imageWidthRatio = imageWidth / targetPixelWidth;
      const imageHeightRatio = imageHeight / targetPixelHeight;

      // Map UV to centered position
      // If image is smaller, UV outside [0,1] range will return null (showing gaps)
      const centeredU = (u - 0.5) / imageWidthRatio + 0.5;
      const centeredV = (v - 0.5) / imageHeightRatio + 0.5;

      // Only sample if within original image bounds
      if (centeredU < 0 || centeredU > 1 || centeredV < 0 || centeredV > 1) {
        return null; // Outside image bounds - show gap
      }

      return [centeredU, centeredV];
    }

    case 'extend-sides': {
      // Extend leftmost and rightmost columns
      const EDGE_THRESHOLD = 0.05; // 5% from each edge
      if (u < EDGE_THRESHOLD) {
        return [0, v]; // Sample from leftmost column
      } else if (u > 1 - EDGE_THRESHOLD) {
        return [1, v]; // Sample from rightmost column
      } else {
        // Scale the middle portion to fill the center
        const scaledU = (u - EDGE_THRESHOLD) / (1 - 2 * EDGE_THRESHOLD);
        return [scaledU, v];
      }
    }

    default:
      return [u, v];
  }
}

// Helper: Bilinear interpolation for smooth sampling
function bilinearSample(
  imageData: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): [number, number, number, number] {
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);

  const fx = x - x1;
  const fy = y - y1;

  const getPixel = (px: number, py: number): [number, number, number, number] => {
    const idx = (py * width + px) * 4;
    return [imageData[idx], imageData[idx + 1], imageData[idx + 2], imageData[idx + 3]];
  };

  const tl = getPixel(x1, y1);
  const tr = getPixel(x2, y1);
  const bl = getPixel(x1, y2);
  const br = getPixel(x2, y2);

  const top: [number, number, number, number] = [
    tl[0] * (1 - fx) + tr[0] * fx,
    tl[1] * (1 - fx) + tr[1] * fx,
    tl[2] * (1 - fx) + tr[2] * fx,
    tl[3] * (1 - fx) + tr[3] * fx,
  ];

  const bottom: [number, number, number, number] = [
    bl[0] * (1 - fx) + br[0] * fx,
    bl[1] * (1 - fx) + br[1] * fx,
    bl[2] * (1 - fx) + br[2] * fx,
    bl[3] * (1 - fx) + br[3] * fx,
  ];

  return [
    Math.round(top[0] * (1 - fy) + bottom[0] * fy),
    Math.round(top[1] * (1 - fy) + bottom[1] * fy),
    Math.round(top[2] * (1 - fy) + bottom[2] * fy),
    Math.round(top[3] * (1 - fy) + bottom[3] * fy),
  ];
}

// Helper: Calculate page edge width based on page count (from /create page)
function calculatePageEdgeWidth(pageCount: number): number {
  const PAPER_THICKNESS_INCHES = 0.0035; // Standard paper thickness (matches /create page)
  const numLeaves = Math.ceil(pageCount / 2);
  const physicalEdgeWidth = numLeaves * PAPER_THICKNESS_INCHES;
  return physicalEdgeWidth; // in inches
}

// Helper: Calculate page edge quad based on cover quad and book dimensions
// Uses the same ratio calculation as /create page for accurate dimensions
function calculatePageEdgeQuad(
  coverQuad: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] },
  trimWidth: number,
  trimHeight: number,
  pageCount: number
): { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] } {
  // Calculate physical edge dimensions (matches /create page)
  const PAPER_THICKNESS_INCHES = 0.0035;
  const numLeaves = Math.ceil(pageCount / 2);
  const physicalEdgeWidth = numLeaves * PAPER_THICKNESS_INCHES; // Page thickness (e.g., 0.35")
  const physicalEdgeHeight = trimHeight; // Book height (e.g., 9")

  // Calculate the physical aspect ratio
  const physicalRatio = physicalEdgeWidth / physicalEdgeHeight;

  console.log('Page edge physical dimensions:', {
    physicalEdgeWidth: physicalEdgeWidth.toFixed(3) + '"',
    physicalEdgeHeight: physicalEdgeHeight + '"',
    physicalRatio: physicalRatio.toFixed(4)
  });

  // Get the cover height in pixels (this is our reference height)
  const coverHeightPixels = Math.abs(coverQuad.bl[1] - coverQuad.tl[1]);

  // Calculate page edge width in pixels using the same ratio approach as /create page
  // If cover height represents the trim height, then:
  // edgeWidthPixels = coverHeightPixels * physicalRatio
  const edgeWidthPixels = coverHeightPixels * physicalRatio;

  console.log('Page edge display dimensions:', {
    coverHeightPixels: coverHeightPixels.toFixed(1) + 'px',
    edgeWidthPixels: edgeWidthPixels.toFixed(1) + 'px'
  });

  // Get the right edge of the cover (where page edge starts)
  const coverTopRight = coverQuad.tr;
  const coverBottomRight = coverQuad.br;

  // Calculate the perspective depth factor from the cover quad
  // (how much the right edge recedes into 3D space)
  const coverDepthX = coverQuad.tr[0] - coverQuad.tl[0];
  const depthFactor = coverDepthX / coverHeightPixels;

  // Page edge quad: extends to the right of the cover with same perspective
  // Use the calculated edgeWidthPixels and apply perspective
  const topLeft = coverTopRight;
  const topRight: [number, number] = [
    coverTopRight[0] + edgeWidthPixels * depthFactor,
    coverTopRight[1] + edgeWidthPixels * 0.12 // Slight downward tilt
  ];
  const bottomLeft = coverBottomRight;
  const bottomRight: [number, number] = [
    coverBottomRight[0] + edgeWidthPixels * depthFactor,
    coverBottomRight[1] - edgeWidthPixels * 0.12 // Slight upward tilt
  ];

  return {
    tl: topLeft,
    tr: topRight,
    bl: bottomLeft,
    br: bottomRight
  };
}

// Helper: Render soft shadow underneath the book
function renderBookShadow(
  outputPixels: Uint8Array,
  coverQuad: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] },
  pageEdgeQuad: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] },
  templateWidth: number,
  templateHeight: number
) {
  // Calculate shadow position - below and angled to match the book's bottom
  const bookBottomLeftX = coverQuad.bl[0];
  const bookBottomLeftY = coverQuad.bl[1];
  const bookBottomRightX = pageEdgeQuad.br[0];
  const bookBottomRightY = pageEdgeQuad.br[1];

  // Shadow parameters (no rotation - simple horizontal ellipse)
  const shadowOffsetY = 0; // How far below the book
  const shadowCenterX = (bookBottomLeftX + bookBottomRightX) / 2;
  const shadowCenterY = (bookBottomLeftY + bookBottomRightY) / 2 + shadowOffsetY;
  const shadowRadiusX = (bookBottomRightX - bookBottomLeftX) * 0.6; // Shadow width
  const shadowRadiusY = shadowRadiusX * 0.05; // Shadow height (ellipse)
  const shadowMaxAlpha = 80; // Maximum shadow opacity

  // Render elliptical shadow with gradient
  const minY = Math.max(0, Math.floor(shadowCenterY - shadowRadiusY * 2));
  const maxY = Math.min(templateHeight - 1, Math.ceil(shadowCenterY + shadowRadiusY * 2));
  const minX = Math.max(0, Math.floor(shadowCenterX - shadowRadiusX * 2));
  const maxX = Math.min(templateWidth - 1, Math.ceil(shadowCenterX + shadowRadiusX * 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Calculate distance from shadow center (normalized to ellipse)
      const dx = (x - shadowCenterX) / shadowRadiusX;
      const dy = (y - shadowCenterY) / shadowRadiusY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Only render if inside shadow radius
      if (distance > 1.5) continue;

      // Calculate shadow alpha based on distance (fade to transparent at edges)
      let alpha = 0;
      if (distance <= 1.0) {
        // Full shadow in center
        alpha = shadowMaxAlpha * (1 - distance * 0.3);
      } else {
        // Fade out at edges
        const fadeAmount = (1.5 - distance) / 0.5;
        alpha = shadowMaxAlpha * fadeAmount * 0.5;
      }

      alpha = Math.max(0, Math.min(shadowMaxAlpha, alpha));

      // Blend shadow with existing pixel
      const destIdx = (y * templateWidth + x) * 4;
      const existingR = outputPixels[destIdx];
      const existingG = outputPixels[destIdx + 1];
      const existingB = outputPixels[destIdx + 2];
      const existingA = outputPixels[destIdx + 3];

      // Alpha blend: dark shadow (near black) with existing color
      const shadowR = 30;
      const shadowG = 30;
      const shadowB = 30;

      const blendFactor = alpha / 255;
      outputPixels[destIdx] = Math.round(existingR * (1 - blendFactor) + shadowR * blendFactor);
      outputPixels[destIdx + 1] = Math.round(existingG * (1 - blendFactor) + shadowG * blendFactor);
      outputPixels[destIdx + 2] = Math.round(existingB * (1 - blendFactor) + shadowB * blendFactor);
      outputPixels[destIdx + 3] = Math.max(existingA, alpha);
    }
  }
}

// Helper: Render default page edge (cream/white paper color with realistic texture)
function renderDefaultPageEdge(
  outputPixels: Uint8Array,
  pageEdgeQuad: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] },
  templateWidth: number,
  templateHeight: number
) {
  // Base cream/off-white paper color
  const paperColor: [number, number, number, number] = [245, 242, 235, 255]; // #F5F2EB

  const pageEdgeMinX = Math.min(pageEdgeQuad.tl[0], pageEdgeQuad.tr[0], pageEdgeQuad.bl[0], pageEdgeQuad.br[0]);
  const pageEdgeMaxX = Math.max(pageEdgeQuad.tl[0], pageEdgeQuad.tr[0], pageEdgeQuad.bl[0], pageEdgeQuad.br[0]);
  const pageEdgeMinY = Math.min(pageEdgeQuad.tl[1], pageEdgeQuad.tr[1], pageEdgeQuad.bl[1], pageEdgeQuad.br[1]);
  const pageEdgeMaxY = Math.max(pageEdgeQuad.tl[1], pageEdgeQuad.tr[1], pageEdgeQuad.bl[1], pageEdgeQuad.br[1]);

  for (let y = Math.floor(pageEdgeMinY); y <= Math.ceil(pageEdgeMaxY); y++) {
    for (let x = Math.floor(pageEdgeMinX); x <= Math.ceil(pageEdgeMaxX); x++) {
      // Check bounds
      if (x < 0 || x >= templateWidth || y < 0 || y >= templateHeight) continue;
      if (!isPointInQuad(x, y, pageEdgeQuad)) continue;

      // Use clean, light paper color without shading
      // This allows edge designs to show through with their true colors
      const destIdx = (y * templateWidth + x) * 4;
      outputPixels[destIdx] = paperColor[0];
      outputPixels[destIdx + 1] = paperColor[1];
      outputPixels[destIdx + 2] = paperColor[2];
      outputPixels[destIdx + 3] = 255;
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData: MockupRequest = await req.json();
    const {
      coverImagePath,
      coverImageBase64,
      edgeDesignBase64,
      trimWidth = 6,
      trimHeight = 9,
      pageCount = 200,
      scaleMode = 'fill',
      outputPath
    } = requestData;

    console.log('Generating mockup...', { trimWidth, trimHeight, pageCount, scaleMode });

    // Get cover image data (optional now)
    let coverBuffer: ArrayBuffer | null = null;

    if (coverImageBase64) {
      // Decode base64 image
      console.log('Using base64 cover image');
      const binaryString = atob(coverImageBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      coverBuffer = bytes.buffer;
    } else if (coverImagePath) {
      // Download cover image from storage (legacy)
      console.log('Downloading cover from storage:', coverImagePath);
      const { data: coverData, error: coverError } = await supabase.storage
        .from('mockup-uploads')
        .download(coverImagePath);

      if (coverError) {
        throw new Error(`Failed to download cover: ${coverError.message}`);
      }
      coverBuffer = await coverData.arrayBuffer();
    } else {
      console.log('No cover image provided, will use template only');
    }

    // Download template image (cover-only template)
    // Try storage first, fallback to localhost for local dev, then production
    let templateData: ArrayBuffer;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const templateUrl = `${supabaseUrl}/storage/v1/object/public/mockup-templates/book-mockup-cover-template.png`;
    console.log('Fetching cover template from:', templateUrl);

    let templateResponse = await fetch(templateUrl);
    if (!templateResponse.ok) {
      // Fallback 1: Try localhost (for local development)
      console.log('Template not found in storage, trying localhost...');
      // Try common Next.js ports
      const localhostUrls = [
        'http://host.docker.internal:3006/book-mockup-cover-template.png',
        'http://host.docker.internal:3001/book-mockup-cover-template.png',
        'http://host.docker.internal:3005/book-mockup-cover-template.png',
        'http://host.docker.internal:3000/book-mockup-cover-template.png'
      ];

      let found = false;
      for (const url of localhostUrls) {
        templateResponse = await fetch(url);
        if (templateResponse.ok) {
          found = true;
          console.log('Template found at:', url);
          break;
        }
      }

      if (!found) {
        templateResponse = { ok: false, status: 404 } as Response;
      }

      if (!templateResponse.ok) {
        // Fallback 2: Try production URL
        console.log('Localhost failed, trying production URL...');
        const prodUrls = [
          'https://printededges.com/book-mockup-cover-template.png',
          'https://www.printededges.com/book-mockup-cover-template.png'
        ];

        for (const prodUrl of prodUrls) {
          templateResponse = await fetch(prodUrl);
          if (templateResponse.ok) {
            console.log('Template found at:', prodUrl);
            break;
          }
        }

        if (!templateResponse.ok) {
          throw new Error(`Failed to fetch cover template from storage, localhost, and production. Please ensure the template file exists at /public/book-mockup-cover-template.png`);
        }
      }
    }
    templateData = await templateResponse.arrayBuffer();

    // Load images using imagescript
    const templateImg = await Image.decode(new Uint8Array(templateData));
    console.log('Template size:', templateImg.width, 'x', templateImg.height);

    let coverImg: Image | null = null;
    if (coverBuffer) {
      coverImg = await Image.decode(new Uint8Array(coverBuffer));
      console.log('Cover size:', coverImg.width, 'x', coverImg.height);
    }

    // Load edge design image if provided
    let edgeDesignImg: Image | null = null;
    if (edgeDesignBase64) {
      console.log('Loading edge design image');
      const edgeBinaryString = atob(edgeDesignBase64);
      const edgeBytes = new Uint8Array(edgeBinaryString.length);
      for (let i = 0; i < edgeBinaryString.length; i++) {
        edgeBytes[i] = edgeBinaryString.charCodeAt(i);
      }
      edgeDesignImg = await Image.decode(edgeBytes);
      console.log('Edge design size:', edgeDesignImg.width, 'x', edgeDesignImg.height);
    }

    // Find red pixels in template (R > 200, G < 50, B < 50)
    const templateWidth = templateImg.width;
    const templateHeight = templateImg.height;
    const templatePixels = templateImg.bitmap;

    let minX = templateWidth,
      maxX = 0,
      minY = templateHeight,
      maxY = 0;
    let redPixelCount = 0;

    // Scan for red pixels
    for (let y = 0; y < templateHeight; y++) {
      for (let x = 0; x < templateWidth; x++) {
        const idx = (y * templateWidth + x) * 4;
        const r = templatePixels[idx];
        const g = templatePixels[idx + 1];
        const b = templatePixels[idx + 2];

        if (r > 200 && g < 50 && b < 50) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          redPixelCount++;
        }
      }
    }

    console.log('Red pixels found:', redPixelCount);
    console.log('Red area bounds:', { minX, maxX, minY, maxY });

    // If no red pixels found, use default coordinates
    if (redPixelCount === 0) {
      console.log('No red pixels found, using default bounds');
      minX = Math.floor(templateWidth * 0.28);
      maxX = Math.floor(templateWidth * 0.62);
      minY = Math.floor(templateHeight * 0.12);
      maxY = Math.floor(templateHeight * 0.88);
    }

    // MANUAL OVERRIDE FOR TESTING - uncomment to test different values
     minX = 431;
     maxX = 982;
     minY = 135;
     maxY = 1212;
     console.log('Using manual override:', { minX, maxX, minY, maxY });

    // For a 3D book mockup with perspective distortion
    // Return to the original detected quad that was working
    const redAreaWidth = maxX - minX;
    const redAreaHeight = maxY - minY;

    // Apply the original perspective transformation that gave us:
    // tl: [431, 89], tr: [916, 147], bl: [431, 1249], br: [982, 1215]
    const perspectiveOffset = Math.floor(redAreaWidth * 0.12);

    let topLeft = [minX, minY + Math.floor(redAreaWidth * 0.085)] as [number, number];
    let topRight = [maxX, minY] as [number, number];
    let bottomLeft = [minX, maxY - Math.floor(redAreaWidth * 0.085)] as [number, number];
    let bottomRight = [maxX, maxY] as [number, number];

    const quad = {
      tl: topLeft,
      tr: topRight,
      bl: bottomLeft,
      br: bottomRight,
    };

    console.log('Perspective quad corners:', quad);

    // Create output image (clone template)
    const outputImg = new Image(templateWidth, templateHeight);
    outputImg.bitmap.set(templateImg.bitmap);
    const outputPixels = outputImg.bitmap;

    // Calculate page edge quad FIRST (needed for proper layering)
    console.log('Calculating page edge quad...');
    const pageEdgeQuad = calculatePageEdgeQuad(quad, trimWidth, trimHeight, pageCount);
    console.log('Page edge quad:', pageEdgeQuad);
    console.log('Calculated edge width:', calculatePageEdgeWidth(pageCount), 'inches');

    // Render page edge FIRST (before cover) so transparency shows paper, not dark cover
    // Render clean paper base first
    console.log('Rendering clean paper base for page edge...');
    renderDefaultPageEdge(outputPixels, pageEdgeQuad, templateWidth, templateHeight);
    console.log('Paper base rendering complete');

    // Then render edge design on top of paper (if provided)
    if (edgeDesignImg) {
      console.log('Rendering custom edge design on top of paper base...');

      // Apply edge design to page edge area
      const edgePixels = edgeDesignImg.bitmap;
      const edgeWidth = edgeDesignImg.width;
      const edgeHeight = edgeDesignImg.height;

      const pageEdgeMinX = Math.min(pageEdgeQuad.tl[0], pageEdgeQuad.tr[0], pageEdgeQuad.bl[0], pageEdgeQuad.br[0]);
      const pageEdgeMaxX = Math.max(pageEdgeQuad.tl[0], pageEdgeQuad.tr[0], pageEdgeQuad.bl[0], pageEdgeQuad.br[0]);
      const pageEdgeMinY = Math.min(pageEdgeQuad.tl[1], pageEdgeQuad.tr[1], pageEdgeQuad.bl[1], pageEdgeQuad.br[1]);
      const pageEdgeMaxY = Math.max(pageEdgeQuad.tl[1], pageEdgeQuad.tr[1], pageEdgeQuad.bl[1], pageEdgeQuad.br[1]);

      // Calculate target dimensions for scaling
      // For 'none' mode: use recommended pixel dimensions (matches edge preview)
      // For other modes: use physical dimensions for correct aspect ratio
      const PAPER_THICKNESS_INCHES = 0.0035;
      const numLeaves = Math.ceil(pageCount / 2);

      let targetWidth, targetHeight;

      if (scaleMode === 'none' || scaleMode === 'extend-sides') {
        // Use recommended pixel dimensions for 'none' and 'extend-sides' modes (same as edge preview canvas)
        // This ensures proper scaling/fitting logic matches the edge preview
        targetWidth = numLeaves; // Width in pixels = number of leaves
        targetHeight = trimHeight * 285.7; // Height at 285.7 DPI
      } else {
        // Use physical dimensions for aspect ratio calculations (fill, fit, stretch)
        const physicalEdgeWidth = numLeaves * PAPER_THICKNESS_INCHES; // e.g., 0.35"
        const physicalEdgeHeight = trimHeight; // e.g., 9"
        targetWidth = physicalEdgeWidth * 1000; // Scale up for precision
        targetHeight = physicalEdgeHeight * 1000;
      }

      for (let y = Math.floor(pageEdgeMinY); y <= Math.ceil(pageEdgeMaxY); y++) {
        for (let x = Math.floor(pageEdgeMinX); x <= Math.ceil(pageEdgeMaxX); x++) {
          // Check bounds
          if (x < 0 || x >= templateWidth || y < 0 || y >= templateHeight) continue;
          if (!isPointInQuad(x, y, pageEdgeQuad)) continue;

          const uv = quadToUV(x, y, pageEdgeQuad);
          if (!uv) continue;

          // Apply scaling mode to UV coordinates
          const scaledUV = applyScaleMode(
            uv[0],
            uv[1],
            scaleMode,
            edgeWidth,
            edgeHeight,
            targetWidth,
            targetHeight
          );
          if (!scaledUV) continue; // Outside bounds after scaling

          const [u, v] = scaledUV;
          const edgeSrcX = u * (edgeWidth - 1);
          const edgeSrcY = v * (edgeHeight - 1);

          const edgeColor = bilinearSample(edgePixels, edgeWidth, edgeHeight, edgeSrcX, edgeSrcY);

          // Respect edge image's own alpha channel combined with 60% opacity
          const edgeImageAlpha = edgeColor[3] / 255; // Edge's own transparency
          const combinedOpacity = edgeImageAlpha * 0.6; // Combine with 60% opacity

          const destIdx = (y * templateWidth + x) * 4;

          // Only blend if edge has some opacity (skip fully transparent pixels)
          if (combinedOpacity > 0.001) {
            // Get existing background color (clean light paper color)
            const bgR = outputPixels[destIdx];
            const bgG = outputPixels[destIdx + 1];
            const bgB = outputPixels[destIdx + 2];

            // Blend edge color with background based on combined opacity
            outputPixels[destIdx] = Math.round(edgeColor[0] * combinedOpacity + bgR * (1 - combinedOpacity));
            outputPixels[destIdx + 1] = Math.round(edgeColor[1] * combinedOpacity + bgG * (1 - combinedOpacity));
            outputPixels[destIdx + 2] = Math.round(edgeColor[2] * combinedOpacity + bgB * (1 - combinedOpacity));
            outputPixels[destIdx + 3] = 255;
          }
        }
      }

      console.log('Custom edge design rendering complete');
    } else {
      console.log('No edge design provided, using paper base only');
    }

    // NOW render cover image on top (if cover provided)
    if (coverImg) {
      const coverPixels = coverImg.bitmap;
      const coverWidth = coverImg.width;
      const coverHeight = coverImg.height;

      console.log('Applying perspective warp...');

      // Calculate the aspect ratio of the quad and cover
      const quadWidth = Math.max(quad.tl[0], quad.tr[0], quad.bl[0], quad.br[0]) - Math.min(quad.tl[0], quad.tr[0], quad.bl[0], quad.br[0]);
      const quadHeight = Math.max(quad.tl[1], quad.tr[1], quad.bl[1], quad.br[1]) - Math.min(quad.tl[1], quad.tr[1], quad.bl[1], quad.br[1]);
      const quadAspect = quadWidth / quadHeight;
      const coverAspect = coverWidth / coverHeight;

      // Calculate how to fit the cover image into the quad
      // Strategy: Fit by WIDTH to avoid horizontal stretching, crop top/bottom

      let cropX = 0;  // Amount to crop from left/right (in source image normalized coords)
      let cropY = 0;  // Amount to crop from top/bottom (in source image normalized coords)

      // Fit by width means we scale the image so its width fills the quad width
      // If the image height is then taller than the quad, we crop top/bottom
      // If the image height is shorter, we'll have letterboxing (which is fine)

      // The quad expects a certain aspect ratio (quadAspect = width/height)
      // The cover has coverAspect = width/height
      // If coverAspect < quadAspect, cover is relatively taller -> crop height
      // If coverAspect > quadAspect, cover is relatively wider -> would crop width (but we don't want that)

      if (coverAspect < quadAspect) {
        // Cover is taller relative to quad - crop top/bottom
        // We want to show the full width, so calculate what portion of height to show
        const heightRatio = quadAspect / coverAspect;  // < 1
        cropY = (1 - heightRatio) / 2;  // Crop this much from top and bottom
      }
      // If coverAspect >= quadAspect, cover is wider - just fit it (may letterbox)

      console.log('Crop transform:', { coverAspect, quadAspect, cropY });

      // For each pixel in the quad region, map to source cover
      const quadMinX = Math.min(quad.tl[0], quad.tr[0], quad.bl[0], quad.br[0]);
      const quadMaxX = Math.max(quad.tl[0], quad.tr[0], quad.bl[0], quad.br[0]);
      const quadMinY = Math.min(quad.tl[1], quad.tr[1], quad.bl[1], quad.br[1]);
      const quadMaxY = Math.max(quad.tl[1], quad.tr[1], quad.bl[1], quad.br[1]);

      for (let y = quadMinY; y <= quadMaxY; y++) {
        for (let x = quadMinX; x <= quadMaxX; x++) {
          if (!isPointInQuad(x, y, quad)) continue;

          const uv = quadToUV(x, y, quad);
          if (!uv) continue;

          // Map UV [0,1] to the cropped region of the source image
          let [u, v] = uv;

          // Apply cropping - map to the visible portion of the source
          u = cropX + u * (1 - 2 * cropX);
          v = cropY + v * (1 - 2 * cropY);

          // Clamp to valid range
          u = Math.max(0, Math.min(1, u));
          v = Math.max(0, Math.min(1, v));

          const srcX = u * (coverWidth - 1);
          const srcY = v * (coverHeight - 1);

          const color = bilinearSample(coverPixels, coverWidth, coverHeight, srcX, srcY);

          const destIdx = (y * templateWidth + x) * 4;

          // Alpha blend cover on top of edge - respect cover transparency
          const coverAlpha = color[3] / 255;
          const existingR = outputPixels[destIdx];
          const existingG = outputPixels[destIdx + 1];
          const existingB = outputPixels[destIdx + 2];

          outputPixels[destIdx] = Math.round(color[0] * coverAlpha + existingR * (1 - coverAlpha));
          outputPixels[destIdx + 1] = Math.round(color[1] * coverAlpha + existingG * (1 - coverAlpha));
          outputPixels[destIdx + 2] = Math.round(color[2] * coverAlpha + existingB * (1 - coverAlpha));
          outputPixels[destIdx + 3] = 255; // Output is always opaque
        }
      }

      console.log('Cover perspective warp complete');
    } else {
      console.log('No cover image provided, using template as-is');
    }

    console.log('Encoding PNG...');

    // Encode as PNG
    const outputBuffer = await outputImg.encode();

    // Try to upload to storage if output path provided, but fallback to base64 if it fails
    if (outputPath) {
      try {
        const { error: uploadError } = await supabase.storage
          .from('mockup-outputs')
          .upload(outputPath, outputBuffer, {
            contentType: 'image/png',
            upsert: true,
          });

        if (!uploadError) {
          // Get the public URL using Supabase client's getPublicUrl method
          const { data: publicUrlData } = supabase.storage
            .from('mockup-outputs')
            .getPublicUrl(outputPath);

          // Replace internal kong URL with external localhost for local dev
          let publicUrl = publicUrlData.publicUrl;
          if (publicUrl.includes('kong:8000')) {
            publicUrl = publicUrl.replace('http://kong:8000', 'http://127.0.0.1:54321');
          }

          console.log('Mockup uploaded:', publicUrl);

          return new Response(
            JSON.stringify({
              success: true,
              mockupUrl: publicUrl,
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        } else {
          console.error('Failed to upload mockup to storage, using base64:', uploadError);
        }
      } catch (storageError) {
        console.error('Storage error, using base64:', storageError);
      }
    }

    // Fallback: Return base64 data URL
    // Convert Uint8Array to base64 without spreading (to avoid stack overflow)
    const bytes = new Uint8Array(outputBuffer);
    let binary = '';
    const chunkSize = 0x8000; // Process in 32KB chunks to avoid stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);
    const dataUrl = `data:image/png;base64,${base64}`;

    return new Response(
      JSON.stringify({
        success: true,
        mockupUrl: dataUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Mockup generation error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
