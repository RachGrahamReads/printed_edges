import { createClient } from '@supabase/supabase-js';
import { sliceEdgeImages } from './edge-slicer';

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
  },
  onProgress?: (progress: number) => void
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  try {
    const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // First, slice edge images client-side
    console.log('Slicing edge images...');
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

    const slicedImages = await sliceEdgeImages(edgeImages, {
      numPages: options.numPages,
      pageType: options.pageType as 'bw' | 'standard' | 'premium',
      edgeType: options.edgeType,
      trimWidth: options.trimWidth,
      trimHeight: options.trimHeight
    });

    console.log(`Created ${slicedImages.side?.length || 0} edge slices`);

    // Upload sliced images to storage
    console.log('Uploading sliced images to storage...');
    const slicedPaths: any = {};

    if (slicedImages.side) {
      slicedPaths.side = [];
      for (let i = 0; i < slicedImages.side.length; i++) {
        const path = `${sessionId}/slices/side_${i}.png`;
        const bytes = base64ToUint8Array(slicedImages.side[i]);
        const { error } = await supabase.storage.from('edge-images').upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });
        if (error) throw error;
        slicedPaths.side.push(path);
      }
    }

    if (slicedImages.top) {
      slicedPaths.top = [];
      for (let i = 0; i < slicedImages.top.length; i++) {
        const path = `${sessionId}/slices/top_${i}.png`;
        const bytes = base64ToUint8Array(slicedImages.top[i]);
        const { error } = await supabase.storage.from('edge-images').upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });
        if (error) throw error;
        slicedPaths.top.push(path);
      }
    }

    if (slicedImages.bottom) {
      slicedPaths.bottom = [];
      for (let i = 0; i < slicedImages.bottom.length; i++) {
        const path = `${sessionId}/slices/bottom_${i}.png`;
        const bytes = base64ToUint8Array(slicedImages.bottom[i]);
        const { error } = await supabase.storage.from('edge-images').upload(path, bytes, {
          contentType: 'image/png',
          upsert: true
        });
        if (error) throw error;
        slicedPaths.bottom.push(path);
      }
    }

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
          slicedPaths,
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