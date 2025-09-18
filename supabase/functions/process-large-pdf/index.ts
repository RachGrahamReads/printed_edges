import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LargePdfRequest {
  pdfPath: string;
  edgePaths: {
    side?: string;
    top?: string;
    bottom?: string;
  };
  numPages: number;
  pageType: string;
  bleedType: 'add_bleed' | 'existing_bleed';
  edgeType: 'side-only' | 'all-edges';
  outputPath: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: LargePdfRequest = await req.json();
    const sessionId = requestData.outputPath.split('/')[0]; // Extract session ID from output path

    console.log("=== STARTING LARGE PDF PROCESSING ===");
    console.log("Session ID:", sessionId);
    console.log("Total pages:", requestData.numPages);
    console.log("Edge type:", requestData.edgeType);

    // Determine if we need chunked processing
    const CHUNK_THRESHOLD = 50; // Use chunked processing for PDFs > 50 pages
    const useChunkedProcessing = requestData.numPages > CHUNK_THRESHOLD;

    if (!useChunkedProcessing) {
      console.log("PDF is small enough for single-stage processing");
      // For smaller PDFs, use the existing single-stage function
      const { data, error } = await supabase.functions.invoke('process-pdf-urls', {
        body: requestData
      });

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log("PDF requires chunked processing - starting multi-stage pipeline");

    // === STAGE 1: PRE-SLICE EDGE IMAGES ===
    console.log("STAGE 1: Pre-slicing edge images...");
    const { data: sliceData, error: sliceError } = await supabase.functions.invoke('slice-edge-images', {
      body: {
        sessionId,
        edgePaths: requestData.edgePaths,
        numPages: requestData.numPages,
        pageType: requestData.pageType,
        edgeType: requestData.edgeType
      }
    });

    if (sliceError) throw new Error(`Stage 1 failed: ${sliceError.message}`);
    if (!sliceData.success) throw new Error(`Stage 1 failed: ${sliceData.error}`);

    console.log("STAGE 1 COMPLETE: Images pre-sliced");
    console.log("Sliced paths:", sliceData.slicedPaths);

    // === STAGE 2: CHUNK THE PDF ===
    console.log("STAGE 2: Chunking PDF...");
    const { data: chunkData, error: chunkError } = await supabase.functions.invoke('chunk-pdf', {
      body: {
        sessionId,
        pdfPath: requestData.pdfPath,
        totalPages: requestData.numPages
      }
    });

    if (chunkError) throw new Error(`Stage 2 failed: ${chunkError.message}`);
    if (!chunkData.success) throw new Error(`Stage 2 failed: ${chunkData.error}`);

    console.log("STAGE 2 COMPLETE: PDF chunked");
    console.log(`Created ${chunkData.totalChunks} chunks`);

    // === STAGE 3: PROCESS EACH CHUNK ===
    console.log("STAGE 3: Processing chunks in parallel...");
    const chunkPromises = chunkData.chunks.map(async (chunk: any) => {
      console.log(`Processing chunk ${chunk.chunkIndex + 1}/${chunkData.totalChunks}`);

      const { data: processData, error: processError } = await supabase.functions.invoke('process-pdf-chunk', {
        body: {
          sessionId,
          chunkPath: chunk.chunkPath,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunkData.totalChunks,
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          slicedPaths: sliceData.slicedPaths,
          bleedType: requestData.bleedType,
          edgeType: requestData.edgeType
        }
      });

      if (processError) throw new Error(`Chunk ${chunk.chunkIndex} failed: ${processError.message}`);
      if (!processData.success) throw new Error(`Chunk ${chunk.chunkIndex} failed: ${processData.error}`);

      console.log(`Chunk ${chunk.chunkIndex + 1} processed successfully`);
      return processData.processedChunkPath;
    });

    const processedChunkPaths = await Promise.all(chunkPromises);
    console.log("STAGE 3 COMPLETE: All chunks processed");

    // === STAGE 4: MERGE CHUNKS ===
    console.log("STAGE 4: Merging processed chunks...");
    const { data: mergeData, error: mergeError } = await supabase.functions.invoke('merge-pdf-chunks', {
      body: {
        sessionId,
        processedChunkPaths,
        totalChunks: chunkData.totalChunks,
        outputPath: requestData.outputPath
      }
    });

    if (mergeError) throw new Error(`Stage 4 failed: ${mergeError.message}`);
    if (!mergeData.success) throw new Error(`Stage 4 failed: ${mergeData.error}`);

    console.log("STAGE 4 COMPLETE: PDF merged");
    console.log("=== LARGE PDF PROCESSING COMPLETE ===");

    // Clean up sliced images to save storage space
    try {
      console.log("Cleaning up sliced images...");
      const sliceFilesToClean = [];
      for (const edgeType of Object.keys(sliceData.slicedPaths)) {
        for (const slicePath of sliceData.slicedPaths[edgeType]) {
          sliceFilesToClean.push(slicePath);
        }
      }

      if (sliceFilesToClean.length > 0) {
        await supabase.storage
          .from("edge-images")
          .remove(sliceFilesToClean);
        console.log(`Cleaned up ${sliceFilesToClean.length} slice files`);
      }
    } catch (cleanupError) {
      console.warn("Failed to cleanup slice files:", cleanupError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Large PDF (${requestData.numPages} pages) processed successfully using ${chunkData.totalChunks} chunks`,
        outputUrl: `${supabaseUrl}/storage/v1/object/public/processed-pdfs/${requestData.outputPath}`,
        totalPages: mergeData.totalPages,
        processingMethod: 'chunked',
        chunksProcessed: chunkData.totalChunks
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in large PDF processing:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});