import { createClient } from '@supabase/supabase-js';

// PDF constants - must match the values in the PDF processing functions
const BLEED_INCHES = 0.125;
const SAFETY_BUFFER_INCHES = 0.125;
const POINTS_PER_INCH = 72;
const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH; // 9 points
const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH; // 9 points
const EDGE_STRIP_SIZE = BLEED_POINTS + SAFETY_BUFFER_POINTS; // 18 points (0.25 inches)

// Paper thickness configuration
const PAPER_THICKNESS = {
  'bw': 0.0035,        // Standard thickness for all paper types
  'standard': 0.0035,  // 0.0035 inches
  'premium': 0.0035    // Using same thickness for now, can be differentiated later
};

// Calculate DPI based on paper thickness for proper edge image resolution
function getEdgeImageDPI(pageType: 'bw' | 'standard' | 'premium'): number {
  const thickness = PAPER_THICKNESS[pageType];
  const dpi = 1 / thickness; // ~285.7 DPI for 0.0035" thickness
  console.log(`DPI calculation: pageType=${pageType}, thickness=${thickness}, DPI=${dpi}`);
  return dpi;
}

// Supabase client for storage operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helper function to convert PDF points to canvas pixels with dynamic DPI
function pointsToCanvasPixels(points: number, pageType: 'bw' | 'standard' | 'premium' = 'standard'): number {
  const edgeDPI = getEdgeImageDPI(pageType);
  const pixels = Math.round((points / POINTS_PER_INCH) * edgeDPI);
  console.log(`Points to pixels: ${points}pt → ${pixels}px (${points/POINTS_PER_INCH}" × ${edgeDPI}DPI)`);
  return pixels;
}

// Calculate which leaves have actual content vs should be skipped
function calculateContentRange(
  samplingRegion: { x: number; y: number; width: number; height: number },
  numLeaves: number,
  orientation: 'vertical' | 'horizontal',
  scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'
): { start: number; end: number; effectiveLeaves: number } {
  // For 'stretch' and 'fill': all leaves have content
  if (scaleMode === 'stretch' || scaleMode === 'fill') {
    return { start: 0, end: numLeaves - 1, effectiveLeaves: numLeaves };
  }

  // For 'extend-sides': calculate fit content range, then extend to fill all leaves
  if (scaleMode === 'extend-sides') {
    // Calculate how many leaves would fit within the sampling region (like 'fit' mode)
    const effectiveLeaves = orientation === 'vertical'
      ? Math.min(samplingRegion.width, numLeaves)
      : Math.min(samplingRegion.height, numLeaves);

    // Center the content within the total number of leaves
    const contentStart = Math.floor((numLeaves - effectiveLeaves) / 2);
    const contentEnd = contentStart + effectiveLeaves - 1;

    return { start: contentStart, end: contentEnd, effectiveLeaves };
  }

  // For 'fit' and 'none': calculate actual content range
  if (orientation === 'vertical') {
    // For side edges: sampling region width determines content range
    const effectiveLeaves = Math.min(samplingRegion.width, numLeaves);
    const start = 0;
    const end = Math.max(0, effectiveLeaves - 1);
    return { start, end, effectiveLeaves };
  } else {
    // For top/bottom edges: sampling region height determines content range
    const effectiveLeaves = Math.min(samplingRegion.height, numLeaves);
    const start = 0;
    const end = Math.max(0, effectiveLeaves - 1);
    return { start, end, effectiveLeaves };
  }
}

export interface SlicedEdgeImages {
  side?: string[];
  top?: string[];
  bottom?: string[];
}

export interface SliceStoragePaths {
  side?: {
    raw: string[];
    masked: string[];
  };
  top?: {
    raw: string[];
    masked: string[];
  };
  bottom?: {
    raw: string[];
    masked: string[];
  };
}

export interface EdgeSlicingOptions {
  numPages: number;
  pageType: 'bw' | 'standard' | 'premium';
  edgeType: 'side-only' | 'all-edges';
  trimWidth: number;
  trimHeight: number;
  scaleMode?: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides';
  centerMode?: 'start' | 'center' | 'end';
  pdfDimensions?: { width: number; height: number };
}

// Legacy function - will be replaced by createRawSlices + applyTriangleMasks
export async function sliceEdgeImages(
  edgeImages: {
    side?: { base64: string };
    top?: { base64: string };
    bottom?: { base64: string };
  },
  options: EdgeSlicingOptions
): Promise<SlicedEdgeImages> {
  // Calculate number of leaves (pages ÷ 2)
  // Each leaf requires 1 pixel from the edge image
  // For optimal results: edge image width/height should be ≥ numLeaves pixels
  const numLeaves = Math.ceil(options.numPages / 2);

  const slicedImages: SlicedEdgeImages = {};

  if (edgeImages.side && (options.edgeType === 'side-only' || options.edgeType === 'all-edges')) {
    slicedImages.side = await sliceImage(
      edgeImages.side.base64,
      numLeaves,
      'vertical',
      options.scaleMode || 'fill',
      options.centerMode || 'center',
      undefined, // No edge type for sides
      options.pdfDimensions,
      options.pageType
    );
  }

  if (options.edgeType === 'all-edges') {
    if (edgeImages.top) {
      slicedImages.top = await sliceImage(
        edgeImages.top.base64,
        numLeaves,
        'horizontal',
        options.scaleMode || 'fill',
        options.centerMode || 'center',
        'top',
        options.pdfDimensions,
        options.pageType
      );
    }

    if (edgeImages.bottom) {
      slicedImages.bottom = await sliceImage(
        edgeImages.bottom.base64,
        numLeaves,
        'horizontal',
        options.scaleMode || 'fill',
        options.centerMode || 'center',
        'bottom',
        options.pdfDimensions,
        options.pageType
      );
    }
  }

  return slicedImages;
}

// NEW: Create raw slices without triangle masks
export async function createRawSlices(
  edgeImages: {
    side?: { base64: string };
    top?: { base64: string };
    bottom?: { base64: string };
  },
  options: EdgeSlicingOptions
): Promise<SlicedEdgeImages> {
  const numLeaves = Math.ceil(options.numPages / 2);
  const rawSlices: SlicedEdgeImages = {};

  if (edgeImages.side && (options.edgeType === 'side-only' || options.edgeType === 'all-edges')) {
    rawSlices.side = await createRawSliceImage(
      edgeImages.side.base64,
      numLeaves,
      'vertical',
      options.scaleMode || 'fill',
      options.centerMode || 'center',
      options.pdfDimensions,
      options.pageType
    );
  }

  if (options.edgeType === 'all-edges') {
    if (edgeImages.top) {
      rawSlices.top = await createRawSliceImage(
        edgeImages.top.base64,
        numLeaves,
        'horizontal',
        options.scaleMode || 'fill',
        options.centerMode || 'center',
        options.pdfDimensions,
        options.pageType,
        'top'  // Pass edge type for reverse slicing
      );
    }

    if (edgeImages.bottom) {
      rawSlices.bottom = await createRawSliceImage(
        edgeImages.bottom.base64,
        numLeaves,
        'horizontal',
        options.scaleMode || 'fill',
        options.centerMode || 'center',
        options.pdfDimensions,
        options.pageType,
        'bottom'  // Pass edge type for normal slicing
      );
    }
  }

  return rawSlices;
}

