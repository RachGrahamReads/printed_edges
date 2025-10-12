"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

interface BookMockupCanvasProps {
  coverImage: string | null;
  edgeImage: string | null;
  trimSize: { width: number; height: number };
  spineWidth: number;
  bookType: 'paperback' | 'hardcover';
}

export interface BookMockupCanvasRef {
  downloadImage: () => void;
}

export const BookMockupCanvas = forwardRef<BookMockupCanvasRef, BookMockupCanvasProps>(
  ({ coverImage, edgeImage, trimSize, spineWidth, bookType }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const coverImgRef = useRef<HTMLImageElement | null>(null);
    const edgeImgRef = useRef<HTMLImageElement | null>(null);
    const templateImgRef = useRef<HTMLImageElement | null>(null);

    // Expose download method to parent
    useImperativeHandle(ref, () => ({
      downloadImage: () => {
        if (!canvasRef.current) return;
        const link = document.createElement('a');
        link.download = 'book-mockup.png';
        link.href = canvasRef.current.toDataURL();
        link.click();
      }
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size (higher resolution for better quality)
      const scale = 2;
      canvas.width = 800 * scale;
      canvas.height = 600 * scale;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      // Scale context for high-DPI displays
      ctx.scale(scale, scale);

      // Clear canvas
      ctx.clearRect(0, 0, 800, 600);

      // If no cover image, show placeholder
      if (!coverImage) {
        drawPlaceholder(ctx);
        return;
      }

      // Load the template first
      const templateImg = new Image();
      templateImg.src = '/book-mockup-template.png';
      templateImgRef.current = templateImg;

      templateImg.onload = () => {
        // Load user's cover image
        const coverImg = new Image();
        coverImg.src = coverImage;
        coverImgRef.current = coverImg;

        coverImg.onload = () => {
          // Use template-based rendering
          drawTemplateBasedMockup(ctx, templateImg, coverImg, edgeImage);
        };
      };
    }, [coverImage, edgeImage, trimSize, spineWidth, bookType]);

    return (
      <div className="w-full bg-white rounded-lg p-8 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto"
        />
      </div>
    );
  }
);

BookMockupCanvas.displayName = "BookMockupCanvas";

// Draw placeholder when no image is uploaded
function drawPlaceholder(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(250, 150, 300, 300);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  ctx.strokeRect(250, 150, 300, 300);

  ctx.fillStyle = '#64748b';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Upload a cover image', 400, 300);
  ctx.fillText('to see your mockup', 400, 325);
}

// Helper: Check if point is inside quadrilateral
function isPointInQuad(x: number, y: number, quad: {tl: {x: number, y: number}, tr: {x: number, y: number}, bl: {x: number, y: number}, br: {x: number, y: number}}): boolean {
  // Use cross product to check if point is on the same side of all edges
  const sign = (p1: {x: number, y: number}, p2: {x: number, y: number}, p3: {x: number, y: number}) => {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  };

  const pt = { x, y };
  const d1 = sign(pt, quad.tl, quad.tr);
  const d2 = sign(pt, quad.tr, quad.br);
  const d3 = sign(pt, quad.br, quad.bl);
  const d4 = sign(pt, quad.bl, quad.tl);

  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0) || (d4 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0) || (d4 > 0);

  return !(hasNeg && hasPos);
}

