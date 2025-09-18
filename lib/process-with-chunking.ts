import { createClient } from '@supabase/supabase-js';
import { createAndStoreRawSlices, createAndStoreMaskedSlices } from './edge-slicer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const CHUNK_SIZE = 20; // Process 20 pages at a time

export async function processPDFWithChunking(
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
    trimWidth: number;
    trimHeight: number;
    scaleMode?: 'stretch' | 'fit' | 'fill' | 'none';
  },
  onProgress?: (progress: number) => void
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  try {
    const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // First, convert edge files to base64 for slicing
    const edgeImages: any = {};

    if (edgeFiles.side) {
      const sideBase64 = await fileToBase64(edgeFiles.side);
      edgeImages.side = { base64: sideBase64 };
    }

    if (edgeFiles.top) {
      const topBase64 = await fileToBase64(edgeFiles.top);
      edgeImages.top = { base64: topBase64 };
    }

    if (edgeFiles.bottom) {
      const bottomBase64 = await fileToBase64(edgeFiles.bottom);
      edgeImages.bottom = { base64: bottomBase64 };
    }

    // Calculate PDF dimensions with bleed (matching the server-side calculations)
    const BLEED_INCHES = 0.125;
    const POINTS_PER_INCH = 72;
    const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;

    let pdfWidth = options.trimWidth;
    let pdfHeight = options.trimHeight;

    if (options.bleedType === 'add_bleed') {
      pdfWidth = options.trimWidth + BLEED_POINTS;
      pdfHeight = options.trimHeight + (2 * BLEED_POINTS);
    }

    console.log('Creating and storing raw slices...');

    // STAGE 1: Create raw slices and store them
    const rawSlicesPaths = await createAndStoreRawSlices(edgeImages, {
      numPages: options.numPages,
      pageType: options.pageType as 'bw' | 'standard' | 'premium',
      edgeType: options.edgeType,
      trimWidth: options.trimWidth,
      trimHeight: options.trimHeight,
      scaleMode: options.scaleMode,
      pdfDimensions: { width: pdfWidth, height: pdfHeight }
    }, sessionId);

    console.log(`Created raw slices - Side: ${rawSlicesPaths.side?.raw.length || 0}, Top: ${rawSlicesPaths.top?.raw.length || 0}, Bottom: ${rawSlicesPaths.bottom?.raw.length || 0}`);

    console.log('Creating and storing masked slices...');

    // STAGE 2: Apply triangle masks and store masked versions
    const maskedSlicesPaths = await createAndStoreMaskedSlices(rawSlicesPaths, {
      numPages: options.numPages,
      pageType: options.pageType as 'bw' | 'standard' | 'premium',
      edgeType: options.edgeType,
      trimWidth: options.trimWidth,
      trimHeight: options.trimHeight,
      scaleMode: options.scaleMode,
      pdfDimensions: { width: pdfWidth, height: pdfHeight }
    }, sessionId);

    console.log(`Created masked slices - Side: ${maskedSlicesPaths.side?.masked.length || 0}, Top: ${maskedSlicesPaths.top?.masked.length || 0}, Bottom: ${maskedSlicesPaths.bottom?.masked.length || 0}`);

    // Upload PDF
    console.log('Uploading PDF...');
    const pdfPath = `${sessionId}/original.pdf`;
    const { error: pdfError } = await supabase.storage.from('pdfs').upload(pdfPath, pdfFile, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (pdfError) throw pdfError;

    // Split PDF into chunks
    const numChunks = Math.ceil(options.numPages / CHUNK_SIZE);
    console.log(`Processing ${numChunks} chunks of ${CHUNK_SIZE} pages each...`);

    // First, chunk the PDF
    const { data: chunkData, error: chunkError } = await supabase.functions.invoke('chunk-pdf', {
      body: {
        sessionId,
        pdfPath,
        totalPages: options.numPages
      }
    });

    if (chunkError) throw chunkError;
    if (!chunkData || !chunkData.chunks) {
      throw new Error('Failed to chunk PDF: No chunks returned');
    }

    const chunks = chunkData.chunks;
    const processedChunkPaths: string[] = [];

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      console.log(`Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage + 1}-${chunk.endPage + 1})`);

      const { data, error } = await supabase.functions.invoke('process-pdf-chunk', {
        body: {
          sessionId,
          chunkPath: chunk.chunkPath,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunks.length,
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          sliceStoragePaths: maskedSlicesPaths,
          bleedType: options.bleedType,
          edgeType: options.edgeType
        }
      });

      if (error) throw error;

      processedChunkPaths.push(data.processedChunkPath);

      if (onProgress) {
        onProgress(((i + 1) / chunks.length) * 100);
      }
    }

    console.log('Merging processed chunks...');

    // Merge all processed chunks
    const outputPath = `${sessionId}/final.pdf`;
    const { data: mergeData, error: mergeError } = await supabase.functions.invoke('merge-pdf-chunks', {
      body: {
        sessionId,
        processedChunkPaths,
        totalChunks: chunks.length,
        outputPath
      }
    });

    if (mergeError) throw mergeError;

    // Download the final PDF
    const { data: finalPdf, error: downloadError } = await supabase.storage
      .from('processed-pdfs')
      .download(outputPath);

    if (downloadError) throw downloadError;

    return await finalPdf.arrayBuffer();

  } catch (error) {
    console.error('Error processing PDF with chunking:', error);
    throw error;
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}