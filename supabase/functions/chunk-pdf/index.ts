import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 20; // Pages per chunk

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: ChunkRequest = await req.json();

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

    // Create chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const startPage = chunkIndex * CHUNK_SIZE;
      const endPage = Math.min(startPage + CHUNK_SIZE - 1, requestData.totalPages - 1);
      const pageCount = endPage - startPage + 1;

      console.log(`Creating chunk ${chunkIndex + 1}/${totalChunks}: pages ${startPage + 1}-${endPage + 1} (${pageCount} pages)`);

      // Create a new PDF for this chunk
      const chunkPdf = await PDFDocument.create();

      // Copy pages for this chunk
      const pageIndices = Array.from({ length: pageCount }, (_, i) => startPage + i);
      const copiedPages = await chunkPdf.copyPages(sourcePdf, pageIndices);

      // Add all copied pages to the chunk PDF
      copiedPages.forEach(page => chunkPdf.addPage(page));

      // Save the chunk
      const chunkBytes = await chunkPdf.save({
        useObjectStreams: false,
        addDefaultPage: false,
        objectsPerTick: 50,
      });

      // Upload chunk to storage
      const chunkPath = `${requestData.sessionId}/chunks/chunk_${chunkIndex}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("pdfs")
        .upload(chunkPath, chunkBytes, {
          contentType: "application/pdf",
          upsert: true
        });

      if (uploadError) throw new Error(`Failed to upload chunk ${chunkIndex}: ${uploadError.message}`);

      const chunkInfo: ChunkInfo = {
        chunkIndex,
        chunkPath,
        startPage,
        endPage,
        pageCount
      };

      chunks.push(chunkInfo);
      console.log(`Chunk ${chunkIndex} created: ${chunkPath}`);
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