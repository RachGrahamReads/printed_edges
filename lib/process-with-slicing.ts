import { createClient } from '@supabase/supabase-js';
import { createAndStoreRawSlices, createAndStoreMaskedSlices } from './edge-slicer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

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
    scaleMode?: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides';
  }
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  try {
    // Generate unique session ID for this processing run
    const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

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

    // Convert trim dimensions from inches to points
    const trimWidthPoints = options.trimWidth * POINTS_PER_INCH;
    const trimHeightPoints = options.trimHeight * POINTS_PER_INCH;

    let pdfWidth = trimWidthPoints;
    let pdfHeight = trimHeightPoints;

    if (options.bleedType === 'add_bleed') {
      pdfWidth = trimWidthPoints + BLEED_POINTS;
      pdfHeight = trimHeightPoints + (2 * BLEED_POINTS);
    }

    console.log(`PDF dimensions: ${options.trimWidth}" × ${options.trimHeight}" = ${pdfWidth}pt × ${pdfHeight}pt`);

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

    // Convert PDF to base64
    const pdfBase64 = await fileToBase64(pdfFile);

    console.log('Calling Edge Function with storage paths...');

    // Call the Edge Function with storage paths instead of base64 images
    const { data, error } = await supabase.functions.invoke('process-pdf-with-storage-slices', {
      body: {
        pdfBase64,
        sliceStoragePaths: maskedSlicesPaths,
        numPages: options.numPages,
        pageType: options.pageType,
        bleedType: options.bleedType,
        edgeType: options.edgeType,
        trimWidth: options.trimWidth,
        trimHeight: options.trimHeight,
        sessionId
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