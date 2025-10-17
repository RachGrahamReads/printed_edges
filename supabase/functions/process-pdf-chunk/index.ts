import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Constants
const BLEED_INCHES = 0.125;
const SAFETY_BUFFER_INCHES = 0.125;
const POINTS_PER_INCH = 72;
const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;
const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH;

// Retry utility with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  context: string = "operation"
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.error(`${context} failed after ${maxRetries + 1} attempts:`, lastError);
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

interface SliceStoragePaths {
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

interface ChunkProcessRequest {
  sessionId: string;
  chunkPath: string;
  chunkIndex: number;
  totalChunks: number;
  startPage: number; // Global page number for this chunk
  endPage: number;   // Global page number for this chunk
  sliceStoragePaths: SliceStoragePaths;
  bleedType: 'add_bleed' | 'existing_bleed';
  edgeType: 'side-only' | 'all-edges';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let requestData: ChunkProcessRequest;
    try {
      requestData = await req.json();
    } catch (parseError) {
      throw new Error(`Failed to parse request JSON: ${parseError.message}`);
    }

    console.log(`Processing chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks}`);
    console.log(`Global pages: ${requestData.startPage + 1}-${requestData.endPage + 1}`);
    console.log(`Chunk path: ${requestData.chunkPath}`);

    // Download the PDF chunk with retry logic
    const { data: pdfData, error: downloadError } = await retryWithBackoff(
      async () => {
        const result = await supabase.storage
          .from("pdfs")
          .download(requestData.chunkPath);

        if (result.error) {
          throw new Error(result.error.message || JSON.stringify(result.error));
        }

        return result;
      },
      3, // max 3 retries
      1000, // start with 1 second delay
      `Download PDF chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks}`
    );

    if (downloadError) throw new Error(`Failed to download chunk: ${downloadError.message}`);

    const pdfBytes = await pdfData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    console.log(`Chunk has ${pages.length} pages`);

    if (pages.length === 0) throw new Error("No pages in chunk");

    const firstPage = pages[0];
    const { width: originalWidth, height: originalHeight } = firstPage.getSize();

    // Calculate new dimensions with bleed if needed
    let newWidth = originalWidth;
    let newHeight = originalHeight;
    let bleedPoints = 0;

    if (requestData.bleedType === "add_bleed") {
      bleedPoints = BLEED_POINTS;
      newWidth = originalWidth + bleedPoints; // Only add 0.125" total (outer edge only)
      newHeight = originalHeight + (2 * bleedPoints); // Add 0.125" top and bottom
    }

    console.log(`Original size: ${originalWidth}x${originalHeight}`);
    console.log(`New size with bleed: ${newWidth}x${newHeight}`);

    // Create new document with processed pages
    const processedDoc = await PDFDocument.create();

    // Pre-load all slice images to avoid repeated downloads
    const loadedSlices: any = {};

    // Track pages with issues
    const pageWarnings: Array<{ pageNumber: number; issue: string }> = [];

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const globalPageIndex = requestData.startPage + pageIndex;
      const leafNumber = Math.floor(globalPageIndex / 2);

      console.log(`Processing page ${pageIndex + 1}/${pages.length} (global page ${globalPageIndex + 1}, leaf ${leafNumber})`);

      // Create new page with bleed dimensions
      const newPage = processedDoc.addPage([newWidth, newHeight]);

      // Get the source page and embed it as an embedded page
      const sourcePage = pages[pageIndex];
      console.log(`Processing page ${pageIndex + 1}/${pages.length}, pageIndex: ${pageIndex}`);

      if (pageIndex >= pages.length) {
        throw new Error(`Invalid page index ${pageIndex}, only ${pages.length} pages available`);
      }

      // Instead of copying pages, we need to embed the page content
      // First, let's get the page's content and transfer it
      const sourceDimensions = sourcePage.getSize();

      // Position content based on bleed type and page side
      let xOffset = 0;
      let yOffset = 0;

      if (requestData.bleedType === "add_bleed") {
        // Y offset: content centered with equal bleed top and bottom
        // Since we added (2 * bleedPoints) to height, content should be offset by bleedPoints from bottom
        yOffset = bleedPoints; // This creates bleedPoints space at bottom AND top

        // X offset for spine/outer edge bleed:
        // Page 0 (right side): no x offset, bleed extends to right (outer edge)
        // Page 1 (left side): x offset, bleed extends to left (outer edge)
        if (globalPageIndex % 2 === 1) {
          xOffset = bleedPoints; // Odd pages (left side): content offset right, bleed on left
        }
        // Even pages (right side): xOffset = 0, content at left, bleed extends right
      }

