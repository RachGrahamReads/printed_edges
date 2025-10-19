import { createClient as createSupabaseClient } from './supabase/client'
import { supabaseAdmin } from './supabase-admin'

// Use the singleton client instance to avoid multiple GoTrueClient instances
export const supabase = createSupabaseClient()

export async function processPDFWithSupabase(
  pdfFile: File,
  edgeFiles: {
    side?: File;
    top?: File;
    bottom?: File;
  },
  options: {
    numPages: number;
    pageType: string;
    bleedType: 'add_bleed' | 'existing_bleed';
    edgeType: 'side-only' | 'all-edges';
    trimWidth?: number;
    trimHeight?: number;
  }
) {
  // Always use Supabase for PDF processing
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  try {
    // Generate unique session ID for this processing job
    const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Upload PDF directly from client
    const pdfPath = `${sessionId}/original.pdf`;
    const { data: pdfUpload, error: pdfError } = await supabase.storage
      .from('pdfs')
      .upload(pdfPath, pdfFile, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (pdfError) throw new Error(`Failed to upload PDF: ${pdfError.message}`);

    // Upload edge images directly and track their paths
    const edgePaths: any = {};

    if (edgeFiles.side) {
      const sidePath = `${sessionId}/edge-side.png`;
      const { error: sideError } = await supabase.storage
        .from('edge-images')
        .upload(sidePath, edgeFiles.side, {
          contentType: edgeFiles.side.type,
          upsert: true
        });

      if (sideError) throw new Error(`Failed to upload side edge: ${sideError.message}`);

      edgePaths.side = sidePath;
    }

    if (edgeFiles.top) {
      const topPath = `${sessionId}/edge-top.png`;
      const { error: topError } = await supabase.storage
        .from('edge-images')
        .upload(topPath, edgeFiles.top, {
          contentType: edgeFiles.top.type,
          upsert: true
        });

      if (topError) throw new Error(`Failed to upload top edge: ${topError.message}`);

      edgePaths.top = topPath;
    }

    if (edgeFiles.bottom) {
      const bottomPath = `${sessionId}/edge-bottom.png`;
      const { error: bottomError } = await supabase.storage
        .from('edge-images')
        .upload(bottomPath, edgeFiles.bottom, {
          contentType: edgeFiles.bottom.type,
          upsert: true
        });

      if (bottomError) throw new Error(`Failed to upload bottom edge: ${bottomError.message}`);

      edgePaths.bottom = bottomPath;
    }

    // Use appropriate function based on PDF size
    const useLargeProcessing = options.numPages > 50;
    const functionName = useLargeProcessing ? 'process-large-pdf' : 'process-pdf-urls';

    console.log(`Processing ${options.numPages} pages using ${functionName}`);

    // Call Supabase Edge Function with storage paths
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        pdfPath: pdfPath,
        edgePaths,
        numPages: options.numPages,
        pageType: options.pageType,
        bleedType: options.bleedType,
        edgeType: options.edgeType,
        outputPath: `${sessionId}/processed.pdf`
      }
    });

    if (error) throw error;

    // Handle the response from Edge Function
    if (data.success) {
      const processedPdfPath = `${sessionId}/processed.pdf`;

      // Download the processed PDF directly from storage using Supabase SDK
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('processed-pdfs')
        .download(processedPdfPath);

      if (downloadError) throw new Error(`Failed to download processed PDF: ${downloadError.message}`);

      const arrayBuffer = await pdfData.arrayBuffer();

      // Clean up: Delete the processed PDF from storage after successful download
      // This prevents storage from filling up since we don't store PDFs long-term
      await supabase.storage
        .from('processed-pdfs')
        .remove([processedPdfPath])
        .catch(err => console.warn('Failed to cleanup processed PDF:', err));

      return arrayBuffer;
    }

    // Fallback: if Edge Function returns base64 data directly
    if (data.pdfData) {
      const pdfBase64 = data.pdfData.split(',')[1];
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    throw new Error('No processed PDF returned from Edge Function');

  } catch (error) {
    console.error('Error processing PDF with Supabase:', error);
    throw error;
  }
}