// Helper: Map quad coordinates to normalized UV (0-1) with proper inverse bilinear interpolation
function quadToUV(x: number, y: number, quad: {tl: {x: number, y: number}, tr: {x: number, y: number}, bl: {x: number, y: number}, br: {x: number, y: number}}): {u: number, v: number} | null {
  // Solve the inverse bilinear interpolation problem
  // Given: P(u,v) = (1-u)(1-v)*TL + u(1-v)*TR + (1-u)v*BL + uv*BR
  // Find: u and v such that P(u,v) = (x, y)

  // This requires solving a system of equations - we'll use iterative approach
  let u = 0.5;
  let v = 0.5;

  // Newton-Raphson iteration
  for (let iter = 0; iter < 10; iter++) {
    // Calculate current position
    const px = (1 - u) * (1 - v) * quad.tl.x + u * (1 - v) * quad.tr.x +
               (1 - u) * v * quad.bl.x + u * v * quad.br.x;
    const py = (1 - u) * (1 - v) * quad.tl.y + u * (1 - v) * quad.tr.y +
               (1 - u) * v * quad.bl.y + u * v * quad.br.y;

    // Error
    const dx = x - px;
    const dy = y - py;

    // If close enough, stop
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      break;
    }

    // Calculate Jacobian (partial derivatives)
    const dPx_du = -(1 - v) * quad.tl.x + (1 - v) * quad.tr.x - v * quad.bl.x + v * quad.br.x;
    const dPx_dv = -(1 - u) * quad.tl.x - u * quad.tr.x + (1 - u) * quad.bl.x + u * quad.br.x;
    const dPy_du = -(1 - v) * quad.tl.y + (1 - v) * quad.tr.y - v * quad.bl.y + v * quad.br.y;
    const dPy_dv = -(1 - u) * quad.tl.y - u * quad.tr.y + (1 - u) * quad.bl.y + u * quad.br.y;

    // Inverse Jacobian
    const det = dPx_du * dPy_dv - dPx_dv * dPy_du;
    if (Math.abs(det) < 0.0001) break;

    const inv_det = 1 / det;
    const du = inv_det * (dPy_dv * dx - dPx_dv * dy);
    const dv = inv_det * (-dPy_du * dx + dPx_du * dy);

    // Update u and v
    u += du * 0.5; // Damping factor for stability
    v += dv * 0.5;

    // Clamp to valid range
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));
  }

  return { u, v };
}

// Helper: Bilinear sample from image data
function bilinearSample(imageData: ImageData, x: number, y: number, width: number, height: number): {r: number, g: number, b: number, a: number} {
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);

  const fx = x - x1;
  const fy = y - y1;

  const getPixel = (px: number, py: number) => {
    const idx = (py * width + px) * 4;
    return {
      r: imageData.data[idx],
      g: imageData.data[idx + 1],
      b: imageData.data[idx + 2],
      a: imageData.data[idx + 3]
    };
  };

  const tl = getPixel(x1, y1);
  const tr = getPixel(x2, y1);
  const bl = getPixel(x1, y2);
  const br = getPixel(x2, y2);

  // Bilinear interpolation
  const top = {
    r: tl.r * (1 - fx) + tr.r * fx,
    g: tl.g * (1 - fx) + tr.g * fx,
    b: tl.b * (1 - fx) + tr.b * fx,
    a: tl.a * (1 - fx) + tr.a * fx
  };

  const bottom = {
    r: bl.r * (1 - fx) + br.r * fx,
    g: bl.g * (1 - fx) + br.g * fx,
    b: bl.b * (1 - fx) + br.b * fx,
    a: bl.a * (1 - fx) + br.a * fx
  };

  return {
    r: Math.round(top.r * (1 - fy) + bottom.r * fy),
    g: Math.round(top.g * (1 - fy) + bottom.g * fy),
    b: Math.round(top.b * (1 - fy) + bottom.b * fy),
    a: Math.round(top.a * (1 - fy) + bottom.a * fy)
  };
}