      // Copy the page contents using embedPage
      try {
        const embeddedPage = await processedDoc.embedPage(sourcePage);

        newPage.drawPage(embeddedPage, {
          x: xOffset,
          y: yOffset,
          width: originalWidth,
          height: originalHeight
        });
        console.log(`Successfully drew page ${pageIndex + 1}`);
      } catch (drawError) {
        // ANY error from embedPage means we should create a blank page fallback
        // This handles corrupt pages, blank pages, and any other page content issues
        console.warn(`Page ${pageIndex + 1} (global page ${globalPageIndex + 1}) failed to embed - creating blank page fallback`);
        console.warn(`Error was:`, drawError.message || String(drawError));

        // Record this as a warning to inform the user
        pageWarnings.push({
          pageNumber: globalPageIndex + 1,
          issue: "blank_or_corrupt"
        });

        // Just draw a white rectangle - this creates a proper blank page
        newPage.drawRectangle({
          x: 0,
          y: 0,
          width: newWidth,
          height: newHeight,
          color: rgb(1, 1, 1), // white
        });

        console.log(`Created blank page for page ${pageIndex + 1} (original page was blank/corrupt)`);
        // NOTE: We do NOT throw here - we continue processing with the blank page
      }

      // Add edges using pre-sliced images
      const edgeStripWidth = BLEED_POINTS + SAFETY_BUFFER_POINTS;
      const edgeStripHeight = BLEED_POINTS + SAFETY_BUFFER_POINTS;

      // Add side edge
      if ((requestData.edgeType === 'side-only' || requestData.edgeType === 'all-edges') &&
          requestData.sliceStoragePaths.side &&
          requestData.sliceStoragePaths.side.masked &&
          requestData.sliceStoragePaths.side.masked[leafNumber]) {

        await addEdgeToPage(
          supabase, newPage, processedDoc, loadedSlices,
          requestData.sliceStoragePaths.side.masked[leafNumber],
          'side', globalPageIndex, newWidth, newHeight, edgeStripWidth, edgeStripHeight
        );
      }

      // Add top edge (no longer reversed - slices are already in correct order)
      if (requestData.edgeType === 'all-edges' &&
          requestData.sliceStoragePaths.top &&
          requestData.sliceStoragePaths.top.masked &&
          requestData.sliceStoragePaths.top.masked[leafNumber]) {

        await addEdgeToPage(
          supabase, newPage, processedDoc, loadedSlices,
          requestData.sliceStoragePaths.top.masked[leafNumber],
          'top', globalPageIndex, newWidth, newHeight, edgeStripWidth, edgeStripHeight
        );
      }

      // Add bottom edge
      if (requestData.edgeType === 'all-edges' &&
          requestData.sliceStoragePaths.bottom &&
          requestData.sliceStoragePaths.bottom.masked &&
          requestData.sliceStoragePaths.bottom.masked[leafNumber]) {

        await addEdgeToPage(
          supabase, newPage, processedDoc, loadedSlices,
          requestData.sliceStoragePaths.bottom.masked[leafNumber],
          'bottom', globalPageIndex, newWidth, newHeight, edgeStripWidth, edgeStripHeight
        );
      }
    }

    console.log("Finished processing all pages in chunk, saving...");