// Create raw slices from pre-scaled images (simplified since scaling is already done)
async function createRawSlicesFromScaledImages(
  scaledEdgeImages: {
    side?: { base64: string };
    top?: { base64: string };
    bottom?: { base64: string };
  },
  options: EdgeSlicingOptions
): Promise<SlicedEdgeImages> {
  const numLeaves = Math.ceil(options.numPages / 2);
  const rawSlices: SlicedEdgeImages = {};

  if (scaledEdgeImages.side) {
    rawSlices.side = await createSimplifiedSlices(
      scaledEdgeImages.side.base64,
      numLeaves,
      'vertical',
      options.pdfDimensions,
      options.pageType
    );
  }

  if (scaledEdgeImages.top) {
    rawSlices.top = await createSimplifiedSlices(
      scaledEdgeImages.top.base64,
      numLeaves,
      'horizontal',
      options.pdfDimensions,
      options.pageType,
      'top'  // Pass edge type for reverse slicing
    );
  }

  if (scaledEdgeImages.bottom) {
    rawSlices.bottom = await createSimplifiedSlices(
      scaledEdgeImages.bottom.base64,
      numLeaves,
      'horizontal',
      options.pdfDimensions,
      options.pageType,
      'bottom'  // Pass edge type for normal slicing
    );
  }

  return rawSlices;
}

// Simplified slicing function for pre-scaled images
async function createSimplifiedSlices(
  scaledBase64: string,
  numLeaves: number,
  orientation: 'vertical' | 'horizontal',
  pdfDimensions?: { width: number; height: number },
  pageType: 'bw' | 'standard' | 'premium' = 'standard',
  edgeType?: 'top' | 'bottom'
): Promise<string[]> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();

        // Add timeout for image loading
        const timeout = setTimeout(() => {
          reject(new Error('Image loading timeout'));
        }, 30000); // 30 second timeout

        img.onload = () => {
          clearTimeout(timeout);
          try {
            const slices: string[] = [];

            // The image is already scaled to the correct dimensions
            // For vertical: width = numLeaves, height = book height in pixels
            // For horizontal: width = book width in pixels, height = numLeaves

            for (let leafIndex = 0; leafIndex < numLeaves; leafIndex++) {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d')!;
              ctx.imageSmoothingEnabled = false;

              // Set canvas size for the final edge strip
              if (orientation === 'vertical') {
                // For side edges: edge strip width × full page height
                canvas.width = pointsToCanvasPixels(EDGE_STRIP_SIZE, pageType);
                canvas.height = pdfDimensions ? pointsToCanvasPixels(pdfDimensions.height, pageType) : img.height;

                // Extract 1 pixel wide slice from the scaled image
                const sourceX = Math.min(leafIndex, img.width - 1);

                // Replicate this slice across the edge strip width
                for (let x = 0; x < canvas.width; x++) {
                  ctx.drawImage(
                    img,
                    sourceX, 0, 1, img.height,  // Source: 1px wide slice
                    x, 0, 1, canvas.height      // Destination: replicate across width
                  );
                }
              } else {
                // For top/bottom edges: full page width × edge strip height
                canvas.width = pdfDimensions ? pointsToCanvasPixels(pdfDimensions.width, pageType) : img.width;
                canvas.height = pointsToCanvasPixels(EDGE_STRIP_SIZE, pageType);

                // Extract 1 pixel high slice from the scaled image
                // For top edge: slice from bottom to top (reverse order)
                // For bottom edge: slice from top to bottom (normal order)
                const sourceY = edgeType === 'top'
                  ? Math.min((numLeaves - 1) - leafIndex, img.height - 1)  // Reverse for top
                  : Math.min(leafIndex, img.height - 1);                   // Normal for bottom

                // Replicate this slice across the edge strip height
                for (let y = 0; y < canvas.height; y++) {
                  ctx.drawImage(
                    img,
                    0, sourceY, img.width, 1,   // Source: 1px high slice
                    0, y, canvas.width, 1       // Destination: replicate across height
                  );
                }
              }

              // Convert to base64
              slices.push(canvas.toDataURL('image/png').split(',')[1]);
            }

            resolve(slices);
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load scaled image for slicing'));
        };

        img.src = `data:image/png;base64,${scaledBase64}`;
      });
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Slice creation failed (attempt ${retryCount}/${maxRetries}):`, errorMessage);

      if (retryCount >= maxRetries) {
        throw new Error(`Failed to create slices after ${maxRetries} attempts: ${errorMessage}`);
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1), 4000);
      console.log(`Retrying in ${backoffTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }

  throw new Error('Failed to create slices after all retry attempts');
}

// NEW: Apply triangle masks to existing slice images
export async function applyTriangleMasks(
  rawSlices: SlicedEdgeImages,
  options: EdgeSlicingOptions
): Promise<SlicedEdgeImages> {
  const maskedSlices: SlicedEdgeImages = {};

  // Apply masks to side edges (no triangle masks needed)
  if (rawSlices.side) {
    maskedSlices.side = [...rawSlices.side]; // No masking needed for sides
  }

  // Apply triangle masks to top/bottom edges
  if (rawSlices.top) {
    maskedSlices.top = await applyTriangleMaskToSlices(rawSlices.top, 'top', options);
  }

  if (rawSlices.bottom) {
    maskedSlices.bottom = await applyTriangleMaskToSlices(rawSlices.bottom, 'bottom', options);
  }

  return maskedSlices;
}

// Scale edge image to book dimensions before slicing
export async function scaleEdgeImageToBookDimensions(
  base64Image: string,
  targetDimensions: {
    width: number;
    height: number;
  },
  scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'
): Promise<string> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();

        // Add timeout for image loading
        const timeout = setTimeout(() => {
          reject(new Error('Image scaling timeout'));
        }, 30000); // 30 second timeout

        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            // Set target canvas dimensions
            canvas.width = targetDimensions.width;
            canvas.height = targetDimensions.height;

            // Clear canvas with transparent background
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;

            let drawX = 0;
            let drawY = 0;
            let drawWidth = canvas.width;
            let drawHeight = canvas.height;

            switch (scaleMode) {
              case 'stretch':
                // Stretch to fill entire canvas (current behavior)
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                break;

              case 'fit':
                // Scale to fit within canvas while maintaining aspect ratio
                const fitScale = Math.min(canvas.width / img.width, canvas.height / img.height);
                drawWidth = img.width * fitScale;
                drawHeight = img.height * fitScale;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = (canvas.height - drawHeight) / 2;
                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
                break;

              case 'fill':
                // Scale to fill canvas while maintaining aspect ratio (may crop)
                const fillScale = Math.max(canvas.width / img.width, canvas.height / img.height);
                drawWidth = img.width * fillScale;
                drawHeight = img.height * fillScale;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = (canvas.height - drawHeight) / 2;
                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
                break;

              case 'none':
                // Use image at original size, centered
                drawWidth = Math.min(img.width, canvas.width);
                drawHeight = Math.min(img.height, canvas.height);
                drawX = (canvas.width - drawWidth) / 2;
                drawY = (canvas.height - drawHeight) / 2;

                // Calculate source coordinates to center-crop the original image
                const sourceX = (img.width - drawWidth) / 2;
                const sourceY = (img.height - drawHeight) / 2;

                ctx.drawImage(img, sourceX, sourceY, drawWidth, drawHeight, drawX, drawY, drawWidth, drawHeight);
                break;

              case 'extend-sides':
                // Apply 'fit' logic first to get centered content
                const extendFitScale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const fittedWidth = img.width * extendFitScale;
                const fittedHeight = img.height * extendFitScale;
                const fittedX = (canvas.width - fittedWidth) / 2;
                const fittedY = (canvas.height - fittedHeight) / 2;

                // Draw the fitted content
                ctx.drawImage(img, fittedX, fittedY, fittedWidth, fittedHeight);

                // Extend edges to fill remaining space
                if (fittedX > 0) {
                  // Extend left edge
                  ctx.drawImage(img, 0, 0, 1, img.height, 0, fittedY, fittedX, fittedHeight);
                  // Extend right edge
                  ctx.drawImage(img, img.width - 1, 0, 1, img.height, fittedX + fittedWidth, fittedY, canvas.width - fittedX - fittedWidth, fittedHeight);
                }
                if (fittedY > 0) {
                  // Extend top edge
                  ctx.drawImage(img, 0, 0, img.width, 1, fittedX, 0, fittedWidth, fittedY);
                  // Extend bottom edge
                  ctx.drawImage(img, 0, img.height - 1, img.width, 1, fittedX, fittedY + fittedHeight, fittedWidth, canvas.height - fittedY - fittedHeight);
                }
                break;
            }

            // Convert to base64
            const scaledBase64 = canvas.toDataURL('image/png').split(',')[1];
            resolve(scaledBase64);
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load image for scaling'));
        };

        img.src = `data:image/png;base64,${base64Image}`;
      });
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Image scaling failed (attempt ${retryCount}/${maxRetries}):`, errorMessage);

      if (retryCount >= maxRetries) {
        throw new Error(`Failed to scale image after ${maxRetries} attempts: ${errorMessage}`);
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1), 4000);
      console.log(`Retrying in ${backoffTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }

  throw new Error('Failed to scale image after all retry attempts');
}

