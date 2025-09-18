import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface SliceStoragePaths {
  side?: {
    raw: string[];
    masked: string[];
  };
  top?: {
    raw: string[];
    masked: string[];
  };
  bottom?: {
    raw: string[];
    masked: string[];
  };
}

interface ProcessRequest {
  pdfBase64: string;
  sliceStoragePaths: SliceStoragePaths;
  numPages: number;
  pageType: string;
  bleedType: 'add_bleed' | 'existing_bleed';
  edgeType: 'side-only' | 'all-edges';
  trimWidth?: number;
  trimHeight?: number;
  sessionId: string;
}

async function base64ToUint8Array(base64: string): Promise<Uint8Array> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const binaryString = String.fromCharCode(...uint8Array);
  return btoa(binaryString);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestData: ProcessRequest = await req.json();

    console.log('Processing PDF with storage-based sliced images...');
    console.log('Request received:', {
      hasPdf: !!requestData.pdfBase64,
      hasStoragePaths: !!requestData.sliceStoragePaths,
      edgeType: requestData.edgeType,
      numPages: requestData.numPages,
      sessionId: requestData.sessionId,
      sideSlicesRaw: requestData.sliceStoragePaths.side?.raw.length || 0,
      sideSlicesMasked: requestData.sliceStoragePaths.side?.masked.length || 0,
      topSlicesRaw: requestData.sliceStoragePaths.top?.raw.length || 0,
      topSlicesMasked: requestData.sliceStoragePaths.top?.masked.length || 0,
      bottomSlicesRaw: requestData.sliceStoragePaths.bottom?.raw.length || 0,
      bottomSlicesMasked: requestData.sliceStoragePaths.bottom?.masked.length || 0
    });

    // Validate required fields
    if (!requestData.pdfBase64) {
      throw new Error("PDF base64 data is required");
    }

    if (!requestData.sliceStoragePaths ||
        (requestData.edgeType === 'side-only' && !requestData.sliceStoragePaths.side) ||
        (requestData.edgeType === 'all-edges' && !requestData.sliceStoragePaths.side && !requestData.sliceStoragePaths.top && !requestData.sliceStoragePaths.bottom)) {
      throw new Error("Slice storage paths are required based on edge type");
    }

    // Initialize Supabase client for storage access
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convert base64 PDF to bytes
    const pdfBytes = await base64ToUint8Array(requestData.pdfBase64);
    console.log('PDF bytes loaded:', pdfBytes.length);

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

    // Create new PDF
    const newPdfDoc = await PDFDocument.create();

    // Set metadata
    newPdfDoc.setTitle('Processed PDF with Storage-Based Sliced Edges');
    newPdfDoc.setProducer('Printed Edges App');
    newPdfDoc.setCreationDate(new Date());
    newPdfDoc.setModificationDate(new Date());

    // Cache for embedded sliced images
    const embeddedSlices: { [key: string]: any } = {};

    console.log('Created new PDF document');

    // Process each page
    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      console.log(`Processing page ${pageNum + 1}/${pages.length}`);

      // Calculate which leaf this page belongs to
      const leafNumber = Math.floor(pageNum / 2);

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

      // Add edge image processing with storage-based sliced images
      const edgeStripWidth = BLEED_POINTS + SAFETY_BUFFER_POINTS;
      const edgeStripHeight = BLEED_POINTS + SAFETY_BUFFER_POINTS;

      // Process side edges with storage-based sliced images (always processed if available)
      if (requestData.sliceStoragePaths.side && requestData.sliceStoragePaths.side.masked[leafNumber]) {
        try {
          const slicePath = requestData.sliceStoragePaths.side.masked[leafNumber];
          const flipHorizontally = pageNum % 2 !== 0; // Left pages are flipped
          const cacheKey = `side_${leafNumber}_${flipHorizontally}`;

          // Embed the sliced image if not already cached
          if (!embeddedSlices[cacheKey]) {
            console.log(`Loading side slice from storage: ${slicePath}`);

            // Download slice from storage
            const { data: sliceBlob, error: downloadError } = await supabase.storage
              .from('edge-images')
              .download(slicePath);

            if (downloadError) {
              throw new Error(`Failed to download slice: ${downloadError.message}`);
            }

            // Convert blob to base64 and embed
            const sliceBase64 = await blobToBase64(sliceBlob);
            const imageBytes = await base64ToUint8Array(sliceBase64);
            embeddedSlices[cacheKey] = await newPdfDoc.embedPng(imageBytes);
          }

          // Position the image
          let sideX;
          if (pageNum % 2 === 0) {
            // Right page
            sideX = newWidth - edgeStripWidth;
          } else {
            // Left page
            sideX = 0;
          }

          // Draw the edge image with mitred corners (always use all-edges mode)
          if (flipHorizontally) {
            // Left page - use full height, triangle masks handle corners
            newPage.drawImage(embeddedSlices[cacheKey], {
              x: 0,
              y: 0,
              width: edgeStripWidth,
              height: newHeight,
              transform: [-1, 0, 0, 1, edgeStripWidth, 0] // Horizontal flip matrix
            });
          } else {
            // Right page - use full height, triangle masks handle corners
            newPage.drawImage(embeddedSlices[cacheKey], {
              x: sideX,
              y: 0,
              width: edgeStripWidth,
              height: newHeight,
            });
          }

          console.log(`Added storage-based side edge image (leaf ${leafNumber}) to page ${pageNum + 1} (${flipHorizontally ? 'flipped' : 'normal'})`);
        } catch (error) {
          console.error(`Failed to add side edge to page ${pageNum + 1}:`, error.message);
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

      // Add top/bottom edges with storage-based sliced images (always processed)
      {
        // Top edge
        if (requestData.sliceStoragePaths.top && requestData.sliceStoragePaths.top.masked[leafNumber]) {
          try {
            const slicePath = requestData.sliceStoragePaths.top.masked[leafNumber];
            const flipHorizontally = pageNum % 2 !== 0; // Left pages are flipped
            const cacheKey = `top_${leafNumber}_${flipHorizontally}`;

            if (!embeddedSlices[cacheKey]) {
              console.log(`Loading top slice from storage: ${slicePath}`);

              // Download slice from storage
              const { data: sliceBlob, error: downloadError } = await supabase.storage
                .from('edge-images')
                .download(slicePath);

              if (downloadError) {
                throw new Error(`Failed to download slice: ${downloadError.message}`);
              }

              // Convert blob to base64 and embed
              const sliceBase64 = await blobToBase64(sliceBlob);
              const imageBytes = await base64ToUint8Array(sliceBase64);
              embeddedSlices[cacheKey] = await newPdfDoc.embedPng(imageBytes);
            }

            if (flipHorizontally) {
              // Left page - use horizontal flip transform (triangle mask is automatically flipped)
              newPage.drawImage(embeddedSlices[cacheKey], {
                x: 0,
                y: newHeight - edgeStripHeight,
                width: newWidth,
                height: edgeStripHeight,
                transform: [-1, 0, 0, 1, newWidth, 0] // Horizontal flip
              });
            } else {
              // Right page - use pre-processed triangle mask directly
              newPage.drawImage(embeddedSlices[cacheKey], {
                x: 0,
                y: newHeight - edgeStripHeight,
                width: newWidth,
                height: edgeStripHeight,
              });
            }

            console.log(`Added storage-based top edge image (leaf ${leafNumber}) to page ${pageNum + 1} (${flipHorizontally ? 'flipped' : 'normal'})`);
          } catch (error) {
            console.error(`Failed to add top edge to page ${pageNum + 1}:`, error.message);
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
        if (requestData.sliceStoragePaths.bottom && requestData.sliceStoragePaths.bottom.masked[leafNumber]) {
          try {
            const slicePath = requestData.sliceStoragePaths.bottom.masked[leafNumber];
            const flipHorizontally = pageNum % 2 !== 0; // Left pages are flipped
            const cacheKey = `bottom_${leafNumber}_${flipHorizontally}`;

            if (!embeddedSlices[cacheKey]) {
              console.log(`Loading bottom slice from storage: ${slicePath}`);

              // Download slice from storage
              const { data: sliceBlob, error: downloadError } = await supabase.storage
                .from('edge-images')
                .download(slicePath);

              if (downloadError) {
                throw new Error(`Failed to download slice: ${downloadError.message}`);
              }

              // Convert blob to base64 and embed
              const sliceBase64 = await blobToBase64(sliceBlob);
              const imageBytes = await base64ToUint8Array(sliceBase64);
              embeddedSlices[cacheKey] = await newPdfDoc.embedPng(imageBytes);
            }

            if (flipHorizontally) {
              // Left page - use horizontal flip transform (triangle mask is automatically flipped)
              newPage.drawImage(embeddedSlices[cacheKey], {
                x: 0,
                y: 0,
                width: newWidth,
                height: edgeStripHeight,
                transform: [-1, 0, 0, 1, newWidth, 0] // Horizontal flip
              });
            } else {
              // Right page - use pre-processed triangle mask directly
              newPage.drawImage(embeddedSlices[cacheKey], {
                x: 0,
                y: 0,
                width: newWidth,
                height: edgeStripHeight,
              });
            }

            console.log(`Added storage-based bottom edge image (leaf ${leafNumber}) to page ${pageNum + 1} (${flipHorizontally ? 'flipped' : 'normal'})`);
          } catch (error) {
            console.error(`Failed to add bottom edge to page ${pageNum + 1}:`, error.message);
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

    // Convert to base64 for response
    const base64Pdf = btoa(String.fromCharCode(...processedPdfBytes));

    return new Response(JSON.stringify({
      success: true,
      pdfData: `data:application/pdf;base64,${base64Pdf}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'PDF processing failed in Storage-based Edge Function'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});