import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface MergeRequest {
  sessionId: string;
  processedChunkPaths: string[];
  totalChunks: number;
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

    const requestData: MergeRequest = await req.json();

    console.log("Merging PDF chunks for session:", requestData.sessionId);
    console.log("Total chunks to merge:", requestData.totalChunks);
    console.log("Chunk paths:", requestData.processedChunkPaths);

    if (requestData.processedChunkPaths.length !== requestData.totalChunks) {
      throw new Error(`Mismatch: expected ${requestData.totalChunks} chunks, got ${requestData.processedChunkPaths.length}`);
    }

    // Create the final merged PDF
    const mergedPdf = await PDFDocument.create();
    let totalPages = 0;

    // Process chunks in order
    for (let chunkIndex = 0; chunkIndex < requestData.totalChunks; chunkIndex++) {
      const chunkPath = requestData.processedChunkPaths[chunkIndex];

      console.log(`Merging chunk ${chunkIndex + 1}/${requestData.totalChunks}: ${chunkPath}`);

      // Download the processed chunk
      const { data: chunkData, error: downloadError } = await supabase.storage
        .from("processed-pdfs")
        .download(chunkPath);

      if (downloadError) {
        console.error(`Failed to download chunk ${chunkIndex}:`, downloadError);
        throw new Error(`Failed to download chunk ${chunkIndex}: ${downloadError.message}`);
      }

      const chunkBytes = await chunkData.arrayBuffer();
      const chunkPdf = await PDFDocument.load(chunkBytes);

      const pageCount = chunkPdf.getPageCount();
      console.log(`Chunk ${chunkIndex + 1} has ${pageCount} pages`);

      // Copy all pages from this chunk to the merged PDF
      const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
      const copiedPages = await mergedPdf.copyPages(chunkPdf, pageIndices);

      // Add all copied pages to the merged PDF
      copiedPages.forEach(page => mergedPdf.addPage(page));

      totalPages += pageCount;
      console.log(`Added ${pageCount} pages from chunk ${chunkIndex + 1}. Total pages so far: ${totalPages}`);
    }

    console.log(`Finished merging all chunks. Final PDF has ${totalPages} pages`);

    // Save the merged PDF
    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    console.log(`Merged PDF size: ${mergedBytes.length} bytes`);

    // Upload the final merged PDF
    const { error: uploadError } = await supabase.storage
      .from("processed-pdfs")
      .upload(requestData.outputPath, mergedBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) throw new Error(`Failed to upload merged PDF: ${uploadError.message}`);

    console.log(`Final merged PDF uploaded: ${requestData.outputPath}`);

    // Clean up chunk files to save storage space
    console.log("Cleaning up temporary chunk files...");
    for (const chunkPath of requestData.processedChunkPaths) {
      try {
        await supabase.storage
          .from("processed-pdfs")
          .remove([chunkPath]);
        console.log(`Cleaned up: ${chunkPath}`);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup ${chunkPath}:`, cleanupError);
        // Don't fail the entire operation for cleanup errors
      }
    }

    // Also clean up the original chunk files from the pdfs bucket
    try {
      const chunkFilesToClean = [];
      for (let i = 0; i < requestData.totalChunks; i++) {
        chunkFilesToClean.push(`${requestData.sessionId}/chunks/chunk_${i}.pdf`);
      }

      await supabase.storage
        .from("pdfs")
        .remove(chunkFilesToClean);
      console.log("Cleaned up original chunk files");
    } catch (cleanupError) {
      console.warn("Failed to cleanup original chunk files:", cleanupError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: requestData.sessionId,
        outputPath: requestData.outputPath,
        totalPages,
        message: `Successfully merged ${requestData.totalChunks} chunks into final PDF with ${totalPages} pages`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error merging PDF chunks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});