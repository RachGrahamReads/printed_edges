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
  // For resumable merges after timeout
  resumeFromPath?: string; // If provided, load this PDF and continue merging
  startIndex?: number; // Which chunk index to start from (for resume)
  forceSlowMerge?: boolean; // Force 1-at-a-time merge for complex PDFs with large images/fonts
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

    // Warn about very large merges
    if (requestData.totalChunks > 500) {
      console.warn(`⚠️ LARGE MERGE: ${requestData.totalChunks} chunks. This may approach memory limits.`);
    }

    if (requestData.totalChunks > 1000) {
      console.error(`❌ CRITICAL: ${requestData.totalChunks} chunks exceeds recommended limits. Risk of failure.`);
      throw new Error(
        `PDF is too large to process (${requestData.totalChunks} pages). ` +
        `Maximum recommended size is 500 pages. ` +
        `Please contact support for assistance with large files.`
      );
    }

    // Create the final merged PDF
    // MEMORY OPTIMIZATION: Instead of loading all chunks and copying pages,
    // we merge in smaller batches and save intermediate PDFs to avoid memory buildup

    // RESUME SUPPORT: If resuming from a timeout, load the partial PDF
    let mergedPdf: any;
    let startFromIndex = 0;
    let totalPages = 0;

    if (requestData.resumeFromPath) {
      console.log(`📂 Resuming merge from checkpoint: ${requestData.resumeFromPath}`);
      console.log(`   Starting from chunk index: ${requestData.startIndex || 0}`);

      const { data: resumeData, error: resumeError } = await supabase.storage
        .from("processed-pdfs")
        .download(requestData.resumeFromPath);

      if (resumeError) {
        console.warn(`Failed to load resume checkpoint, starting fresh: ${resumeError.message}`);
        mergedPdf = await PDFDocument.create();
      } else {
        const resumeBytes = await resumeData.arrayBuffer();
        mergedPdf = await PDFDocument.load(resumeBytes);
        totalPages = mergedPdf.getPageCount();
        startFromIndex = requestData.startIndex || 0;
        console.log(`✓ Resumed with ${totalPages} pages already merged. Continuing from chunk ${startFromIndex + 1}/${requestData.totalChunks}`);
      }
    } else {
      mergedPdf = await PDFDocument.create();
    }

    // Adaptive batch size based on chunk count and complexity
    // For merging Stage 2 PDFs (few large files), use larger batch to avoid timeout
    // For merging single-page chunks (many small files), use smaller batch for memory
    // For complex PDFs with large images/fonts, force batch size of 1
    const isMergingLargeFiles = requestData.totalChunks <= 10;
    const isComplexPdf = requestData.forceSlowMerge === true;

    let BATCH_SIZE: number;
    if (isComplexPdf) {
      BATCH_SIZE = 1; // Force 1-at-a-time for complex PDFs with large images/fonts
      console.log(`🐌 COMPLEX PDF MODE: Processing 1 file at a time due to large embedded images/fonts`);
    } else if (isMergingLargeFiles) {
      BATCH_SIZE = requestData.totalChunks; // No batching for ≤10 files
    } else {
      BATCH_SIZE = 2; // Default: 2 chunks at a time
    }

    const batches = [];
    for (let i = startFromIndex; i < requestData.totalChunks; i += BATCH_SIZE) {
      batches.push({
        start: i,
        end: Math.min(i + BATCH_SIZE, requestData.totalChunks)
      });
    }

    console.log(`Processing ${requestData.totalChunks} chunks in ${batches.length} batches of up to ${BATCH_SIZE}`);
    if (isComplexPdf) {
      console.log(`Complex PDF optimization: Merging 1 chunk at a time + saving intermediate PDFs to minimize CPU usage`);
    } else if (isMergingLargeFiles) {
      console.log(`Large file merge detected (≤10 files). Using single-pass merge without intermediate saves for speed.`);
    } else {
      console.log(`Memory optimization: Saving intermediate PDFs every ${BATCH_SIZE} chunks to prevent memory buildup`);
    }

    // Process each batch and save intermediate PDFs to free memory
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

        // Load PDF in a scoped block to allow garbage collection
        let pageCount: number;
        {
          const chunkPdf = await PDFDocument.load(chunkBytes);
          pageCount = chunkPdf.getPageCount();
          console.log(`Chunk ${chunkIndex + 1} has ${pageCount} pages`);

          // Copy all pages from this chunk to the merged PDF
          const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
          const copiedPages = await mergedPdf.copyPages(chunkPdf, pageIndices);

          // Add all copied pages to the merged PDF
          copiedPages.forEach(page => mergedPdf.addPage(page));
        }
        // chunkPdf is now out of scope and can be garbage collected

        totalPages += pageCount;
        console.log(`Added ${pageCount} pages from chunk ${chunkIndex + 1}. Total pages so far: ${totalPages}`);

        // Force garbage collection hint after each chunk
        if ((globalThis as any).gc) {
          (globalThis as any).gc();
        }
      }

      // CRITICAL MEMORY FIX: After each batch, save and reload the PDF to release memory
      // This prevents memory buildup from embedded resources in copyPages
      // For complex PDFs, ALWAYS save (even on last batch) to prevent CPU timeout
      if (batchIndex < batches.length - 1 || isComplexPdf) {
        console.log(`Saving intermediate PDF to free memory (batch ${batchIndex + 1}/${batches.length})...`);

        // Create a scoped block to ensure intermediateBytes gets garbage collected
        {
          const intermediateBytes = await mergedPdf.save({
            useObjectStreams: false,
            addDefaultPage: false,
            objectsPerTick: 100, // Increased for faster processing
            updateFieldAppearances: false,
          });

          console.log(`Intermediate PDF saved (${intermediateBytes.length} bytes). Reloading to clear memory...`);

          // Release the old PDF from memory and load the compacted version
          mergedPdf = await PDFDocument.load(intermediateBytes);
        }
        // intermediateBytes is now out of scope and eligible for garbage collection

        // Give the runtime a moment to garbage collect
        await new Promise(resolve => setTimeout(resolve, 100));

        if ((globalThis as any).gc) {
          (globalThis as any).gc();
        }

        console.log(`Memory reset complete. Continuing merge...`);
      }
    }

    console.log(`Finished merging all chunks. Final PDF has ${totalPages} pages`);

    // Save the merged PDF with optimization for speed
    const startSave = Date.now();
    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 100, // Increased for faster processing (was 25)
      updateFieldAppearances: false, // Skip field appearance updates
    });
    console.log(`PDF save completed in ${Date.now() - startSave}ms`);

    console.log(`Merged PDF size: ${mergedBytes.length} bytes`);

    // Upload the final merged PDF with retry logic
    await retryWithBackoff(
      async () => {
        const { error: uploadError } = await supabase.storage
          .from("processed-pdfs")
          .upload(requestData.outputPath, mergedBytes, {
            contentType: "application/pdf",
            upsert: true
          });

        if (uploadError) {
          throw new Error(uploadError.message || JSON.stringify(uploadError));
        }
      },
      3, // max 3 retries
      1000, // start with 1 second delay
      "Upload merged PDF"
    );

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