import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Constants
const BLEED_INCHES = 0.125;
const SAFETY_BUFFER_INCHES = 0.125;
const POINTS_PER_INCH = 72;
const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;
const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH;

// Page thickness per type in inches
const PAGE_THICKNESS: Record<string, number> = {
  "bw": 0.0032,
  "standard": 0.0032,
  "premium": 0.0037
};

interface ProcessRequest {
  pdfPath: string; // Storage path, not URL
  edgePaths: {
    side?: string; // Storage path, not URL
    top?: string;   // Storage path, not URL
    bottom?: string; // Storage path, not URL
  };
  numPages: number;
  pageType: string;
  bleedType: 'add_bleed' | 'existing_bleed';
  edgeType: 'side-only' | 'all-edges';
  outputPath: string;
}

// Helper to download file from Supabase storage
async function downloadFromStorage(supabase: any, bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error) {
    throw new Error(`Failed to download from storage ${bucket}/${path}: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// Helper to download file from URL (fallback for external URLs)
async function downloadFromUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestData: ProcessRequest = await req.json();

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('Processing PDF from storage...');
    console.log('Request received:', {
      pdfPath: requestData.pdfPath,
      hasEdgePaths: !!requestData.edgePaths,
      edgeType: requestData.edgeType,
      numPages: requestData.numPages,
      outputPath: requestData.outputPath
    });

    // Download PDF from storage
    const pdfBytes = await downloadFromStorage(supabase, 'pdfs', requestData.pdfPath);
    console.log('PDF downloaded:', pdfBytes.length, 'bytes');

    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const pages = pdfDoc.getPages();
    console.log('PDF loaded with', pages.length, 'pages');

    if (pages.length === 0) {
      throw new Error("PDF has no pages");
    }

    const firstPage = pages[0];
    const { width: originalWidth, height: originalHeight } = firstPage.getSize();
    console.log('Original page size:', originalWidth, 'x', originalHeight);

    // Calculate bleed dimensions
    let newWidth = originalWidth;
    let newHeight = originalHeight;
    let bleedPoints = 0;

    if (requestData.bleedType === 'add_bleed') {
      bleedPoints = BLEED_POINTS;
      newWidth = originalWidth + bleedPoints;
      newHeight = originalHeight + (2 * bleedPoints);
      console.log('Adding bleed - new size:', newWidth, 'x', newHeight);
    }

    // Calculate number of leaves
    const numLeaves = Math.ceil(requestData.numPages / 2);

    // Create new PDF
    const newPdfDoc = await PDFDocument.create();

    // Set metadata
    newPdfDoc.setTitle('Processed PDF with Edges');
    newPdfDoc.setProducer('Printed Edges App');
    newPdfDoc.setCreationDate(new Date());
    newPdfDoc.setModificationDate(new Date());

    // Download edge images from storage
    const edgeImages: Record<string, Uint8Array> = {};

    if (requestData.edgePaths.side) {
      console.log('Downloading side edge image from storage...');
      edgeImages.side = await downloadFromStorage(supabase, 'edge-images', requestData.edgePaths.side);
    }

    if (requestData.edgePaths.top) {
      console.log('Downloading top edge image from storage...');
      edgeImages.top = await downloadFromStorage(supabase, 'edge-images', requestData.edgePaths.top);
    }

    if (requestData.edgePaths.bottom) {
      console.log('Downloading bottom edge image from storage...');
      edgeImages.bottom = await downloadFromStorage(supabase, 'edge-images', requestData.edgePaths.bottom);
    }

    // Cache for embedded images
    let sideImageCache: any = {};
    let topImageCache: any = {};
    let bottomImageCache: any = {};

    console.log('Processing pages...');

    // Process each page
    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      console.log(`Processing page ${pageNum + 1}/${pages.length}`);

      // Create new page with bleed dimensions
      const newPage = newPdfDoc.addPage([newWidth, newHeight]);

      // Embed the original page
      const [embeddedPage] = await newPdfDoc.embedPdf(pdfDoc, [pageNum]);

      // Position original content based on bleed type
      let xPos = 0;
      let yPos = 0;

      if (requestData.bleedType === 'add_bleed') {
        if (pageNum % 2 === 0) {
          // Right page - content stays at left
          xPos = 0;
          yPos = bleedPoints;
        } else {
          // Left page - content moves right
          xPos = bleedPoints;
          yPos = bleedPoints;
        }
      }

      // Draw the original page content
      newPage.drawPage(embeddedPage, {
        x: xPos,
        y: yPos,
        width: originalWidth,
        height: originalHeight,
      });

      // Add edge image processing
      const edgeStripWidth = BLEED_POINTS + SAFETY_BUFFER_POINTS;
      const leafNumber = Math.floor(pageNum / 2);

      // Process side edges (simplified for URL version)
      if ((requestData.edgeType === 'side-only' || requestData.edgeType === 'all-edges') && edgeImages.side) {
        try {
          const flipHorizontally = pageNum % 2 !== 0;
          const cacheKey = `${leafNumber}_${flipHorizontally}`;

          if (!sideImageCache[cacheKey]) {
            sideImageCache[cacheKey] = await newPdfDoc.embedPng(edgeImages.side);
          }

          let sideX;
          if (pageNum % 2 === 0) {
            // Right page
            sideX = newWidth - edgeStripWidth;
          } else {
            // Left page
            sideX = 0;
          }

          // Draw the edge image
          if (flipHorizontally) {
            // Apply horizontal flip using transform matrix
            newPage.drawImage(sideImageCache[cacheKey], {
              x: sideX,
              y: 0,
              width: edgeStripWidth,
              height: newHeight,
              transform: [-1, 0, 0, 1, sideX + edgeStripWidth, 0]
            });
          } else {
            newPage.drawImage(sideImageCache[cacheKey], {
              x: sideX,
              y: 0,
              width: edgeStripWidth,
              height: newHeight,
            });
          }

          console.log(`Added side edge to page ${pageNum + 1}`);
        } catch (error) {
          console.error(`Failed to add side edge to page ${pageNum + 1}:`, error);
          // Fallback to colored rectangle
          let sideX = pageNum % 2 === 0 ? newWidth - edgeStripWidth : 0;
          newPage.drawRectangle({
            x: sideX,
            y: 0,
            width: edgeStripWidth,
            height: newHeight,
            color: rgb(0.65, 0.45, 0.25),
            opacity: 0.3,
          });
        }
      }

      // Add top/bottom edges for all-edges mode
      if (requestData.edgeType === 'all-edges') {
        const edgeStripHeight = BLEED_POINTS + SAFETY_BUFFER_POINTS;
        const flipHorizontally = pageNum % 2 !== 0;

        // Top edge
        if (edgeImages.top) {
          try {
            const cacheKey = `${leafNumber}_${flipHorizontally}`;

            if (!topImageCache[cacheKey]) {
              topImageCache[cacheKey] = await newPdfDoc.embedPng(edgeImages.top);
            }

            if (flipHorizontally) {
              newPage.drawImage(topImageCache[cacheKey], {
                x: 0,
                y: newHeight - edgeStripHeight,
                width: newWidth,
                height: edgeStripHeight,
                transform: [-1, 0, 0, 1, newWidth, newHeight - edgeStripHeight]
              });
            } else {
              newPage.drawImage(topImageCache[cacheKey], {
                x: 0,
                y: newHeight - edgeStripHeight,
                width: newWidth,
                height: edgeStripHeight,
              });
            }

            console.log(`Added top edge to page ${pageNum + 1}`);
          } catch (error) {
            console.error(`Failed to add top edge to page ${pageNum + 1}:`, error);
            newPage.drawRectangle({
              x: 0,
              y: newHeight - edgeStripHeight,
              width: newWidth,
              height: edgeStripHeight,
              color: rgb(0.6, 0.4, 0.2),
              opacity: 0.3,
            });
          }
        }

        // Bottom edge
        if (edgeImages.bottom) {
          try {
            const cacheKey = `${leafNumber}_${flipHorizontally}`;

            if (!bottomImageCache[cacheKey]) {
              bottomImageCache[cacheKey] = await newPdfDoc.embedPng(edgeImages.bottom);
            }

            if (flipHorizontally) {
              newPage.drawImage(bottomImageCache[cacheKey], {
                x: 0,
                y: 0,
                width: newWidth,
                height: edgeStripHeight,
                transform: [-1, 0, 0, 1, newWidth, 0]
              });
            } else {
              newPage.drawImage(bottomImageCache[cacheKey], {
                x: 0,
                y: 0,
                width: newWidth,
                height: edgeStripHeight,
              });
            }

            console.log(`Added bottom edge to page ${pageNum + 1}`);
          } catch (error) {
            console.error(`Failed to add bottom edge to page ${pageNum + 1}:`, error);
            newPage.drawRectangle({
              x: 0,
              y: 0,
              width: newWidth,
              height: edgeStripHeight,
              color: rgb(0.55, 0.35, 0.15),
              opacity: 0.3,
            });
          }
        }
      }
    }

    console.log('Finished processing all pages, saving PDF...');

    // Save with compression options
    const processedPdfBytes = await newPdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    console.log('PDF saved successfully, size:', processedPdfBytes.length, 'bytes');

    // Upload processed PDF to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('processed-pdfs')
      .upload(requestData.outputPath, processedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Failed to upload processed PDF:', uploadError);
      // Fallback: return base64 data
      const base64Pdf = btoa(String.fromCharCode(...processedPdfBytes));
      return new Response(JSON.stringify({
        success: true,
        pdfData: `data:application/pdf;base64,${base64Pdf}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Construct proper public URL for client access
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/processed-pdfs/${requestData.outputPath}`;

    console.log('Processed PDF uploaded:', publicUrl);

    return new Response(JSON.stringify({
      success: true,
      processedPdfUrl: publicUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'PDF processing failed in Edge Function'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});