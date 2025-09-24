import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib@1.17.1?dts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 10; // Process 10 pages at a time (consistent with chunking)
const BLEED_INCHES = 0.125;
const SAFETY_BUFFER_INCHES = 0.125;
const POINTS_PER_INCH = 72;
const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;
const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH;

const PAGE_THICKNESS = {
  "bw": 0.0032,
  "standard": 0.0032,
  "premium": 0.0037
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      pdfPath,
      edgePaths,
      chunkIndex,
      totalChunks,
      startPage,
      endPage,
      numPages = 30,
      pageType = "standard",
      bleedType = "add_bleed",
      edgeType = "side-only",
      outputPath
    } = await req.json();

    console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks}: pages ${startPage + 1}-${endPage + 1}`);

    // Download PDF
    const { data: pdfData, error: pdfError } = await supabase.storage
      .from("pdfs")
      .download(pdfPath);

    if (pdfError) throw pdfError;

    const pdfBytes = await pdfData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Extract only the pages we need for this chunk
    const chunkDoc = await PDFDocument.create();
    const pagesToCopy = await chunkDoc.copyPages(
      pdfDoc,
      Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
    );

    pagesToCopy.forEach(page => chunkDoc.addPage(page));

    // Process the chunk with edge images
    const processedChunkBytes = await processChunkWithEdges(
      chunkDoc,
      edgePaths,
      numPages,
      pageType,
      bleedType,
      edgeType,
      startPage,
      supabase
    );

    // Save the processed chunk
    const chunkPath = `${outputPath.replace('.pdf', '')}_chunk_${chunkIndex}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("processed-pdfs")
      .upload(chunkPath, processedChunkBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) throw uploadError;

    return new Response(
      JSON.stringify({
        success: true,
        chunkPath,
        chunkIndex,
        totalChunks
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

async function processChunkWithEdges(
  pdfDoc: PDFDocument,
  edgePaths: any,
  numPages: number,
  pageType: string,
  bleedType: string,
  edgeType: string,
  globalStartPage: number,
  supabase: any
) {
  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error("No pages in chunk");

  const firstPage = pages[0];
  const { width: originalWidth, height: originalHeight } = firstPage.getSize();

  // Calculate new dimensions with bleed if needed
  let newWidth = originalWidth;
  let newHeight = originalHeight;
  let bleedPoints = 0;

  if (bleedType === "add_bleed") {
    bleedPoints = BLEED_POINTS;
    newWidth = originalWidth + bleedPoints;
    newHeight = originalHeight + (2 * bleedPoints);
  }

  // Download edge images
  const edgeImages: any = {};

  if (edgeType === "side-only") {
    const { data: sideEdgeData } = await supabase.storage
      .from("edge-images")
      .download(edgePaths.side);
    edgeImages.side = await sideEdgeData.arrayBuffer();
  } else {
    // Download all edge images for all-edges mode
    if (edgePaths.side) {
      const { data } = await supabase.storage.from("edge-images").download(edgePaths.side);
      edgeImages.side = await data.arrayBuffer();
    }
    if (edgePaths.top) {
      const { data } = await supabase.storage.from("edge-images").download(edgePaths.top);
      edgeImages.top = await data.arrayBuffer();
    }
    if (edgePaths.bottom) {
      const { data } = await supabase.storage.from("edge-images").download(edgePaths.bottom);
      edgeImages.bottom = await data.arrayBuffer();
    }
  }

  // Create new document with processed pages
  const processedDoc = await PDFDocument.create();
  const numLeaves = Math.ceil(numPages / 2);
  const pageThicknessInches = PAGE_THICKNESS[pageType.toLowerCase()] || 0.0032;

  for (let i = 0; i < pages.length; i++) {
    const globalPageIndex = globalStartPage + i;
    const leafNumber = Math.floor(globalPageIndex / 2);

    // Create new page with bleed dimensions
    const newPage = processedDoc.addPage([newWidth, newHeight]);

    // Copy original content
    const [copiedPage] = await processedDoc.copyPages(pdfDoc, [i]);

    // Position content based on bleed type and page side
    let xOffset = 0;
    let yOffset = bleedType === "add_bleed" ? bleedPoints : 0;

    if (bleedType === "add_bleed" && globalPageIndex % 2 === 1) {
      xOffset = bleedPoints; // Left pages need offset
    }

    // Draw the original page content
    newPage.drawPage(copiedPage, {
      x: xOffset,
      y: yOffset,
      width: originalWidth,
      height: originalHeight
    });

    // Add edges based on configuration
    // This is simplified - in production, you'd need proper image processing
    // For now, we'll just add placeholder rectangles
    const edgeStripWidth = BLEED_POINTS + SAFETY_BUFFER_POINTS;

    if (edgeType === "side-only" || edgeImages.side) {
      // Add side edge
      if (globalPageIndex % 2 === 0) {
        // Right edge for right pages
        newPage.drawRectangle({
          x: newWidth - edgeStripWidth,
          y: 0,
          width: edgeStripWidth,
          height: newHeight,
          color: { red: 0.8, green: 0.7, blue: 0.3 }, // Gold color placeholder
          opacity: 0.3
        });
      } else {
        // Left edge for left pages
        newPage.drawRectangle({
          x: 0,
          y: 0,
          width: edgeStripWidth,
          height: newHeight,
          color: { red: 0.8, green: 0.7, blue: 0.3 },
          opacity: 0.3
        });
      }
    }

    if (edgeType === "all-edges") {
      // Add top edge
      if (edgeImages.top) {
        newPage.drawRectangle({
          x: 0,
          y: newHeight - edgeStripWidth,
          width: newWidth,
          height: edgeStripWidth,
          color: { red: 0.8, green: 0.7, blue: 0.3 },
          opacity: 0.3
        });
      }

      // Add bottom edge
      if (edgeImages.bottom) {
        newPage.drawRectangle({
          x: 0,
          y: 0,
          width: newWidth,
          height: edgeStripWidth,
          color: { red: 0.8, green: 0.7, blue: 0.3 },
          opacity: 0.3
        });
      }
    }
  }

  return await processedDoc.save();
}