// Helper function to draw an image with perspective warping to a quadrilateral
function drawPerspectiveImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  quad: {tl: {x: number, y: number}, tr: {x: number, y: number}, bl: {x: number, y: number}, br: {x: number, y: number}}
) {
  // Create a temporary canvas for the warped image
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return;

  // Get bounding box of the quad
  const minX = Math.min(quad.tl.x, quad.tr.x, quad.bl.x, quad.br.x);
  const maxX = Math.max(quad.tl.x, quad.tr.x, quad.bl.x, quad.br.x);
  const minY = Math.min(quad.tl.y, quad.tr.y, quad.bl.y, quad.br.y);
  const maxY = Math.max(quad.tl.y, quad.tr.y, quad.bl.y, quad.br.y);

  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);

  tempCanvas.width = width;
  tempCanvas.height = height;

  // Get source image data
  const srcCanvas = document.createElement('canvas');
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return;
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  srcCtx.drawImage(img, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, img.width, img.height);

  // Create destination image data
  const destImageData = tempCtx.createImageData(width, height);

  // Adjust quad to be relative to temp canvas
  const localQuad = {
    tl: { x: quad.tl.x - minX, y: quad.tl.y - minY },
    tr: { x: quad.tr.x - minX, y: quad.tr.y - minY },
    bl: { x: quad.bl.x - minX, y: quad.bl.y - minY },
    br: { x: quad.br.x - minX, y: quad.br.y - minY }
  };

  // Map each pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Check if point is in quad
      if (!isPointInQuad(x, y, localQuad)) continue;

      // Get UV coordinates
      const uv = quadToUV(x, y, localQuad);
      if (!uv) continue;

      // Map to source coordinates
      const srcX = uv.u * (img.width - 1);
      const srcY = uv.v * (img.height - 1);

      // Sample with bilinear interpolation
      const color = bilinearSample(srcImageData, srcX, srcY, img.width, img.height);

      // Write to destination
      const destIdx = (y * width + x) * 4;
      destImageData.data[destIdx] = color.r;
      destImageData.data[destIdx + 1] = color.g;
      destImageData.data[destIdx + 2] = color.b;
      destImageData.data[destIdx + 3] = color.a;
    }
  }

  tempCtx.putImageData(destImageData, 0, 0);

  // Draw to main canvas
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tempCanvas, minX, minY);
  ctx.restore();
}

