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
  startPage?: number; // Optional: start page for progressive chunking (0-indexed)
  endPage?: number;   // Optional: end page for progressive chunking (0-indexed)
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
    console.log("Total pages in document:", requestData.totalPages);

    // Determine which pages to chunk (support progressive chunking)
    const startPage = requestData.startPage ?? 0;
    const endPage = requestData.endPage ?? (requestData.totalPages - 1);
    const pagesToChunk = endPage - startPage + 1;

    console.log(`Chunking pages ${startPage + 1}-${endPage + 1} (${pagesToChunk} pages)`);

    // Calculate number of chunks needed for this range
    const totalChunks = Math.ceil(pagesToChunk / CHUNK_SIZE);
    console.log(`Creating ${totalChunks} chunks of ~${CHUNK_SIZE} pages each`);

    // Download the original PDF with retry logic
    let pdfData: Blob | null = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (!pdfData && retryCount < maxRetries) {
      try {
        const { data, error: downloadError } = await supabase.storage
          .from("pdfs")
          .download(requestData.pdfPath);

        if (downloadError) {
          throw new Error(downloadError.message);
        }

        pdfData = data;
      } catch (downloadError) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to download PDF after ${maxRetries} attempts: ${downloadError.message}`);
        }
        const backoffTime = 1000 * Math.pow(2, retryCount - 1);
        console.warn(`Download attempt ${retryCount}/${maxRetries} failed, retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }

    if (!pdfData) {
      throw new Error("Failed to download PDF: No data returned");
    }

    const pdfBytes = await pdfData.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBytes);

    const chunks: ChunkInfo[] = [];
    const startTime = Date.now();
    const maxExecutionTime = 120000; // 120 seconds (2 minutes - increased from 80s)
    let lastProcessedPage = startPage - 1;

    // Create chunks for the specified page range
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      // Check if we're approaching timeout - if so, return partial results
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxExecutionTime) {
        console.warn(`⚠️ Approaching function timeout after processing ${chunks.length}/${totalChunks} chunks`);
        console.log(`Returning partial results. Processed pages ${startPage + 1}-${lastProcessedPage + 1}`);

        // Return partial success with information about what was processed
        return new Response(
          JSON.stringify({
            success: true,
            partial: true,
            sessionId: requestData.sessionId,
            totalChunks: chunks.length,
            chunks,
            nextStartPage: lastProcessedPage + 1, // Next page to continue from
            remainingPages: endPage - lastProcessedPage,
            message: `Partial chunking: Processed ${chunks.length} chunks (pages ${startPage + 1}-${lastProcessedPage + 1}). Continue from page ${lastProcessedPage + 2}`
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Calculate local page indices within this batch
      const localStartPage = chunkIndex * CHUNK_SIZE;
      const localEndPage = Math.min(localStartPage + CHUNK_SIZE - 1, pagesToChunk - 1);

      // Calculate global page indices in the full document
      const globalStartPage = startPage + localStartPage;
      const globalEndPage = startPage + localEndPage;
      const pageCount = localEndPage - localStartPage + 1;

      // Calculate global chunk index (used for file naming and tracking)
      const globalChunkIndex = globalStartPage; // Use global start page as chunk index

      console.log(`Creating chunk ${chunkIndex + 1}/${totalChunks}: pages ${globalStartPage + 1}-${globalEndPage + 1} (${pageCount} pages)`);

      try {
        // Create a new PDF for this chunk
        const chunkPdf = await PDFDocument.create();

        // Copy pages for this chunk using global page indices
        const pageIndices = Array.from({ length: pageCount }, (_, i) => globalStartPage + i);
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
        const chunkPath = `${requestData.sessionId}/chunks/chunk_${globalChunkIndex}.pdf`;
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
              throw new Error(`Failed to upload chunk ${globalChunkIndex} after ${maxRetries} attempts: ${uploadError.message}`);
            }
          }
        }

        const chunkInfo: ChunkInfo = {
          chunkIndex: globalChunkIndex, // Use global chunk index
          chunkPath,
          startPage: globalStartPage,
          endPage: globalEndPage,
          pageCount
        };

        chunks.push(chunkInfo);
        lastProcessedPage = globalEndPage; // Track the last page we successfully processed

      } catch (chunkError) {
        console.error(`Error creating chunk ${chunkIndex + 1}:`, chunkError);
        throw new Error(`Failed to create chunk ${chunkIndex + 1}: ${chunkError.message}`);
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