    // Save the processed chunk (optimized for performance)
    const processedBytes = await processedDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 25, // Reduced for less CPU per iteration
      updateFieldAppearances: false, // Skip field appearance updates
    });

    console.log(`Processed chunk size: ${processedBytes.length} bytes`);

    // Upload processed chunk with retry logic
    const processedChunkPath = `${requestData.sessionId}/processed_chunks/chunk_${requestData.chunkIndex}.pdf`;
    await retryWithBackoff(
      async () => {
        const { error: uploadError } = await supabase.storage
          .from("processed-pdfs")
          .upload(processedChunkPath, processedBytes, {
            contentType: "application/pdf",
            upsert: true
          });

        if (uploadError) {
          throw new Error(uploadError.message || JSON.stringify(uploadError));
        }
      },
      3, // max 3 retries
      1000, // start with 1 second delay
      `Upload processed chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks}`
    );

    console.log(`Processed chunk uploaded: ${processedChunkPath}`);

    if (pageWarnings.length > 0) {
      console.warn(`Chunk ${requestData.chunkIndex + 1} has ${pageWarnings.length} page(s) with issues:`, pageWarnings);
    }

    return new Response(
      JSON.stringify({
        success: true,
        chunkIndex: requestData.chunkIndex,
        processedChunkPath,
        pageWarnings: pageWarnings.length > 0 ? pageWarnings : undefined,
        message: `Chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks} processed successfully`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing chunk:", error);
    console.error("Error stack:", error.stack);
    console.error("Error type:", typeof error);
    console.error("Error constructor:", error?.constructor?.name);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

async function addEdgeToPage(
  supabase: any,
  page: any,
  pdfDoc: any,
  loadedSlices: any,
  slicePath: string,
  edgeType: 'side' | 'top' | 'bottom',
  globalPageIndex: number,
  newWidth: number,
  newHeight: number,
  edgeStripWidth: number,
  edgeStripHeight: number
) {
  try {
    // Handle virtual slices - download metadata and use original image
    let imageToUse: any;
    let cacheKey = slicePath;

    if (slicePath.endsWith('.txt')) {
      // This is a virtual slice - get the metadata with retry logic
      const { data: metadataData, error: metadataError } = await retryWithBackoff(
        async () => {
          const result = await supabase.storage
            .from("edge-images")
            .download(slicePath);

          if (result.error) {
            throw new Error(result.error.message || JSON.stringify(result.error));
          }

          return result;
        },
        3,
        1000,
        `Download slice metadata for ${edgeType} edge`
      );

      if (metadataError) throw new Error(`Failed to download slice metadata: ${metadataError.message}`);

      const metadataText = await metadataData.text();
      const sliceMetadata = JSON.parse(metadataText);

      // Use the original image path as cache key
      cacheKey = sliceMetadata.originalImagePath;

      // Load the original image if not already loaded
      if (!loadedSlices[cacheKey]) {
        const { data: originalImageData, error: imageError } = await retryWithBackoff(
          async () => {
            const result = await supabase.storage
              .from("edge-images")
              .download(sliceMetadata.originalImagePath);

            if (result.error) {
              throw new Error(result.error.message || JSON.stringify(result.error));
            }

            return result;
          },
          3,
          1000,
          `Download original image for ${edgeType} edge`
        );

        if (imageError) throw new Error(`Failed to download original image: ${imageError.message}`);

        const imageBytes = await originalImageData.arrayBuffer();
        loadedSlices[cacheKey] = await pdfDoc.embedPng(imageBytes);
      }

      imageToUse = loadedSlices[cacheKey];

      // For virtual slices, we use the full image but with calculated positioning
      // The slicing effect is achieved through careful positioning and scaling
      console.log(`Using virtual slice ${sliceMetadata.leafIndex}/${sliceMetadata.totalLeaves} for ${edgeType} edge`);

    } else {
      // This is a real pre-sliced image
      if (!loadedSlices[slicePath]) {
        const { data: sliceData, error: sliceError } = await retryWithBackoff(
          async () => {
            const result = await supabase.storage
              .from("edge-images")
              .download(slicePath);

            if (result.error) {
              throw new Error(result.error.message || JSON.stringify(result.error));
            }

            return result;
          },
          3,
          1000,
          `Download slice for ${edgeType} edge`
        );

        if (sliceError) throw new Error(`Failed to download slice: ${sliceError.message}`);

        const sliceBytes = await sliceData.arrayBuffer();
        loadedSlices[slicePath] = await pdfDoc.embedPng(sliceBytes);
      }

      imageToUse = loadedSlices[slicePath];
    }

    const flipHorizontally = globalPageIndex % 2 !== 0; // Odd pages (left pages) get flipped

    // Position and draw the edge based on type
    if (edgeType === 'side') {
      // For outer edge gilding:
      // Even pages (right side): edge goes on right side (outer edge)
      // Odd pages (left side): edge goes on left side (outer edge)
      let sideX = globalPageIndex % 2 === 0 ? newWidth - edgeStripWidth : 0;

      if (flipHorizontally) {
        page.drawImage(imageToUse, {
          x: sideX + edgeStripWidth,
          y: 0,
          width: -edgeStripWidth,
          height: newHeight,
        });
      } else {
        page.drawImage(imageToUse, {
          x: sideX,
          y: 0,
          width: edgeStripWidth,
          height: newHeight,
        });
      }

    } else if (edgeType === 'top') {
      if (flipHorizontally) {
        page.drawImage(imageToUse, {
          x: newWidth,
          y: newHeight - edgeStripHeight,
          width: -newWidth,
          height: edgeStripHeight,
        });
      } else {
        page.drawImage(imageToUse, {
          x: 0,
          y: newHeight - edgeStripHeight,
          width: newWidth,
          height: edgeStripHeight,
        });
      }

    } else if (edgeType === 'bottom') {
      if (flipHorizontally) {
        page.drawImage(imageToUse, {
          x: newWidth,
          y: 0,
          width: -newWidth,
          height: edgeStripHeight,
        });
      } else {
        page.drawImage(imageToUse, {
          x: 0,
          y: 0,
          width: newWidth,
          height: edgeStripHeight,
        });
      }
    }

    console.log(`Added ${edgeType} edge to global page ${globalPageIndex + 1}`);

  } catch (error) {
    console.error(`Failed to add ${edgeType} edge to page ${globalPageIndex + 1}:`, error);

    // Fallback to colored rectangle
    let x = 0, y = 0, width = edgeStripWidth, height = newHeight;

    if (edgeType === 'side') {
      x = globalPageIndex % 2 === 0 ? newWidth - edgeStripWidth : 0;
    } else if (edgeType === 'top') {
      y = newHeight - edgeStripHeight;
      width = newWidth;
      height = edgeStripHeight;
    } else if (edgeType === 'bottom') {
      width = newWidth;
      height = edgeStripHeight;
    }

    page.drawRectangle({
      x, y, width, height,
      color: rgb(0.65, 0.45, 0.25),
      opacity: 0.3,
    });
  }
}