// New template-based rendering function
function drawTemplateBasedMockup(
  ctx: CanvasRenderingContext2D,
  templateImg: HTMLImageElement,
  coverImg: HTMLImageElement,
  edgeImageSrc: string | null
) {
  // First, draw the template to get its pixel data and detect the red area
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return;

  tempCanvas.width = templateImg.width;
  tempCanvas.height = templateImg.height;
  tempCtx.drawImage(templateImg, 0, 0);

  // Get image data to find red pixels
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  // Find the bounding box of red pixels (R > 200, G < 50, B < 50)
  let minX = tempCanvas.width, maxX = 0, minY = tempCanvas.height, maxY = 0;
  let redPixelCount = 0;

  for (let y = 0; y < tempCanvas.height; y++) {
    for (let x = 0; x < tempCanvas.width; x++) {
      const idx = (y * tempCanvas.width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Check if this is a red pixel
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
  console.log('Template dimensions:', tempCanvas.width, 'x', tempCanvas.height);

  // If no red pixels found, use manual coordinates for the cover area
  if (redPixelCount === 0) {
    console.log('No red pixels found - using manual cover area');
    // Manual coordinates based on typical book mockup proportions
    minX = tempCanvas.width * 0.28;
    maxX = tempCanvas.width * 0.62;
    minY = tempCanvas.height * 0.12;
    maxY = tempCanvas.height * 0.88;
    console.log('Using manual bounds:', minX, maxX, minY, maxY);
  }

  // Draw the template as background
  ctx.drawImage(templateImg, 0, 0, 800, 600);

  // Scale coordinates to canvas size (800x600)
  const scaleX = 800 / tempCanvas.width;
  const scaleY = 600 / tempCanvas.height;

  // Now we need to find the actual corner positions of the red area for perspective warping
  // Scan the red pixels to find the 4 corners
  let topLeft = { x: minX, y: minY };
  let topRight = { x: maxX, y: minY };
  let bottomLeft = { x: minX, y: maxY };
  let bottomRight = { x: maxX, y: maxY };

  // Refine corner positions by finding actual red pixels at edges
  // This helps with perspective accuracy
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * tempCanvas.width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (r > 200 && g < 50 && b < 50) {
        // Top-left corner (smallest x + y)
        if (x + y < topLeft.x + topLeft.y) {
          topLeft = { x, y };
        }
        // Top-right corner (largest x, smallest y)
        if (y <= minY + 10 && x >= topRight.x) {
          topRight = { x, y };
        }
        // Bottom-left corner (smallest x, largest y)
        if (y >= maxY - 10 && x <= bottomLeft.x) {
          bottomLeft = { x, y };
        }
        // Bottom-right corner (largest x + y)
        if (x + y > bottomRight.x + bottomRight.y) {
          bottomRight = { x, y };
        }
      }
    }
  }

  // Convert to canvas coordinates
  const quad = {
    tl: { x: topLeft.x * scaleX, y: topLeft.y * scaleY },
    tr: { x: topRight.x * scaleX, y: topRight.y * scaleY },
    bl: { x: bottomLeft.x * scaleX, y: bottomLeft.y * scaleY },
    br: { x: bottomRight.x * scaleX, y: bottomRight.y * scaleY }
  };

  console.log('Quad corners:', quad);

  // Draw the cover with perspective warping
  drawPerspectiveImage(ctx, coverImg, quad);
}

// OLD 3D-generated function (keeping for reference)
function drawBookMockup(
  ctx: CanvasRenderingContext2D,
  coverImg: HTMLImageElement,
  edgeImg: HTMLImageElement | null,
  trimSize: { width: number; height: number },
  spineWidth: number,
  bookType: 'paperback' | 'hardcover'
) {
  // Calculate book dimensions in pixels
  const pixelsPerInch = 45;
  const bookWidth = trimSize.width * pixelsPerInch;
  const bookHeight = trimSize.height * pixelsPerInch;
  const edgeDepth = Math.max(spineWidth * pixelsPerInch, 12); // Page thickness

  // Canvas center
  const centerX = 400;
  const centerY = 280;

  // Rotation angle (degrees) - adjust this to change the view angle
  const rotationAngle = 45; // Degrees - book rotated to show right edge (like reference image)
  const tiltAngle = 0; // No tilt - straight-on view
  const angleRad = (rotationAngle * Math.PI) / 180;

  // Clear canvas
  ctx.clearRect(0, 0, 800, 600);

  // Calculate the 3D coordinates of the book corners
  // The book is centered, then rotated
  const halfWidth = bookWidth / 2;
  const halfHeight = bookHeight / 2;

  // Define 8 corners of the book box (before rotation)
  // Front face corners
  const frontTopLeft = { x: -halfWidth, y: -halfHeight, z: edgeDepth };
  const frontTopRight = { x: halfWidth, y: -halfHeight, z: edgeDepth };
  const frontBottomLeft = { x: -halfWidth, y: halfHeight, z: edgeDepth };
  const frontBottomRight = { x: halfWidth, y: halfHeight, z: edgeDepth };

  // Back face corners
  const backTopLeft = { x: -halfWidth, y: -halfHeight, z: 0 };
  const backTopRight = { x: halfWidth, y: -halfHeight, z: 0 };
  const backBottomLeft = { x: -halfWidth, y: halfHeight, z: 0 };
  const backBottomRight = { x: halfWidth, y: halfHeight, z: 0 };

  // Function to rotate and project 3D point to 2D with perspective
  const project = (point: {x: number, y: number, z: number}) => {
    // Rotate around Y axis
    const rotatedX = point.x * Math.cos(angleRad) - point.z * Math.sin(angleRad);
    const rotatedZ = point.x * Math.sin(angleRad) + point.z * Math.cos(angleRad);
    const rotatedY = point.y;

    // Add perspective projection
    // Objects with POSITIVE Z (closer) appear larger
    // Objects with NEGATIVE Z (farther) appear smaller
    const perspective = 1200; // Distance from camera
    const scale = perspective / (perspective - rotatedZ);

    return {
      x: centerX + rotatedX * scale,
      y: centerY + rotatedY * scale
    };
  };

  // Project all corners
  const p = {
    ftl: project(frontTopLeft),
    ftr: project(frontTopRight),
    fbl: project(frontBottomLeft),
    fbr: project(frontBottomRight),
    btl: project(backTopLeft),
    btr: project(backTopRight),
    bbl: project(backBottomLeft),
    bbr: project(backBottomRight),
  };

  // Draw shadow (below the book, like the reference image)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  const shadowOffsetX = -10;
  const shadowOffsetY = 60;
  const shadowWidth = bookWidth * 0.55;
  const shadowHeight = 45;

  // Elliptical shadow stretched and angled
  ctx.ellipse(
    centerX + shadowOffsetX,
    centerY + halfHeight + shadowOffsetY,
    shadowWidth,
    shadowHeight,
    -angleRad * 0.4,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  // === Draw the 3D book faces ===
  // Order: back to front

  // 1. Back cover edge (barely visible dark strip on left)
  ctx.save();
  ctx.fillStyle = '#1a202c';
  ctx.beginPath();
  ctx.moveTo(p.btl.x, p.btl.y);
  ctx.lineTo(p.btr.x, p.btr.y);
  ctx.lineTo(p.bbr.x, p.bbr.y);
  ctx.lineTo(p.bbl.x, p.bbl.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Top edge (with edge design)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p.ftl.x, p.ftl.y);
  ctx.lineTo(p.ftr.x, p.ftr.y);
  ctx.lineTo(p.btr.x, p.btr.y);
  ctx.lineTo(p.btl.x, p.btl.y);
  ctx.closePath();

  if (edgeImg) {
    ctx.save();
    ctx.clip();
    const topWidth = p.ftr.x - p.ftl.x;
    const topDepth = p.btl.y - p.ftl.y;
    ctx.drawImage(edgeImg, p.ftl.x, p.btl.y, topWidth, topDepth + 10);
    ctx.restore();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fill();
  } else {
    ctx.fillStyle = '#f0ece0';
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fill();
  }
  ctx.restore();

  // 3. Right edge (page edge - THE MAIN FEATURE!)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p.ftr.x, p.ftr.y);
  ctx.lineTo(p.fbr.x, p.fbr.y);
  ctx.lineTo(p.bbr.x, p.bbr.y);
  ctx.lineTo(p.btr.x, p.btr.y);
  ctx.closePath();

  if (edgeImg) {
    ctx.save();
    ctx.clip();

    // Draw edge image tiled vertically
    const edgeWidth = p.btr.x - p.ftr.x;
    const edgeHeight = bookHeight;
    const edgeImgAspect = edgeImg.width / edgeImg.height;
    const numTiles = Math.ceil(edgeHeight / (edgeWidth / edgeImgAspect));

    for (let i = 0; i < numTiles; i++) {
      const tileHeight = edgeWidth / edgeImgAspect;
      ctx.drawImage(
        edgeImg,
        p.ftr.x,
        p.ftr.y + i * tileHeight,
        edgeWidth,
        tileHeight
      );
    }

    ctx.restore();

    // Add gradient overlay for depth
    const gradient = ctx.createLinearGradient(p.ftr.x, 0, p.btr.x, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
    ctx.fillStyle = gradient;
    ctx.fill();
  } else {
    // Default page color
    const pageGradient = ctx.createLinearGradient(p.ftr.x, 0, p.btr.x, 0);
    pageGradient.addColorStop(0, '#f7f3e9');
    pageGradient.addColorStop(0.5, '#ffffff');
    pageGradient.addColorStop(1, '#ebe7da');
    ctx.fillStyle = pageGradient;
    ctx.fill();
  }

  // Edge outline
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // 4. Front cover (with cover image - perspective warped)
  ctx.save();

  // Add shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 12;
  ctx.shadowOffsetY = 8;

  // Use proper perspective texture mapping with bilinear interpolation
  // This maps a rectangular image to a quadrilateral (4-point polygon)

  // Create a high-res temporary canvas for the warped image
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return;

  // Set size to the bounding box of our quad
  const minX = Math.min(p.ftl.x, p.fbl.x);
  const maxX = Math.max(p.ftr.x, p.fbr.x);
  const minY = Math.min(p.ftl.y, p.ftr.y);
  const maxY = Math.max(p.fbl.y, p.fbr.y);

  const width = maxX - minX;
  const height = maxY - minY;

  tempCanvas.width = width;
  tempCanvas.height = height;

  // Get source image data
  const srcCanvas = document.createElement('canvas');
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return;
  srcCanvas.width = coverImg.width;
  srcCanvas.height = coverImg.height;
  srcCtx.drawImage(coverImg, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, coverImg.width, coverImg.height);

  // Create destination image data
  const destImageData = tempCtx.createImageData(tempCanvas.width, tempCanvas.height);

  // Quad corners in destination space (relative to temp canvas)
  const quad = {
    tl: { x: p.ftl.x - minX, y: p.ftl.y - minY },
    tr: { x: p.ftr.x - minX, y: p.ftr.y - minY },
    bl: { x: p.fbl.x - minX, y: p.fbl.y - minY },
    br: { x: p.fbr.x - minX, y: p.fbr.y - minY }
  };

  // Map each pixel in the destination quad to the source rectangle
  // Using bilinear interpolation for smooth mapping
  for (let y = 0; y < tempCanvas.height; y++) {
    for (let x = 0; x < tempCanvas.width; x++) {
      // Check if this pixel is inside our quad using barycentric coordinates
      if (!isPointInQuad(x, y, quad)) continue;

      // Find the normalized position (u, v) in the quad (0-1 range)
      const uv = quadToUV(x, y, quad);
      if (!uv) continue;

      // Map to source image coordinates
      const srcX = uv.u * (coverImg.width - 1);
      const srcY = uv.v * (coverImg.height - 1);

      // Bilinear interpolation for smooth sampling
      const color = bilinearSample(srcImageData, srcX, srcY, coverImg.width, coverImg.height);

      // Set pixel in destination
      const destIdx = (y * tempCanvas.width + x) * 4;
      destImageData.data[destIdx] = color.r;
      destImageData.data[destIdx + 1] = color.g;
      destImageData.data[destIdx + 2] = color.b;
      destImageData.data[destIdx + 3] = color.a;
    }
  }

  tempCtx.putImageData(destImageData, 0, 0);

  // Draw the warped image to the main canvas
  ctx.shadowColor = 'transparent';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tempCanvas, minX, minY);

  // Add glossy highlight for hardcover
  if (bookType === 'hardcover') {
    ctx.shadowColor = 'transparent';

    // Create quadrilateral path for highlight
    ctx.beginPath();
    ctx.moveTo(p.ftl.x, p.ftl.y);
    ctx.lineTo(p.ftr.x, p.ftr.y);
    ctx.lineTo(p.fbr.x, p.fbr.y);
    ctx.lineTo(p.fbl.x, p.fbl.y);
    ctx.closePath();
    ctx.clip();

    const highlight = ctx.createLinearGradient(
      p.ftl.x,
      p.ftl.y,
      p.ftl.x + topWidth * 0.4,
      p.ftl.y + leftHeight * 0.4
    );
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlight;
    ctx.fill();
  }

  ctx.restore();

  // 5. Cover border
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p.ftl.x, p.ftl.y);
  ctx.lineTo(p.ftr.x, p.ftr.y);
  ctx.lineTo(p.fbr.x, p.fbr.y);
  ctx.lineTo(p.fbl.x, p.fbl.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