// NEW: Two-stage processing with Supabase storage integration
// NEW: Create and store slices permanently for a design (for regeneration)
export async function createAndStoreDesignSlices(
  edgeImages: {
    side?: { base64: string };
    top?: { base64: string } | { color: string };
    bottom?: { base64: string } | { color: string };
  },
  options: EdgeSlicingOptions,
  designId: string,
  userId: string
): Promise<SliceStoragePaths> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  // Use design-based paths for permanent storage
  const designBasePath = `users/${userId}/designs/${designId}`;

  // Calculate target dimensions for each edge type
  const numLeaves = Math.ceil(options.numPages / 2);

  // Pre-scale images to book dimensions before slicing (same as createAndStoreRawSlices)
  const scaledEdgeImages: {
    side?: { base64: string };
    top?: { base64: string };
    bottom?: { base64: string };
  } = {};

  if (edgeImages.side && options.pdfDimensions) {
    const targetHeight = pointsToCanvasPixels(options.pdfDimensions.height, options.pageType);
    const targetWidth = numLeaves; // 1 pixel per leaf for slicing

    console.log(`Scaling side edge image to: ${targetWidth} × ${targetHeight}`);
    scaledEdgeImages.side = {
      base64: await scaleEdgeImageToBookDimensions(
        edgeImages.side.base64,
        { width: targetWidth, height: targetHeight },
        options.scaleMode || 'fill'
      )
    };
  }

  if (edgeImages.top && options.pdfDimensions) {
    if ('color' in edgeImages.top) {
      // It's a color - create a solid color image
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Creating top edge color slice: ${targetWidth} × ${targetHeight}, color: ${edgeImages.top.color}`);
      scaledEdgeImages.top = {
        base64: await createColorImage(targetWidth, targetHeight, edgeImages.top.color)
      };
    } else {
      // It's an image - scale normally
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Scaling top edge image to: ${targetWidth} × ${targetHeight}`);
      scaledEdgeImages.top = {
        base64: await scaleEdgeImageToBookDimensions(
          edgeImages.top.base64,
          { width: targetWidth, height: targetHeight },
          options.scaleMode || 'fill'
        )
      };
    }
  }

  if (edgeImages.bottom && options.pdfDimensions) {
    if ('color' in edgeImages.bottom) {
      // It's a color - create a solid color image
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Creating bottom edge color slice: ${targetWidth} × ${targetHeight}, color: ${edgeImages.bottom.color}`);
      scaledEdgeImages.bottom = {
        base64: await createColorImage(targetWidth, targetHeight, edgeImages.bottom.color)
      };
    } else {
      // It's an image - scale normally
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Scaling bottom edge image to: ${targetWidth} × ${targetHeight}`);
      scaledEdgeImages.bottom = {
        base64: await scaleEdgeImageToBookDimensions(
          edgeImages.bottom.base64,
          { width: targetWidth, height: targetHeight },
          options.scaleMode || 'fill'
        )
      };
    }
  }

  // Create raw slices from pre-scaled images (no scale mode needed now)
  const rawSlices = await createRawSlicesFromScaledImages(scaledEdgeImages, options);

  // Upload raw slices with design-based paths
  const storagePaths: SliceStoragePaths = {};

  if (rawSlices.side) {
    storagePaths.side = { raw: [], masked: [] };
    console.log(`Storing ${rawSlices.side.length} raw side slices for design ${designId}...`);

    const uploadPromises = rawSlices.side.map(async (slice, i) => {
      const path = `${designBasePath}/slices/raw/side_${i}.png`;
      const bytes = base64ToUint8Array(slice);

      const { error } = await supabase.storage
        .from('edge-images')
        .upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) throw new Error(`Failed to store side slice ${i}: ${error.message}`);
      return { index: i, path };
    });

    const results = await Promise.all(uploadPromises);
    results.sort((a, b) => a.index - b.index);
    storagePaths.side.raw = results.map(r => r.path);
    console.log(`✓ Stored ${results.length} raw side slices`);
  }

  if (rawSlices.top) {
    storagePaths.top = { raw: [], masked: [] };
    console.log(`Storing ${rawSlices.top.length} raw top slices for design ${designId}...`);

    const uploadPromises = rawSlices.top.map(async (slice, i) => {
      const path = `${designBasePath}/slices/raw/top_${i}.png`;
      const bytes = base64ToUint8Array(slice);

      const { error } = await supabase.storage
        .from('edge-images')
        .upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) throw new Error(`Failed to store top slice ${i}: ${error.message}`);
      return { index: i, path };
    });

    const results = await Promise.all(uploadPromises);
    results.sort((a, b) => a.index - b.index);
    storagePaths.top.raw = results.map(r => r.path);
    console.log(`✓ Stored ${results.length} raw top slices`);
  }

  if (rawSlices.bottom) {
    storagePaths.bottom = { raw: [], masked: [] };
    console.log(`Storing ${rawSlices.bottom.length} raw bottom slices for design ${designId}...`);

    const uploadPromises = rawSlices.bottom.map(async (slice, i) => {
      const path = `${designBasePath}/slices/raw/bottom_${i}.png`;
      const bytes = base64ToUint8Array(slice);

      const { error } = await supabase.storage
        .from('edge-images')
        .upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) throw new Error(`Failed to store bottom slice ${i}: ${error.message}`);
      return { index: i, path };
    });

    const results = await Promise.all(uploadPromises);
    results.sort((a, b) => a.index - b.index);
    storagePaths.bottom.raw = results.map(r => r.path);
    console.log(`✓ Stored ${results.length} raw bottom slices`);
  }

  console.log(`Raw slices stored for design ${designId}:`, {
    side: storagePaths.side?.raw.length || 0,
    top: storagePaths.top?.raw.length || 0,
    bottom: storagePaths.bottom?.raw.length || 0
  });

  return storagePaths;
}

