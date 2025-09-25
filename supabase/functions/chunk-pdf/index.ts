import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const CHUNK_SIZE = 1; // Single page per chunk (minimize CPU usage per Edge Function call)

interface ChunkRequest {
  sessionId: string;
  pdfPath: string;
  totalPages: number;
}

interface ChunkInfo {
  chunkIndex: number;
  chunkPath: string;
  startPage: number;
  endPage: number;
  pageCount: number;
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

    let requestData: ChunkRequest;
    try {
      requestData = await req.json();
    } catch (parseError) {
      throw new Error(`Failed to parse request JSON: ${parseError.message}`);
    }

    console.log("Chunking PDF for session:", requestData.sessionId);
    console.log("Total pages:", requestData.totalPages);

    // Calculate number of chunks needed
    const totalChunks = Math.ceil(requestData.totalPages / CHUNK_SIZE);
    console.log(`Creating ${totalChunks} chunks of ~${CHUNK_SIZE} pages each`);

    // Download the original PDF
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("pdfs")
      .download(requestData.pdfPath);

    if (downloadError) throw new Error(`Failed to download PDF: ${downloadError.message}`);

    const pdfBytes = await pdfData.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBytes);

    const chunks: ChunkInfo[] = [];

    // Process chunks in batches to avoid timeout
    const BATCH_SIZE = 50; // Process 50 chunks at a time
    const batches = [];
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      batches.push({
        start: i,
        end: Math.min(i + BATCH_SIZE, totalChunks)
      });
    }

    console.log(`Processing ${totalChunks} chunks in ${batches.length} batches of up to ${BATCH_SIZE}`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing chunk batch ${batchIndex + 1}/${batches.length} (chunks ${batch.start + 1}-${batch.end})`);

      // Create chunks in this batch
      for (let chunkIndex = batch.start; chunkIndex < batch.end; chunkIndex++) {
        const startPage = chunkIndex * CHUNK_SIZE;
        const endPage = Math.min(startPage + CHUNK_SIZE - 1, requestData.totalPages - 1);
        const pageCount = endPage - startPage + 1;

        console.log(`Creating chunk ${chunkIndex + 1}/${totalChunks}: pages ${startPage + 1}-${endPage + 1} (${pageCount} pages)`);

        try {
          // Create a new PDF for this chunk
          const chunkPdf = await PDFDocument.create();

          // Copy pages for this chunk
          const pageIndices = Array.from({ length: pageCount }, (_, i) => startPage + i);
          const copiedPages = await chunkPdf.copyPages(sourcePdf, pageIndices);

          // Add all copied pages to the chunk PDF
          copiedPages.forEach(page => chunkPdf.addPage(page));

          // Save the chunk (optimized for performance)
          const chunkBytes = await chunkPdf.save({
            useObjectStreams: false,
            addDefaultPage: false,
            objectsPerTick: 25, // Reduced for less CPU per iteration
            updateFieldAppearances: false, // Skip field appearance updates
          });

          console.log(`Chunk ${chunkIndex + 1} size: ${chunkBytes.length} bytes`);

          // Upload chunk to storage with retry logic
          const chunkPath = `${requestData.sessionId}/chunks/chunk_${chunkIndex}.pdf`;
          let uploadSuccess = false;
          let retryCount = 0;
          const maxRetries = 3;

          while (!uploadSuccess && retryCount < maxRetries) {
            try {
              const { error: uploadError } = await supabase.storage
                .from("pdfs")
                .upload(chunkPath, chunkBytes, {
                  contentType: "application/pdf",
                  upsert: true
                });

              if (uploadError) {
                throw new Error(`Upload error: ${uploadError.message}`);
              }

              uploadSuccess = true;
              console.log(`✓ Chunk ${chunkIndex + 1} uploaded: ${chunkPath}`);
            } catch (uploadError) {
              retryCount++;
              console.warn(`Upload attempt ${retryCount} failed for chunk ${chunkIndex + 1}:`, uploadError.message);

              if (retryCount < maxRetries) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
              } else {
                throw new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts: ${uploadError.message}`);
              }
            }
          }

          const chunkInfo: ChunkInfo = {
            chunkIndex,
            chunkPath,
            startPage,
            endPage,
            pageCount
          };

          chunks.push(chunkInfo);

        } catch (chunkError) {
          console.error(`Error creating chunk ${chunkIndex + 1}:`, chunkError);
          throw new Error(`Failed to create chunk ${chunkIndex + 1}: ${chunkError.message}`);
        }
      }

      // Brief pause between batches to allow memory cleanup and prevent rate limiting
      if (batchIndex < batches.length - 1) {
        console.log(`Batch ${batchIndex + 1} completed. Pausing before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`PDF successfully chunked into ${chunks.length} pieces`);

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: requestData.sessionId,
        totalChunks: chunks.length,
        chunks,
        message: `PDF split into ${chunks.length} chunks of ~${CHUNK_SIZE} pages each`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error chunking PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});