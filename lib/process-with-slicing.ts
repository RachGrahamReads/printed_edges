import { createClient } from '@supabase/supabase-js';
import { sliceEdgeImages } from './edge-slicer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function processPDFWithSlicing(
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
  }
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  try {
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

    console.log('Slicing edge images...');

    // Slice the edge images on the client side
    const slicedImages = await sliceEdgeImages(edgeImages, {
      numPages: options.numPages,
      pageType: options.pageType as 'bw' | 'standard' | 'premium',
      edgeType: options.edgeType,
      trimWidth: options.trimWidth,
      trimHeight: options.trimHeight
    });

    console.log(`Created ${slicedImages.side?.length || 0} side slices`);

    // Convert PDF to base64
    const pdfBase64 = await fileToBase64(pdfFile);

    // Prepare sliced images for Edge Function
    const edgeImagesForProcessing: any = {};

    if (slicedImages.side) {
      edgeImagesForProcessing.side = slicedImages.side;
    }
    if (slicedImages.top) {
      edgeImagesForProcessing.top = slicedImages.top;
    }
    if (slicedImages.bottom) {
      edgeImagesForProcessing.bottom = slicedImages.bottom;
    }

    console.log('Calling Edge Function with sliced images...');

    // Call the Edge Function with sliced images
    const { data, error } = await supabase.functions.invoke('process-pdf-with-slices', {
      body: {
        pdfBase64,
        slicedEdgeImages: edgeImagesForProcessing,
        numPages: options.numPages,
        pageType: options.pageType,
        bleedType: options.bleedType,
        edgeType: options.edgeType,
        trimWidth: options.trimWidth,
        trimHeight: options.trimHeight
      }
    });

    if (error) throw error;

    if (data.success && data.pdfData) {
      // Convert base64 response to ArrayBuffer
      const pdfBase64Response = data.pdfData.split(',')[1];
      const binaryString = atob(pdfBase64Response);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    throw new Error('No processed PDF returned from Edge Function');

  } catch (error) {
    console.error('Error processing PDF with slicing:', error);
    throw error;
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/png;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}