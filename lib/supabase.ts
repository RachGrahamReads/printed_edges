import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'

// These values should be set in your environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Only create client if both URL and key are provided
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

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

    // Get public URL for PDF
    const { data: pdfUrlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(pdfPath);

    // Upload edge images directly and get their URLs
    const edgeUrls: any = {};

    if (edgeFiles.side) {
      const sidePath = `${sessionId}/edge-side.png`;
      const { error: sideError } = await supabase.storage
        .from('edge-images')
        .upload(sidePath, edgeFiles.side, {
          contentType: edgeFiles.side.type,
          upsert: true
        });

      if (sideError) throw new Error(`Failed to upload side edge: ${sideError.message}`);

      const { data: sideUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(sidePath);

      edgeUrls.side = sideUrlData.publicUrl;
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

      const { data: topUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(topPath);

      edgeUrls.top = topUrlData.publicUrl;
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

      const { data: bottomUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(bottomPath);

      edgeUrls.bottom = bottomUrlData.publicUrl;
    }

    // Call Supabase Edge Function with storage URLs
    const { data, error } = await supabase.functions.invoke('process-pdf-urls', {
      body: {
        pdfUrl: pdfUrlData.publicUrl,
        edgeUrls,
        numPages: options.numPages,
        pageType: options.pageType,
        bleedType: options.bleedType,
        edgeType: options.edgeType,
        outputPath: `${sessionId}/processed.pdf`
      }
    });

    if (error) throw error;

    // Handle the response from Edge Function
    if (data.processedPdfUrl) {
      // Download the processed PDF
      const response = await fetch(data.processedPdfUrl);
      if (!response.ok) throw new Error('Failed to download processed PDF');
      return await response.arrayBuffer();
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