// NEW: Create and store masked slices permanently for a design
export async function createAndStoreDesignMaskedSlices(
  rawSlicesPaths: SliceStoragePaths,
  options: EdgeSlicingOptions,
  designId: string,
  userId: string
): Promise<SliceStoragePaths> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const designBasePath = `users/${userId}/designs/${designId}`;

  // Apply triangle masks to the raw slices
  const maskedSlicesPaths: SliceStoragePaths = JSON.parse(JSON.stringify(rawSlicesPaths)); // Deep copy

  // Process side slices if they exist
  if (rawSlicesPaths.side?.raw) {
    maskedSlicesPaths.side!.masked = [];
    console.log(`Creating masked side slices for design ${designId}...`);

    const maskPromises = rawSlicesPaths.side.raw.map(async (rawPath, i) => {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const { data: rawSliceData, error: downloadError } = await supabase.storage
            .from('edge-images')
            .download(rawPath);

          if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

          const buffer = await rawSliceData.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const base64 = btoa(String.fromCharCode(...bytes));

          const maskedBase64 = await applyTriangleMaskToSlice(base64, 'side');
          const maskedBytes = base64ToUint8Array(maskedBase64);

          const maskedPath = `${designBasePath}/slices/masked/side_${i}.png`;
          const { error: uploadError } = await supabase.storage
            .from('edge-images')
            .upload(maskedPath, maskedBytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (uploadError) {
            // Log full error object for debugging
            console.error(`Upload error for side slice ${i}:`, JSON.stringify(uploadError, null, 2));
            throw new Error(`Upload failed: ${JSON.stringify(uploadError)}`);
          }
          return { index: i, path: maskedPath };
        } catch (error) {
          retryCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`Error processing side slice ${i} (attempt ${retryCount}/${maxRetries}):`, errorMsg);

          if (retryCount >= maxRetries) {
            throw new Error(`Failed to process side slice ${i} after ${maxRetries} attempts: ${errorMsg}`);
          }
          console.warn(`Retry ${retryCount}/${maxRetries} for side slice ${i}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    });

    const results = await Promise.all(maskPromises);
    results.sort((a, b) => a.index - b.index);
    maskedSlicesPaths.side!.masked = results.map(r => r.path);
    console.log(`✓ Stored ${results.length} masked side slices`);
  }

  // Process top slices if they exist
  if (rawSlicesPaths.top?.raw && options.edgeType === 'all-edges') {
    maskedSlicesPaths.top!.masked = [];
    console.log(`Creating masked top slices for design ${designId}...`);

    const maskPromises = rawSlicesPaths.top.raw.map(async (rawPath, i) => {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const { data: rawSliceData, error: downloadError } = await supabase.storage
            .from('edge-images')
            .download(rawPath);

          if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

          const buffer = await rawSliceData.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const base64 = btoa(String.fromCharCode(...bytes));

          const maskedBase64 = await applyTriangleMaskToSlice(base64, 'top');
          const maskedBytes = base64ToUint8Array(maskedBase64);

          const maskedPath = `${designBasePath}/slices/masked/top_${i}.png`;
          const { error: uploadError } = await supabase.storage
            .from('edge-images')
            .upload(maskedPath, maskedBytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
          return { index: i, path: maskedPath };
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to download raw top slice ${i} after ${maxRetries} attempts: ${error.message}`);
          }
          console.warn(`Retry ${retryCount}/${maxRetries} for top slice ${i}:`, error.message);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    });

    const results = await Promise.all(maskPromises);
    results.sort((a, b) => a.index - b.index);
    maskedSlicesPaths.top!.masked = results.map(r => r.path);
    console.log(`✓ Stored ${results.length} masked top slices`);
  }

  // Process bottom slices if they exist
  if (rawSlicesPaths.bottom?.raw && options.edgeType === 'all-edges') {
    maskedSlicesPaths.bottom!.masked = [];
    console.log(`Creating masked bottom slices for design ${designId}...`);

    const maskPromises = rawSlicesPaths.bottom.raw.map(async (rawPath, i) => {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const { data: rawSliceData, error: downloadError } = await supabase.storage
            .from('edge-images')
            .download(rawPath);

          if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

          const buffer = await rawSliceData.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const base64 = btoa(String.fromCharCode(...bytes));

          const maskedBase64 = await applyTriangleMaskToSlice(base64, 'bottom');
          const maskedBytes = base64ToUint8Array(maskedBase64);

          const maskedPath = `${designBasePath}/slices/masked/bottom_${i}.png`;
          const { error: uploadError } = await supabase.storage
            .from('edge-images')
            .upload(maskedPath, maskedBytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
          return { index: i, path: maskedPath };
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to download raw bottom slice ${i} after ${maxRetries} attempts: ${error.message}`);
          }
          console.warn(`Retry ${retryCount}/${maxRetries} for bottom slice ${i}:`, error.message);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    });

    const results = await Promise.all(maskPromises);
    results.sort((a, b) => a.index - b.index);
    maskedSlicesPaths.bottom!.masked = results.map(r => r.path);
    console.log(`✓ Stored ${results.length} masked bottom slices`);
  }

  console.log(`Masked slices stored for design ${designId}:`, {
    side: maskedSlicesPaths.side?.masked.length || 0,
    top: maskedSlicesPaths.top?.masked.length || 0,
    bottom: maskedSlicesPaths.bottom?.masked.length || 0
  });

  return maskedSlicesPaths;
}

export async function createAndStoreRawSlices(
  edgeImages: {
    side?: { base64: string };
    top?: { base64: string } | { color: string };
    bottom?: { base64: string } | { color: string };
  },
  options: EdgeSlicingOptions,
  sessionId: string
): Promise<SliceStoragePaths> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  // Calculate target dimensions for each edge type
  const numLeaves = Math.ceil(options.numPages / 2);
  const edgeDPI = getEdgeImageDPI(options.pageType);

  // Pre-scale images to book dimensions before slicing
  const scaledEdgeImages: {
    side?: { base64: string };
    top?: { base64: string };
    bottom?: { base64: string };
  } = {};

  if (edgeImages.side && options.pdfDimensions) {
    const targetHeight = pointsToCanvasPixels(options.pdfDimensions.height, options.pageType);
    const targetWidth = numLeaves; // 1 pixel per leaf for slicing

    console.log(`Scaling side edge image to: ${targetWidth} × ${targetHeight}`);
    scaledEdgeImages.side = {
      base64: await scaleEdgeImageToBookDimensions(
        edgeImages.side.base64,
        { width: targetWidth, height: targetHeight },
        options.scaleMode || 'fill'
      )
    };
  }

  if (edgeImages.top && options.pdfDimensions) {
    if ('color' in edgeImages.top) {
      // It's a color - create a solid color image
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Creating top edge color slice: ${targetWidth} × ${targetHeight}, color: ${edgeImages.top.color}`);
      scaledEdgeImages.top = {
        base64: await createColorImage(targetWidth, targetHeight, edgeImages.top.color)
      };
    } else {
      // It's an image - scale normally
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Scaling top edge image to: ${targetWidth} × ${targetHeight}`);
      scaledEdgeImages.top = {
        base64: await scaleEdgeImageToBookDimensions(
          edgeImages.top.base64,
          { width: targetWidth, height: targetHeight },
          options.scaleMode || 'fill'
        )
      };
    }
  }

  if (edgeImages.bottom && options.pdfDimensions) {
    if ('color' in edgeImages.bottom) {
      // It's a color - create a solid color image
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Creating bottom edge color slice: ${targetWidth} × ${targetHeight}, color: ${edgeImages.bottom.color}`);
      scaledEdgeImages.bottom = {
        base64: await createColorImage(targetWidth, targetHeight, edgeImages.bottom.color)
      };
    } else {
      // It's an image - scale normally
      const targetWidth = pointsToCanvasPixels(options.pdfDimensions.width, options.pageType);
      const targetHeight = numLeaves; // 1 pixel per leaf for slicing

      console.log(`Scaling bottom edge image to: ${targetWidth} × ${targetHeight}`);
      scaledEdgeImages.bottom = {
        base64: await scaleEdgeImageToBookDimensions(
          edgeImages.bottom.base64,
          { width: targetWidth, height: targetHeight },
          options.scaleMode || 'fill'
        )
      };
    }
  }

  // Create raw slices from pre-scaled images (no scale mode needed now)
  const rawSlices = await createRawSlicesFromScaledImages(scaledEdgeImages, options);

  // Upload raw slices to storage and track paths
  const storagePaths: SliceStoragePaths = {};

  if (rawSlices.side) {
    storagePaths.side = { raw: [], masked: [] };
    console.log(`Uploading ${rawSlices.side.length} raw side slices in batches...`);

    const uploadPromises = rawSlices.side.map(async (slice, i) => {
      const path = `${sessionId}/raw-slices/side_${i}.png`;
      const bytes = base64ToUint8Array(slice);

      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const { error } = await supabase.storage
            .from('edge-images')
            .upload(path, bytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (error) throw new Error(`Upload failed: ${error.message}`);
          return { index: i, path };
        } catch (uploadError) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to upload side slice ${i} after ${maxRetries} attempts: ${uploadError.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    });

    const results = await Promise.all(uploadPromises);

    // Sort results by index to maintain order
    results.sort((a, b) => a.index - b.index);
    storagePaths.side.raw = results.map(r => r.path);
    console.log(`✓ Uploaded ${results.length} raw side slices`);
  }

  if (rawSlices.top) {
    storagePaths.top = { raw: [], masked: [] };
    console.log(`Uploading ${rawSlices.top.length} raw top slices in parallel...`);

    const uploadPromises = rawSlices.top.map(async (slice, i) => {
      const path = `${sessionId}/raw-slices/top_${i}.png`;
      const bytes = base64ToUint8Array(slice);

      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const { error } = await supabase.storage
            .from('edge-images')
            .upload(path, bytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (error) throw new Error(`Upload failed: ${error.message}`);
          return { index: i, path };
        } catch (uploadError) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to upload top slice ${i} after ${maxRetries} attempts: ${uploadError.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    });

    const results = await Promise.all(uploadPromises);
    results.sort((a, b) => a.index - b.index);
    storagePaths.top.raw = results.map(r => r.path);
    console.log(`✓ Uploaded ${results.length} raw top slices`);
  }

  if (rawSlices.bottom) {
    storagePaths.bottom = { raw: [], masked: [] };
    console.log(`Uploading ${rawSlices.bottom.length} raw bottom slices in parallel...`);

    const uploadPromises = rawSlices.bottom.map(async (slice, i) => {
      const path = `${sessionId}/raw-slices/bottom_${i}.png`;
      const bytes = base64ToUint8Array(slice);

      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const { error } = await supabase.storage
            .from('edge-images')
            .upload(path, bytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (error) throw new Error(`Upload failed: ${error.message}`);
          return { index: i, path };
        } catch (uploadError) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to upload bottom slice ${i} after ${maxRetries} attempts: ${uploadError.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    });

    const results = await Promise.all(uploadPromises);
    results.sort((a, b) => a.index - b.index);
    storagePaths.bottom.raw = results.map(r => r.path);
    console.log(`✓ Uploaded ${results.length} raw bottom slices`);
  }

  console.log('Raw slices uploaded to storage:', storagePaths);
  return storagePaths;
}

// NEW: Apply triangle masks to stored raw slices and save masked versions
export async function createAndStoreMaskedSlices(
  rawSlicesPaths: SliceStoragePaths,
  options: EdgeSlicingOptions,
  sessionId: string
): Promise<SliceStoragePaths> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const maskedPaths: SliceStoragePaths = {
    side: rawSlicesPaths.side ? { raw: [...rawSlicesPaths.side.raw], masked: [] } : undefined,
    top: rawSlicesPaths.top ? { raw: [...rawSlicesPaths.top.raw], masked: [] } : undefined,
    bottom: rawSlicesPaths.bottom ? { raw: [...rawSlicesPaths.bottom.raw], masked: [] } : undefined
  };

  // Process side edges with triangle masks (batched for better performance)
  if (rawSlicesPaths.side) {
    const BATCH_SIZE = 10; // Process 10 slices at a time
    const totalSlices = rawSlicesPaths.side.raw.length;

    console.log(`Processing ${totalSlices} side slices in batches of ${BATCH_SIZE}`);

    for (let batchStart = 0; batchStart < totalSlices; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlices);
      const batchPromises = [];

      console.log(`Processing side slice batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(totalSlices/BATCH_SIZE)} (slices ${batchStart + 1}-${batchEnd})`);

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(processSingleMaskedSlice(rawSlicesPaths.side!.raw[i], i, sessionId, 'side'));
      }

      const batchResults = await Promise.all(batchPromises);

      // Add results in order
      for (const result of batchResults) {
        maskedPaths.side!.masked.push(result);
      }

      // Brief pause between batches to prevent overwhelming the system
      if (batchEnd < totalSlices) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Process top edges with triangle masks (batched)
  if (rawSlicesPaths.top) {
    const BATCH_SIZE = 10;
    const totalSlices = rawSlicesPaths.top.raw.length;

    console.log(`Processing ${totalSlices} top slices in batches of ${BATCH_SIZE}`);

    for (let batchStart = 0; batchStart < totalSlices; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlices);
      const batchPromises = [];

      console.log(`Processing top slice batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(totalSlices/BATCH_SIZE)} (slices ${batchStart + 1}-${batchEnd})`);

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(processSingleMaskedSlice(rawSlicesPaths.top!.raw[i], i, sessionId, 'top'));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        maskedPaths.top!.masked.push(result);
      }

      if (batchEnd < totalSlices) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Process bottom edges with triangle masks (batched)
  if (rawSlicesPaths.bottom) {
    const BATCH_SIZE = 10;
    const totalSlices = rawSlicesPaths.bottom.raw.length;

    console.log(`Processing ${totalSlices} bottom slices in batches of ${BATCH_SIZE}`);

    for (let batchStart = 0; batchStart < totalSlices; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalSlices);
      const batchPromises = [];

      console.log(`Processing bottom slice batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(totalSlices/BATCH_SIZE)} (slices ${batchStart + 1}-${batchEnd})`);

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(processSingleMaskedSlice(rawSlicesPaths.bottom!.raw[i], i, sessionId, 'bottom'));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        maskedPaths.bottom!.masked.push(result);
      }

      if (batchEnd < totalSlices) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log('Masked slices uploaded to storage:', maskedPaths);
  return maskedPaths;
}

// Helper function to process a single masked slice with error handling
async function processSingleMaskedSlice(
  rawPath: string,
  index: number,
  sessionId: string,
  edgeType: 'side' | 'top' | 'bottom'
): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      // Download raw slice from storage
      const { data: rawSliceBlob, error: downloadError } = await supabase.storage
        .from('edge-images')
        .download(rawPath);

      if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);

      // Convert blob to base64
      const rawSliceBase64 = await blobToBase64(rawSliceBlob);

      // Apply triangle mask
      const maskedBase64 = await applyTriangleMaskToSlice(rawSliceBase64, edgeType);

      // Upload masked slice
      const maskedPath = `${sessionId}/masked-slices/${edgeType}_${index}.png`;
      const maskedBytes = base64ToUint8Array(maskedBase64);

      const { error: uploadError } = await supabase.storage
        .from('edge-images')
        .upload(maskedPath, maskedBytes, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      console.log(`✓ Processed ${edgeType} slice ${index + 1}`);
      return maskedPath;

    } catch (error) {
      retryCount++;
      console.warn(`Failed to process ${edgeType} slice ${index + 1} (attempt ${retryCount}/${maxRetries}):`, error.message);

      if (retryCount >= maxRetries) {
        throw new Error(`Failed to process ${edgeType} slice ${index + 1} after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }

  throw new Error(`Unexpected error processing ${edgeType} slice ${index + 1}`);
}

// Helper function to create raw slice without triangle masks
async function createRawSliceImage(
  base64: string,
  numLeaves: number,
  orientation: 'vertical' | 'horizontal',
  scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides',
  centerMode: 'start' | 'center' | 'end',
  pdfDimensions?: { width: number; height: number },
  pageType: 'bw' | 'standard' | 'premium' = 'standard',
  edgeType?: 'top' | 'bottom'
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const slices: string[] = [];

        // Size recommendations and validation (same as before)
        const relevantDimension = orientation === 'vertical' ? img.width : img.height;

        if (pdfDimensions) {
          let recommendedWidth: number;
          let recommendedHeight: number;

          if (orientation === 'vertical') {
            recommendedWidth = Math.max(numLeaves, 100);
            recommendedHeight = pointsToCanvasPixels(pdfDimensions.height, pageType);
          } else {
            recommendedWidth = pointsToCanvasPixels(pdfDimensions.width, pageType);
            recommendedHeight = Math.max(numLeaves, 100);
          }

          const actualSize = `${img.width}×${img.height}px`;
          const recommendedSize = `${Math.round(recommendedWidth)}×${Math.round(recommendedHeight)}px`;

          console.log(`Edge image (${orientation}): ${actualSize}, recommended: ${recommendedSize} for ${numLeaves} leaves`);

          const meetsWidth = img.width >= recommendedWidth * 0.8;
          const meetsHeight = img.height >= recommendedHeight * 0.8;

          if (!meetsWidth || !meetsHeight) {
            console.warn(`Edge image may be too small. Current: ${actualSize}, recommended: ${recommendedSize}. Consider using a higher resolution image for best print quality.`);
          }
        } else {
          if (relevantDimension < numLeaves) {
            console.warn(`Edge image ${orientation === 'vertical' ? 'width' : 'height'} (${relevantDimension}px) is smaller than number of leaves (${numLeaves}). Some leaves will share the same edge slice.`);
          }

          if (relevantDimension < 10 && numLeaves > 10) {
            reject(new Error(`Edge image too small: ${orientation === 'vertical' ? 'width' : 'height'} is only ${relevantDimension}px but you have ${numLeaves} leaves. Please use an image with at least ${numLeaves}px ${orientation === 'vertical' ? 'width' : 'height'} for best results.`));
            return;
          }
        }

        // Calculate sampling region
        const samplingRegion = calculateSamplingRegion(img, numLeaves, orientation, scaleMode, centerMode);

        // Calculate content range to determine which leaves actually have content
        const contentRange = calculateContentRange(samplingRegion, numLeaves, orientation, scaleMode);

        // Create raw slices (no triangle masks)
        for (let leafIndex = 0; leafIndex < numLeaves; leafIndex++) {
          // Skip leaves outside content range for 'fit' and 'none' modes
          if ((scaleMode === 'fit' || scaleMode === 'none') &&
              (leafIndex < contentRange.start || leafIndex > contentRange.end)) {
            // Add empty string to maintain array indexing
            slices.push('');
            continue;
          }
          // Calculate leaf position with special handling for extend-sides mode
          let leafPosition;
          if (scaleMode === 'extend-sides') {
            // For extend-sides: map content leaves within sampling region, extend edges to fill
            if (leafIndex < contentRange.start) {
              // Before content: use first pixel (0.0) of the sampling region
              leafPosition = 0.0;
            } else if (leafIndex > contentRange.end) {
              // After content: use last pixel (1.0) of the sampling region
              leafPosition = 1.0;
            } else {
              // Within content: map proportionally within the sampling region
              const contentLeafIndex = leafIndex - contentRange.start;
              const totalContentLeaves = contentRange.effectiveLeaves;
              leafPosition = totalContentLeaves > 1 ? contentLeafIndex / (totalContentLeaves - 1) : 0.5;
            }
          } else {
            // Standard behavior for other modes
            leafPosition = leafIndex / Math.max(1, numLeaves - 1);
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = false;

          // Set canvas size using proper point-to-pixel conversion with calculated DPI
          if (orientation === 'vertical') {
            // For side edges: 0.25" strip width in pixels (will be ~71px with proper DPI)
            const stripWidthPixels = pointsToCanvasPixels(EDGE_STRIP_SIZE, pageType);
            const pageHeightPixels = pdfDimensions ? pointsToCanvasPixels(pdfDimensions.height, pageType) : img.height;
            console.log(`RAW Side edge canvas: ${stripWidthPixels} × ${pageHeightPixels} (DPI: ${getEdgeImageDPI(pageType)}, pageType: ${pageType})`);
            canvas.width = stripWidthPixels;
            canvas.height = pageHeightPixels;

            // Calculate source X position within the sampling region
            const sourceX = Math.floor(samplingRegion.x + (leafPosition * samplingRegion.width));
            const clampedSourceX = Math.min(Math.max(sourceX, 0), img.width - 1);

            // Create a pattern by replicating the 1px wide slice across the strip width
            for (let x = 0; x < canvas.width; x++) {
              ctx.drawImage(
                img,
                clampedSourceX, 0, 1, img.height,  // Source: 1px wide × full height slice
                x, 0, 1, canvas.height             // Destination: replicate across width
              );
            }
          } else {
            // For top/bottom edges: full PDF width, 0.25" strip height in pixels (will be ~71px with proper DPI)
            canvas.width = pdfDimensions ? pointsToCanvasPixels(pdfDimensions.width, pageType) : img.width;
            canvas.height = pointsToCanvasPixels(EDGE_STRIP_SIZE, pageType);

            // Calculate source Y position within the sampling region
            // For top edge: reverse the leaf position to slice from bottom to top
            const effectiveLeafPosition = edgeType === 'top' ? (1.0 - leafPosition) : leafPosition;
            const sourceY = Math.floor(samplingRegion.y + (effectiveLeafPosition * samplingRegion.height));
            const clampedSourceY = Math.min(Math.max(sourceY, 0), img.height - 1);

            // Create a pattern by replicating the 1px high slice across the strip height
            for (let y = 0; y < canvas.height; y++) {
              ctx.drawImage(
                img,
                0, clampedSourceY, img.width, 1,  // Source: full width × 1px high slice
                0, y, canvas.width, 1             // Destination: replicate across height
              );
            }
          }

          // Convert to base64 (NO triangle mask applied here)
          slices.push(canvas.toDataURL('image/png').split(',')[1]);
        }

        resolve(slices);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:image/png;base64,${base64}`;
  });
}

