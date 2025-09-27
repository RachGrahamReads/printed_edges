import { createClient } from '@supabase/supabase-js';
import { createAndStoreRawSlices, createAndStoreMaskedSlices, createAndStoreDesignSlices, createAndStoreDesignMaskedSlices } from './edge-slicer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const CHUNK_SIZE = 1; // Process single pages to minimize CPU usage per Edge Function call

export async function processPDFWithChunking(
  pdfFile: File,
  edgeData: {
    side?: File;
    top?: File | string;
    bottom?: File | string;
  },
  options: {
    numPages: number;
    pageType: string;
    bleedType: 'add_bleed' | 'existing_bleed';
    edgeType: 'side-only' | 'all-edges';
    trimWidth: number;
    trimHeight: number;
    scaleMode?: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides';
  },
  designId?: string,
  userId?: string,
  onProgress?: (progress: number) => void
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  try {
    const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const useDesignPaths = designId && userId;

    console.log(`Using ${useDesignPaths ? 'design-based' : 'session-based'} slice storage paths`);

    // First, convert edge data to the format needed for slicing
    const edgeImages: any = {};

    if (edgeData.side) {
      const sideBase64 = await fileToBase64(edgeData.side);
      edgeImages.side = { base64: sideBase64 };
    }

    if (edgeData.top) {
      if (typeof edgeData.top === 'string') {
        // It's a color value - create a color slice
        edgeImages.top = { color: edgeData.top };
      } else {
        // It's a file - convert to base64
        const topBase64 = await fileToBase64(edgeData.top);
        edgeImages.top = { base64: topBase64 };
      }
    }

    if (edgeData.bottom) {
      if (typeof edgeData.bottom === 'string') {
        // It's a color value - create a color slice
        edgeImages.bottom = { color: edgeData.bottom };
      } else {
        // It's a file - convert to base64
        const bottomBase64 = await fileToBase64(edgeData.bottom);
        edgeImages.bottom = { base64: bottomBase64 };
      }
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
      pdfWidth = trimWidthPoints + BLEED_POINTS; // Add 0.125" to width (outer edge only)
      pdfHeight = trimHeightPoints + (2 * BLEED_POINTS); // Add 0.125" top and bottom
    }

    console.log(`PDF dimensions: ${options.trimWidth}" × ${options.trimHeight}" = ${pdfWidth}pt × ${pdfHeight}pt`);

    console.log('Creating and storing raw slices...');

    // STAGE 1: Create raw slices and store them
    let rawSlicesPaths;
    if (useDesignPaths) {
      rawSlicesPaths = await createAndStoreDesignSlices(edgeImages, {
        numPages: options.numPages,
        pageType: options.pageType as 'bw' | 'standard' | 'premium',
        edgeType: options.edgeType,
        trimWidth: options.trimWidth,
        trimHeight: options.trimHeight,
        scaleMode: options.scaleMode,
        pdfDimensions: { width: pdfWidth, height: pdfHeight }
      }, designId!, userId!);
    } else {
      rawSlicesPaths = await createAndStoreRawSlices(edgeImages, {
        numPages: options.numPages,
        pageType: options.pageType as 'bw' | 'standard' | 'premium',
        edgeType: options.edgeType,
        trimWidth: options.trimWidth,
        trimHeight: options.trimHeight,
        scaleMode: options.scaleMode,
        pdfDimensions: { width: pdfWidth, height: pdfHeight }
      }, sessionId);
    }

    console.log(`Created raw slices - Side: ${rawSlicesPaths.side?.raw.length || 0}, Top: ${rawSlicesPaths.top?.raw.length || 0}, Bottom: ${rawSlicesPaths.bottom?.raw.length || 0}`);

    console.log('Creating and storing masked slices...');

    // STAGE 2: Apply triangle masks and store masked versions
    let maskedSlicesPaths;
    if (useDesignPaths) {
      maskedSlicesPaths = await createAndStoreDesignMaskedSlices(rawSlicesPaths, {
        numPages: options.numPages,
        pageType: options.pageType as 'bw' | 'standard' | 'premium',
        edgeType: options.edgeType,
        trimWidth: options.trimWidth,
        trimHeight: options.trimHeight,
        scaleMode: options.scaleMode,
        pdfDimensions: { width: pdfWidth, height: pdfHeight }
      }, designId!, userId!);
    } else {
      maskedSlicesPaths = await createAndStoreMaskedSlices(rawSlicesPaths, {
        numPages: options.numPages,
        pageType: options.pageType as 'bw' | 'standard' | 'premium',
        edgeType: options.edgeType,
        trimWidth: options.trimWidth,
        trimHeight: options.trimHeight,
        scaleMode: options.scaleMode,
        pdfDimensions: { width: pdfWidth, height: pdfHeight }
      }, sessionId);
    }

    console.log(`Created masked slices - Side: ${maskedSlicesPaths.side?.masked.length || 0}, Top: ${maskedSlicesPaths.top?.masked.length || 0}, Bottom: ${maskedSlicesPaths.bottom?.masked.length || 0}`);

    // Upload PDF
    console.log('Uploading PDF...');
    const pdfPath = `${sessionId}/original.pdf`;
    const { error: pdfError } = await supabase.storage.from('pdfs').upload(pdfPath, pdfFile, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (pdfError) throw pdfError;

    // Split PDF into single-page chunks
    const numChunks = Math.ceil(options.numPages / CHUNK_SIZE);
    console.log(`Processing ${numChunks} single-page chunks...`);

    // First, chunk the PDF
    const chunkResponse = await fetch(`${supabaseUrl}/functions/v1/chunk-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        sessionId,
        pdfPath,
        totalPages: options.numPages
      })
    });

    if (!chunkResponse.ok) {
      const errorText = await chunkResponse.text();
      throw new Error(`Failed to chunk PDF: ${chunkResponse.status} - ${errorText}`);
    }

    const chunkData = await chunkResponse.json();
    if (!chunkData || !chunkData.chunks) {
      throw new Error('Failed to chunk PDF: No chunks returned');
    }

    const chunks = chunkData.chunks;
    const processedChunkPaths: string[] = new Array(chunks.length); // Pre-allocate to maintain order

    // Process chunks in parallel batches for better performance
    const BATCH_SIZE = 8; // Process 8 single pages concurrently
    const batches = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      batches.push(chunks.slice(i, i + BATCH_SIZE));
    }

    console.log(`Processing ${chunks.length} single-page chunks in ${batches.length} batches of ${BATCH_SIZE}...`);

    let completedChunks = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} chunks)...`);

      // Process batch in parallel with retry logic
      const batchPromises = batch.map(async (chunk) => {
        const chunkIndex = chunk.chunkIndex;
        let success = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!success && retryCount < maxRetries) {
          try {
            console.log(`Attempting to process chunk ${chunkIndex} (page ${chunk.startPage + 1}), attempt ${retryCount + 1}/${maxRetries}`);

            // Create an AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

            const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-pdf-chunk`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'apikey': supabaseAnonKey
              },
              body: JSON.stringify({
                sessionId,
                chunkPath: chunk.chunkPath,
                chunkIndex: chunk.chunkIndex,
                totalChunks: chunks.length,
                startPage: chunk.startPage,
                endPage: chunk.endPage,
                sliceStoragePaths: maskedSlicesPaths,
                bleedType: options.bleedType,
                edgeType: options.edgeType
              }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!processResponse.ok) {
              const errorText = await processResponse.text();
              const errorMessage = `${processResponse.status} - ${errorText}`;
              const isRetryable = errorMessage.includes('WORKER_LIMIT') ||
                                errorMessage.includes('timeout') ||
                                errorMessage.includes('Failed to send a request') ||
                                errorMessage.includes('Failed to fetch') ||
                                errorMessage.includes('NetworkError') ||
                                errorMessage.includes('fetch');

              if (isRetryable && retryCount < maxRetries - 1) {
                retryCount++;
                const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
                console.log(`Page ${chunk.startPage + 1} failed (attempt ${retryCount}/${maxRetries}), retrying in ${backoffTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
              } else {
                throw new Error(errorMessage);
              }
            }

            const data = await processResponse.json();
            // Store result in correct order
            processedChunkPaths[chunkIndex] = data.processedChunkPath;
            success = true;
            console.log(`✓ Page ${chunk.startPage + 1} processed successfully`);

          } catch (chunkError) {
            const errorMessage = chunkError instanceof Error ? chunkError.message : '';
            console.log(`Page ${chunk.startPage + 1} error:`, errorMessage);

            const isRetryable = errorMessage.includes('WORKER_LIMIT') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('Failed to send a request') ||
                              errorMessage.includes('Failed to fetch') ||
                              errorMessage.includes('NetworkError') ||
                              errorMessage.includes('fetch') ||
                              errorMessage.includes('AbortError') ||
                              errorMessage.includes('aborted');

            if (isRetryable && retryCount < maxRetries - 1) {
              retryCount++;
              const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
              console.log(`Page ${chunk.startPage + 1} failed (attempt ${retryCount}/${maxRetries}), retrying in ${backoffTime}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
            } else {
              throw new Error(`Failed to process page ${chunk.startPage + 1}: ${chunkError}`);
            }
          }
        }

        if (!success) {
          throw new Error(`Failed to process page ${chunk.startPage + 1} after ${maxRetries} attempts`);
        }
      });

      // Wait for current batch to complete
      await Promise.all(batchPromises);

      completedChunks += batch.length;
      if (onProgress) {
        onProgress((completedChunks / chunks.length) * 100);
      }

      console.log(`✓ Batch ${batchIndex + 1}/${batches.length} completed (${completedChunks}/${chunks.length} pages)`);
    }

    console.log('Merging processed chunks...');

    // Use progressive merge for large PDFs (>50 chunks)
    const outputPath = `${sessionId}/final.pdf`;
    let finalPdfPath: string;

    if (chunks.length > 50) {
      console.log(`Large PDF detected (${chunks.length} chunks). Using progressive merge strategy.`);
      finalPdfPath = await progressiveMerge(sessionId, processedChunkPaths, outputPath);
    } else {
      console.log(`Small PDF (${chunks.length} chunks). Using single-stage merge.`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout for merge

      const mergeResponse = await fetch(`${supabaseUrl}/functions/v1/merge-pdf-chunks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify({
          sessionId,
          processedChunkPaths,
          totalChunks: chunks.length,
          outputPath
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!mergeResponse.ok) {
        const errorText = await mergeResponse.text();
        throw new Error(`Failed to merge PDF chunks: ${mergeResponse.status} - ${errorText}`);
      }

      const mergeData = await mergeResponse.json();
      finalPdfPath = outputPath;
    }

    // Download the final PDF
    const { data: finalPdf, error: downloadError } = await supabase.storage
      .from('processed-pdfs')
      .download(finalPdfPath);

    if (downloadError) throw downloadError;

    const pdfBuffer = await finalPdf.arrayBuffer();

    // Return PDF buffer and slice paths (when using design-based paths)
    if (useDesignPaths) {
      return {
        pdfBuffer,
        sliceStoragePaths: maskedSlicesPaths
      };
    } else {
      return pdfBuffer;
    }

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

// Progressive merge function for large PDFs
async function progressiveMerge(sessionId: string, chunkPaths: string[], finalOutputPath: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  console.log(`Starting progressive merge for ${chunkPaths.length} chunks`);

  // Stage 1: Merge chunks into intermediate PDFs (10-15 chunks per intermediate)
  const INTERMEDIATE_SIZE = 12;
  const intermediateGroups = [];

  for (let i = 0; i < chunkPaths.length; i += INTERMEDIATE_SIZE) {
    intermediateGroups.push(chunkPaths.slice(i, i + INTERMEDIATE_SIZE));
  }

  console.log(`Stage 1: Creating ${intermediateGroups.length} intermediate PDFs`);

  const intermediatePaths: string[] = [];

  // Process intermediate groups in batches to avoid overwhelming the system
  const BATCH_SIZE = 5;
  for (let batchStart = 0; batchStart < intermediateGroups.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, intermediateGroups.length);
    const batchPromises = [];

    for (let groupIndex = batchStart; groupIndex < batchEnd; groupIndex++) {
      const group = intermediateGroups[groupIndex];
      const intermediatePath = `${sessionId}/intermediate/stage1_${groupIndex}.pdf`;

      batchPromises.push(
        mergeGroup(group, intermediatePath, sessionId, groupIndex + 1, intermediateGroups.length)
      );
    }

    const batchResults = await Promise.all(batchPromises);
    intermediatePaths.push(...batchResults);

    console.log(`Stage 1 batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(intermediateGroups.length/BATCH_SIZE)} completed`);
  }

  // Stage 2: If we have many intermediate PDFs, create another level
  if (intermediatePaths.length > 15) {
    console.log(`Stage 2: Merging ${intermediatePaths.length} intermediate PDFs into final groups`);

    const stage2Groups = [];
    const STAGE2_SIZE = 10;

    for (let i = 0; i < intermediatePaths.length; i += STAGE2_SIZE) {
      stage2Groups.push(intermediatePaths.slice(i, i + STAGE2_SIZE));
    }

    const stage2Paths: string[] = [];

    for (let groupIndex = 0; groupIndex < stage2Groups.length; groupIndex++) {
      const group = stage2Groups[groupIndex];
      const stage2Path = `${sessionId}/intermediate/stage2_${groupIndex}.pdf`;

      const result = await mergeGroup(group, stage2Path, sessionId, groupIndex + 1, stage2Groups.length);
      stage2Paths.push(result);
    }

    // Final stage: Merge stage2 results
    console.log(`Final stage: Merging ${stage2Paths.length} stage2 PDFs into final PDF`);
    return await mergeGroup(stage2Paths, finalOutputPath, sessionId, 1, 1);
  } else {
    // Final stage: Merge intermediate PDFs directly
    console.log(`Final stage: Merging ${intermediatePaths.length} intermediate PDFs into final PDF`);
    return await mergeGroup(intermediatePaths, finalOutputPath, sessionId, 1, 1);
  }
}

// Helper function to merge a group of PDFs
async function mergeGroup(chunkPaths: string[], outputPath: string, sessionId: string, groupNum: number, totalGroups: number): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  console.log(`Merging group ${groupNum}/${totalGroups} (${chunkPaths.length} files) → ${outputPath}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout per group

  try {
    const mergeResponse = await fetch(`${supabaseUrl}/functions/v1/merge-pdf-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        sessionId,
        processedChunkPaths: chunkPaths,
        totalChunks: chunkPaths.length,
        outputPath
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!mergeResponse.ok) {
      const errorText = await mergeResponse.text();
      throw new Error(`Failed to merge group ${groupNum}: ${mergeResponse.status} - ${errorText}`);
    }

    await mergeResponse.json(); // Consume the response
    console.log(`✓ Group ${groupNum}/${totalGroups} merged successfully`);
    return outputPath;

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}