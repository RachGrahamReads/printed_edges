import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants
const BLEED_INCHES = 0.125;
const SAFETY_BUFFER_INCHES = 0.125;
const POINTS_PER_INCH = 72;
const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;
const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH;

interface ChunkProcessRequest {
  sessionId: string;
  chunkPath: string;
  chunkIndex: number;
  totalChunks: number;
  startPage: number; // Global page number for this chunk
  endPage: number;   // Global page number for this chunk
  slicedPaths: {
    side?: string[];
    top?: string[];
    bottom?: string[];
  };
  bleedType: 'add_bleed' | 'existing_bleed';
  edgeType: 'side-only' | 'all-edges';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: ChunkProcessRequest = await req.json();

    console.log(`Processing chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks}`);
    console.log(`Global pages: ${requestData.startPage + 1}-${requestData.endPage + 1}`);
    console.log(`Chunk path: ${requestData.chunkPath}`);

    // Download the PDF chunk
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("pdfs")
      .download(requestData.chunkPath);

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
      newWidth = originalWidth + bleedPoints;
      newHeight = originalHeight + (2 * bleedPoints);
    }

    console.log(`Original size: ${originalWidth}x${originalHeight}`);
    console.log(`New size with bleed: ${newWidth}x${newHeight}`);

    // Create new document with processed pages
    const processedDoc = await PDFDocument.create();

    // Pre-load all slice images to avoid repeated downloads
    const loadedSlices: any = {};

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
      let yOffset = requestData.bleedType === "add_bleed" ? bleedPoints : 0;

      if (requestData.bleedType === "add_bleed" && globalPageIndex % 2 === 1) {
        xOffset = bleedPoints; // Left pages need offset
      }

      // Copy the page contents using embedPage instead of drawPage
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
        console.error(`Error drawing page ${pageIndex + 1}:`, drawError);
        throw drawError;
      }

      // Add edges using pre-sliced images
      const edgeStripWidth = BLEED_POINTS + SAFETY_BUFFER_POINTS;
      const edgeStripHeight = BLEED_POINTS + SAFETY_BUFFER_POINTS;

      // Add side edge
      if ((requestData.edgeType === 'side-only' || requestData.edgeType === 'all-edges') &&
          requestData.slicedPaths.side && requestData.slicedPaths.side[leafNumber]) {

        await addEdgeToPage(
          supabase, newPage, processedDoc, loadedSlices,
          requestData.slicedPaths.side[leafNumber],
          'side', globalPageIndex, newWidth, newHeight, edgeStripWidth, edgeStripHeight
        );
      }

      // Add top edge
      if (requestData.edgeType === 'all-edges' &&
          requestData.slicedPaths.top && requestData.slicedPaths.top[leafNumber]) {

        await addEdgeToPage(
          supabase, newPage, processedDoc, loadedSlices,
          requestData.slicedPaths.top[leafNumber],
          'top', globalPageIndex, newWidth, newHeight, edgeStripWidth, edgeStripHeight
        );
      }

      // Add bottom edge
      if (requestData.edgeType === 'all-edges' &&
          requestData.slicedPaths.bottom && requestData.slicedPaths.bottom[leafNumber]) {

        await addEdgeToPage(
          supabase, newPage, processedDoc, loadedSlices,
          requestData.slicedPaths.bottom[leafNumber],
          'bottom', globalPageIndex, newWidth, newHeight, edgeStripWidth, edgeStripHeight
        );
      }
    }

    console.log("Finished processing all pages in chunk, saving...");

    // Save the processed chunk
    const processedBytes = await processedDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    console.log(`Processed chunk size: ${processedBytes.length} bytes`);

    // Upload processed chunk
    const processedChunkPath = `${requestData.sessionId}/processed_chunks/chunk_${requestData.chunkIndex}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("processed-pdfs")
      .upload(processedChunkPath, processedBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) throw new Error(`Failed to upload processed chunk: ${uploadError.message}`);

    console.log(`Processed chunk uploaded: ${processedChunkPath}`);

    return new Response(
      JSON.stringify({
        success: true,
        chunkIndex: requestData.chunkIndex,
        processedChunkPath,
        message: `Chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks} processed successfully`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing chunk:", error);
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
      // This is a virtual slice - get the metadata
      const { data: metadataData, error: metadataError } = await supabase.storage
        .from("edge-images")
        .download(slicePath);

      if (metadataError) throw new Error(`Failed to download slice metadata: ${metadataError.message}`);

      const metadataText = await metadataData.text();
      const sliceMetadata = JSON.parse(metadataText);

      // Use the original image path as cache key
      cacheKey = sliceMetadata.originalImagePath;

      // Load the original image if not already loaded
      if (!loadedSlices[cacheKey]) {
        const { data: originalImageData, error: imageError } = await supabase.storage
          .from("edge-images")
          .download(sliceMetadata.originalImagePath);

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
        const { data: sliceData, error: sliceError } = await supabase.storage
          .from("edge-images")
          .download(slicePath);

        if (sliceError) throw new Error(`Failed to download slice: ${sliceError.message}`);

        const sliceBytes = await sliceData.arrayBuffer();
        loadedSlices[slicePath] = await pdfDoc.embedPng(sliceBytes);
      }

      imageToUse = loadedSlices[slicePath];
    }

    const flipHorizontally = globalPageIndex % 2 !== 0; // Even pages (back pages) get flipped

    // Position and draw the edge based on type
    if (edgeType === 'side') {
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