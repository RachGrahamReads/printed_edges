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

    let requestData: MergeRequest;
    try {
      requestData = await req.json();
    } catch (parseError) {
      throw new Error(`Failed to parse request JSON: ${parseError.message}`);
    }

    console.log("Merging PDF chunks for session:", requestData.sessionId);
    console.log("Total chunks to merge:", requestData.totalChunks);
    console.log("Chunk paths:", requestData.processedChunkPaths);

    if (requestData.processedChunkPaths.length !== requestData.totalChunks) {
      throw new Error(`Mismatch: expected ${requestData.totalChunks} chunks, got ${requestData.processedChunkPaths.length}`);
    }

    // Create the final merged PDF
    const mergedPdf = await PDFDocument.create();
    let totalPages = 0;

    // Process chunks in batches to reduce memory usage
    const BATCH_SIZE = 5; // Process 5 chunks at a time
    const batches = [];
    for (let i = 0; i < requestData.totalChunks; i += BATCH_SIZE) {
      batches.push({
        start: i,
        end: Math.min(i + BATCH_SIZE, requestData.totalChunks)
      });
    }

    console.log(`Processing ${requestData.totalChunks} chunks in ${batches.length} batches of up to ${BATCH_SIZE}`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing merge batch ${batchIndex + 1}/${batches.length} (chunks ${batch.start + 1}-${batch.end})`);

      // Process chunks in this batch sequentially
      for (let chunkIndex = batch.start; chunkIndex < batch.end; chunkIndex++) {
        const chunkPath = requestData.processedChunkPaths[chunkIndex];

        console.log(`Merging chunk ${chunkIndex + 1}/${requestData.totalChunks}: ${chunkPath}`);

        // Download the processed chunk with retry logic
        const { data: chunkData, error: downloadError } = await retryWithBackoff(
          async () => {
            const result = await supabase.storage
              .from("processed-pdfs")
              .download(chunkPath);

            if (result.error) {
              throw new Error(result.error.message || JSON.stringify(result.error));
            }

            return result;
          },
          3, // max 3 retries
          1000, // start with 1 second delay
          `Download chunk ${chunkIndex + 1}/${requestData.totalChunks}`
        );

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

      // Brief pause between batches to allow memory cleanup
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Finished merging all chunks. Final PDF has ${totalPages} pages`);

    // Save the merged PDF with optimization for large files
    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 25, // Reduced for better performance
      updateFieldAppearances: false, // Skip field appearance updates
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

    // Start cleanup process asynchronously - don't wait for it
    console.log("Starting cleanup process...");
    cleanupFiles(supabase, requestData.processedChunkPaths, requestData.sessionId, requestData.totalChunks)
      .then(() => console.log("Cleanup completed"))
      .catch(error => console.warn("Cleanup failed:", error));

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

async function cleanupFiles(supabase: any, processedChunkPaths: string[], sessionId: string, totalChunks: number) {
  // Clean up processed chunk files
  console.log("Cleaning up temporary chunk files...");
  for (const chunkPath of processedChunkPaths) {
    try {
      await supabase.storage
        .from("processed-pdfs")
        .remove([chunkPath]);
      console.log(`Cleaned up: ${chunkPath}`);
    } catch (cleanupError) {
      console.warn(`Failed to cleanup ${chunkPath}:`, cleanupError);
    }
  }

  // Clean up original chunk files from the pdfs bucket
  try {
    const chunkFilesToClean = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkFilesToClean.push(`${sessionId}/chunks/chunk_${i}.pdf`);
    }

    await supabase.storage
      .from("pdfs")
      .remove(chunkFilesToClean);
    console.log("Cleaned up original chunk files");
  } catch (cleanupError) {
    console.warn("Failed to cleanup original chunk files:", cleanupError);
  }
}