// Legacy function - creates slices with triangle masks inline
async function sliceImage(
  base64: string,
  numLeaves: number,
  orientation: 'vertical' | 'horizontal',
  scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides',
  centerMode: 'start' | 'center' | 'end',
  edgeType?: 'top' | 'bottom',
  pdfDimensions?: { width: number; height: number },
  pageType: 'bw' | 'standard' | 'premium' = 'standard'
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const slices: string[] = [];

        // Check image size requirements based on PDF dimensions and DPI
        const relevantDimension = orientation === 'vertical' ? img.width : img.height;

        // Calculate recommended pixel dimensions for optimal quality
        let recommendedWidth: number;
        let recommendedHeight: number;

        if (pdfDimensions) {
          if (orientation === 'vertical') {
            // For side edges: slice width should match leaves, height should match PDF height in pixels
            recommendedWidth = Math.max(numLeaves, 100); // At least 100px for quality
            recommendedHeight = pointsToCanvasPixels(pdfDimensions.height, pageType);
          } else {
            // For top/bottom edges: width should match PDF width in pixels, height should match leaves
            recommendedWidth = pointsToCanvasPixels(pdfDimensions.width, pageType);
            recommendedHeight = Math.max(numLeaves, 100); // At least 100px for quality
          }

          // Provide detailed size recommendations using PDF's native dimensions
          const actualSize = `${img.width}×${img.height}px`;
          const recommendedSize = `${Math.round(recommendedWidth)}×${Math.round(recommendedHeight)}px`;

          console.log(`Edge image (${orientation}): ${actualSize}, recommended: ${recommendedSize} for ${numLeaves} leaves`);

          // Check if image meets minimum requirements
          const meetsWidth = img.width >= recommendedWidth * 0.8; // Allow 20% tolerance
          const meetsHeight = img.height >= recommendedHeight * 0.8;

          if (!meetsWidth || !meetsHeight) {
            console.warn(`Edge image may be too small. Current: ${actualSize}, recommended: ${recommendedSize}. Consider using a higher resolution image for best print quality.`);
          }
        } else {
          // Fallback for when PDF dimensions aren't available
          if (relevantDimension < numLeaves) {
            console.warn(`Edge image ${orientation === 'vertical' ? 'width' : 'height'} (${relevantDimension}px) is smaller than number of leaves (${numLeaves}). Some leaves will share the same edge slice.`);
          }

          if (relevantDimension < 10 && numLeaves > 10) {
            reject(new Error(`Edge image too small: ${orientation === 'vertical' ? 'width' : 'height'} is only ${relevantDimension}px but you have ${numLeaves} leaves. Please use an image with at least ${numLeaves}px ${orientation === 'vertical' ? 'width' : 'height'} for best results.`));
            return;
          }
        }

        // Calculate sampling region based on scale and center modes
        const samplingRegion = calculateSamplingRegion(img, numLeaves, orientation, scaleMode, centerMode);

        // Calculate content range to determine which leaves actually have content
        const contentRange = calculateContentRange(samplingRegion, numLeaves, orientation, scaleMode);

        // For each leaf, calculate which portion of the image to use
        // Base pixel requirements directly on number of leaves
        for (let leafIndex = 0; leafIndex < numLeaves; leafIndex++) {
          // Skip leaves outside content range for 'fit' and 'none' modes
          if ((scaleMode === 'fit' || scaleMode === 'none') &&
              (leafIndex < contentRange.start || leafIndex > contentRange.end)) {
            // Add empty string to maintain array indexing
            slices.push('');
            continue;
          }
          // Calculate the position of this leaf in the sampling region (0 to 1)
          // Calculate leaf position with special handling for extend-sides mode
          let leafPosition;
          if (scaleMode === 'extend-sides') {
            // For extend-sides: map content leaves within sampling region, extend edges to fill
            if (leafIndex < contentRange.start) {
              // Before content: use first pixel (0.0) of the sampling region
              leafPosition = 0.0;
            } else if (leafIndex > contentRange.end) {
              // After content: use last pixel (1.0) of the sampling region
              leafPosition = 1.0;
            } else {
              // Within content: map proportionally within the sampling region
              const contentLeafIndex = leafIndex - contentRange.start;
              const totalContentLeaves = contentRange.effectiveLeaves;
              leafPosition = totalContentLeaves > 1 ? contentLeafIndex / (totalContentLeaves - 1) : 0.5;
            }
          } else {
            // Standard behavior for other modes
            leafPosition = leafIndex / Math.max(1, numLeaves - 1);
          }

          // Create a canvas for this slice
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          // Disable image smoothing for crisp pixel stretching
          ctx.imageSmoothingEnabled = false;

          // Set canvas size using proper point-to-pixel conversion with calculated DPI
          if (orientation === 'vertical') {
            // For side edges: 0.25" strip width in pixels (will be ~71px with proper DPI)
            canvas.width = pointsToCanvasPixels(EDGE_STRIP_SIZE, pageType);
            canvas.height = pdfDimensions ? pointsToCanvasPixels(pdfDimensions.height, pageType) : img.height;

            // Calculate source X position within the sampling region
            const sourceX = Math.floor(samplingRegion.x + (leafPosition * samplingRegion.width));
            const clampedSourceX = Math.min(Math.max(sourceX, 0), img.width - 1);

            // Create a pattern by replicating the 1px wide slice across the strip width
            for (let x = 0; x < canvas.width; x++) {
              ctx.drawImage(
                img,
                clampedSourceX, 0, 1, img.height,  // Source: 1px wide × full height slice
                x, 0, 1, canvas.height             // Destination: replicate across width
              );
            }
          } else {
            // For top/bottom edges: full PDF width, 0.25" strip height in pixels (will be ~71px with proper DPI)
            canvas.width = pdfDimensions ? pointsToCanvasPixels(pdfDimensions.width, pageType) : img.width;
            canvas.height = pointsToCanvasPixels(EDGE_STRIP_SIZE, pageType);

            // Calculate source Y position within the sampling region
            const sourceY = Math.floor(samplingRegion.y + (leafPosition * samplingRegion.height));
            const clampedSourceY = Math.min(Math.max(sourceY, 0), img.height - 1);

            // Create a pattern by replicating the 1px high slice across the strip height
            for (let y = 0; y < canvas.height; y++) {
              ctx.drawImage(
                img,
                0, clampedSourceY, img.width, 1,  // Source: full width × 1px high slice
                0, y, canvas.width, 1             // Destination: replicate across height
              );
            }
          }

          // Apply triangle mask for mitred corners if this is a top/bottom edge
          if (orientation === 'horizontal' && edgeType) {
            applyTriangleMask(ctx, canvas.width, canvas.height, edgeType);
          }

          // Convert to base64
          slices.push(canvas.toDataURL('image/png').split(',')[1]);
        }

        resolve(slices);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:image/png;base64,${base64}`;
  });
}

function calculateSamplingRegion(
  img: HTMLImageElement,
  numLeaves: number,
  orientation: 'vertical' | 'horizontal',
  scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides',
  centerMode: 'start' | 'center' | 'end'
): { x: number; y: number; width: number; height: number } {
  const imgWidth = img.width;
  const imgHeight = img.height;

  if (scaleMode === 'stretch') {
    // Use entire image, stretched to fit
    return { x: 0, y: 0, width: imgWidth, height: imgHeight };
  }

  if (scaleMode === 'none') {
    // Use image as-is, just apply centering
    if (orientation === 'vertical') {
      const startX = centerMode === 'start' ? 0 :
                    centerMode === 'end' ? Math.max(0, imgWidth - numLeaves) :
                    Math.max(0, Math.floor((imgWidth - numLeaves) / 2));
      return {
        x: startX,
        y: 0,
        width: Math.min(numLeaves, imgWidth),
        height: imgHeight
      };
    } else {
      const startY = centerMode === 'start' ? 0 :
                    centerMode === 'end' ? Math.max(0, imgHeight - numLeaves) :
                    Math.max(0, Math.floor((imgHeight - numLeaves) / 2));
      return {
        x: 0,
        y: startY,
        width: imgWidth,
        height: Math.min(numLeaves, imgHeight)
      };
    }
  }

  if (scaleMode === 'fit') {
    // Scale to fit within required dimensions while maintaining aspect ratio
    if (orientation === 'vertical') {
      const scale = Math.min(1, numLeaves / imgWidth);
      const scaledWidth = Math.floor(imgWidth * scale);
      const startX = centerMode === 'start' ? 0 :
                    centerMode === 'end' ? imgWidth - scaledWidth :
                    Math.floor((imgWidth - scaledWidth) / 2);
      return { x: startX, y: 0, width: scaledWidth, height: imgHeight };
    } else {
      const scale = Math.min(1, numLeaves / imgHeight);
      const scaledHeight = Math.floor(imgHeight * scale);
      const startY = centerMode === 'start' ? 0 :
                    centerMode === 'end' ? imgHeight - scaledHeight :
                    Math.floor((imgHeight - scaledHeight) / 2);
      return { x: 0, y: startY, width: imgWidth, height: scaledHeight };
    }
  }

  if (scaleMode === 'fill') {
    // Scale to fill required dimensions while maintaining aspect ratio (may crop)
    if (orientation === 'vertical') {
      const targetWidth = numLeaves;
      const scale = targetWidth / imgWidth;
      const scaledHeight = Math.floor(imgHeight * scale);
      const startY = centerMode === 'start' ? 0 :
                    centerMode === 'end' ? Math.max(0, imgHeight - scaledHeight) :
                    Math.max(0, Math.floor((imgHeight - scaledHeight) / 2));
      return { x: 0, y: startY, width: imgWidth, height: Math.min(scaledHeight, imgHeight) };
    } else {
      const targetHeight = numLeaves;
      const scale = targetHeight / imgHeight;
      const scaledWidth = Math.floor(imgWidth * scale);
      const startX = centerMode === 'start' ? 0 :
                    centerMode === 'end' ? Math.max(0, imgWidth - scaledWidth) :
                    Math.max(0, Math.floor((imgWidth - scaledWidth) / 2));
      return { x: startX, y: 0, width: Math.min(scaledWidth, imgWidth), height: imgHeight };
    }
  }

  if (scaleMode === 'extend-sides') {
    // Use 'fit' logic first to determine content area that will be extended
    if (orientation === 'vertical') {
      const scale = Math.min(1, numLeaves / imgWidth);
      const fittedWidth = Math.floor(imgWidth * scale);
      const startX = Math.floor((imgWidth - fittedWidth) / 2);
      return { x: startX, y: 0, width: fittedWidth, height: imgHeight };
    } else {
      const scale = Math.min(1, numLeaves / imgHeight);
      const fittedHeight = Math.floor(imgHeight * scale);
      const startY = Math.floor((imgHeight - fittedHeight) / 2);
      return { x: 0, y: startY, width: imgWidth, height: fittedHeight };
    }
  }
  // Default fallback
  return { x: 0, y: 0, width: imgWidth, height: imgHeight };
}

function applyTriangleMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  edgeType: 'top' | 'bottom' | 'side'
): void {
  // Use destination-out to cut transparent triangles
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000'; // Color doesn't matter for destination-out
  ctx.beginPath();

  if (edgeType === 'side') {
    // For side edges - cut triangles in top-left and bottom-right corners for proper mitring
    // Triangle size should match the canvas width (which is the strip size in pixels)
    const triangleSize = width; // Use canvas width for perfect 45° angle

    // Top-left triangle
    ctx.moveTo(0, 0);                        // Top-left corner
    ctx.lineTo(triangleSize, 0);             // Right from top-left (71px)
    ctx.lineTo(0, triangleSize);             // Down from top-left (71px) - 45° diagonal
    ctx.closePath();
    ctx.fill();

    // Bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(0, height);                   // Bottom-left corner
    ctx.lineTo(triangleSize, height);        // Right from bottom-left (71px)
    ctx.lineTo(0, height - triangleSize);    // Up from bottom-left (71px) - 45° diagonal
    ctx.closePath();
    ctx.fill();

  } else {
    // For top/bottom edges - single triangle in corner
    // Triangle size should match the canvas height (which is the strip size in pixels)
    const triangleSize = height; // Use canvas height for perfect 45° angle

    if (edgeType === 'bottom') {
      // For bottom edge - cut transparent triangle in top-right corner
      ctx.moveTo(width, 0);                    // Top-right corner
      ctx.lineTo(width, triangleSize);         // Down from top-right (71px)
      ctx.lineTo(width - triangleSize, 0);     // Left from top-right (71px) - 45° diagonal
    } else {
      // For top edge - cut transparent triangle in bottom-right corner
      ctx.moveTo(width, height);                    // Bottom-right corner
      ctx.lineTo(width, height - triangleSize);     // Up from bottom-right (71px)
      ctx.lineTo(width - triangleSize, height);     // Left from bottom-right (71px) - 45° diagonal
    }

    ctx.closePath();
    ctx.fill();
  }

  // Reset composite operation
  ctx.globalCompositeOperation = 'source-over';
}

// Helper function to apply triangle masks to existing slice base64 images
async function applyTriangleMaskToSlices(
  rawSliceBase64Array: string[],
  edgeType: 'top' | 'bottom',
  _options: EdgeSlicingOptions
): Promise<string[]> {
  const maskedSlices: string[] = [];

  for (const rawSliceBase64 of rawSliceBase64Array) {
    const maskedSlice = await applyTriangleMaskToSlice(rawSliceBase64, edgeType);
    maskedSlices.push(maskedSlice);
  }

  return maskedSlices;
}

// Apply triangle mask to a single slice image
async function applyTriangleMaskToSlice(
  rawSliceBase64: string,
  edgeType: 'top' | 'bottom' | 'side'
): Promise<string> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();

        // Add timeout for image loading
        const timeout = setTimeout(() => {
          reject(new Error('Triangle mask application timeout'));
        }, 30000); // 30 second timeout

        img.onload = () => {
          clearTimeout(timeout);
          try {
            // Create canvas with same dimensions as input image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;

            canvas.width = img.width;
            canvas.height = img.height;

            // Draw the original slice image
            ctx.drawImage(img, 0, 0);

            // Apply triangle mask
            applyTriangleMask(ctx, canvas.width, canvas.height, edgeType);

            // Convert to base64
            const maskedBase64 = canvas.toDataURL('image/png').split(',')[1];
            resolve(maskedBase64);
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed to load raw slice image'));
        };

        img.src = `data:image/png;base64,${rawSliceBase64}`;
      });
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Triangle mask application failed (attempt ${retryCount}/${maxRetries}):`, errorMessage);

      if (retryCount >= maxRetries) {
        throw new Error(`Failed to apply triangle mask after ${maxRetries} attempts: ${errorMessage}`);
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffTime = Math.min(1000 * Math.pow(2, retryCount - 1), 4000);
      console.log(`Retrying in ${backoffTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }

  throw new Error('Failed to apply triangle mask after all retry attempts');
}

// Helper function to convert base64 to Uint8Array for storage upload
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper function to convert blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/png;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper function to create a solid color image
async function createColorImage(width: number, height: number, color: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      canvas.width = width;
      canvas.height = height;

      // Fill with the specified color
      ctx.fillStyle = color === 'black' ? '#000000' : color;
      ctx.fillRect(0, 0, width, height);

      // Convert to base64
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      resolve(base64);
    } catch (error) {
      reject(error);
    }
  });
}