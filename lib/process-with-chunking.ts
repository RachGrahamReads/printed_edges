import { createClient as createSupabaseClient } from './supabase/client';
import { createAndStoreRawSlices, createAndStoreMaskedSlices, createAndStoreDesignSlices, createAndStoreDesignMaskedSlices } from './edge-slicer';

// Use the singleton client instance to avoid multiple GoTrueClient instances
export const supabase = createSupabaseClient();

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
  onProgress?: (progress: number) => void,
  onPageWarning?: (warnings: Array<{ pageNumber: number; issue: string }>) => void
) {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  // Get Supabase URL and key for Edge Function calls
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

    // Upload PDF with retry logic
    console.log('Uploading PDF...');
    const pdfPath = `${sessionId}/original.pdf`;
    let uploadRetryCount = 0;
    const maxUploadRetries = 3;
    let pdfUploaded = false;

    while (!pdfUploaded && uploadRetryCount < maxUploadRetries) {
      const { error: pdfError } = await supabase.storage.from('pdfs').upload(pdfPath, pdfFile, {
        contentType: 'application/pdf',
        upsert: true
      });

      if (pdfError) {
        uploadRetryCount++;
        if (uploadRetryCount >= maxUploadRetries) {
          throw new Error(`Failed to upload PDF after ${maxUploadRetries} attempts: ${pdfError.message}`);
        }
        console.warn(`PDF upload failed (attempt ${uploadRetryCount}/${maxUploadRetries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * uploadRetryCount));
      } else {
        pdfUploaded = true;
      }
    }

    // Use progressive chunking for large PDFs to avoid Edge Function timeouts
    // First, split into intermediate batches, then process each batch into single pages
    console.log(`Using progressive chunking strategy for ${options.numPages} pages...`);

    const chunks = await progressiveChunking(
      supabaseUrl,
      supabaseAnonKey,
      sessionId,
      pdfPath,
      options.numPages
    );
    const processedChunkPaths: string[] = new Array(chunks.length); // Pre-allocate to maintain order
    const allPageWarnings: Array<{ pageNumber: number; issue: string }> = [];

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

            // Collect any page warnings
            if (data.pageWarnings && data.pageWarnings.length > 0) {
              allPageWarnings.push(...data.pageWarnings);
            }

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

    // Notify caller of any page warnings
    if (allPageWarnings.length > 0 && onPageWarning) {
      console.warn(`Found ${allPageWarnings.length} page(s) with issues:`, allPageWarnings);
      onPageWarning(allPageWarnings);
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

    // Download the final PDF with retry logic
    let downloadRetryCount = 0;
    const maxDownloadRetries = 3;
    let finalPdf: Blob | null = null;

    while (!finalPdf && downloadRetryCount < maxDownloadRetries) {
      const { data, error: downloadError } = await supabase.storage
        .from('processed-pdfs')
        .download(finalPdfPath);

      if (downloadError) {
        downloadRetryCount++;
        if (downloadRetryCount >= maxDownloadRetries) {
          throw new Error(`Failed to download final PDF after ${maxDownloadRetries} attempts: ${downloadError.message}`);
        }
        console.warn(`PDF download failed (attempt ${downloadRetryCount}/${maxDownloadRetries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * downloadRetryCount));
      } else {
        finalPdf = data;
      }
    }

    if (!finalPdf) throw new Error('Failed to download final PDF');

    const pdfBuffer = await finalPdf.arrayBuffer();

    // Clean up: Delete the processed PDF from storage after successful download
    // This prevents storage from filling up since we don't store PDFs long-term
    await supabase.storage
      .from('processed-pdfs')
      .remove([finalPdfPath])
      .catch(err => console.warn('Failed to cleanup processed PDF:', err));

    // Clear checkpoints on success
    await clearCheckpoints(sessionId);

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

    // Provide helpful error messages for common issues
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Array buffer allocation failed') || errorMessage.includes('out of memory')) {
      throw new Error(
        `Your PDF is too large to process. This typically happens with PDFs over 100MB or 500+ pages. ` +
        `Please try a smaller PDF or contact support for assistance with large files.`
      );
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('504')) {
      throw new Error(
        `Processing timed out. Your PDF may be too complex. ` +
        `If the problem persists, please contact support.`
      );
    }

    if (errorMessage.includes('WORKER_LIMIT')) {
      throw new Error(
        `Our servers are currently busy. Please wait a moment and try again. ` +
        `If the problem persists, please contact support.`
      );
    }

    // Re-throw original error if we don't have a specific message
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

// Checkpoint helper functions using localStorage (storage buckets don't accept JSON)
async function saveCheckpoint(sessionId: string, stage: string, data: any) {
  try {
    const checkpointKey = `pdf_checkpoint_${sessionId}_${stage}`;
    const checkpointData = JSON.stringify({
      stage,
      timestamp: Date.now(),
      ...data
    });

    localStorage.setItem(checkpointKey, checkpointData);
    console.log(`💾 Checkpoint saved: ${stage}`);
  } catch (err) {
    console.warn(`Failed to save checkpoint for ${stage}:`, err);
  }
}

async function loadCheckpoint(sessionId: string, stage: string): Promise<any | null> {
  try {
    const checkpointKey = `pdf_checkpoint_${sessionId}_${stage}`;
    const checkpointData = localStorage.getItem(checkpointKey);

    if (!checkpointData) return null;

    return JSON.parse(checkpointData);
  } catch (err) {
    console.warn(`Failed to load checkpoint for ${stage}:`, err);
    return null;
  }
}

async function clearCheckpoints(sessionId: string) {
  try {
    const keys = Object.keys(localStorage);
    const checkpointKeys = keys.filter(key => key.startsWith(`pdf_checkpoint_${sessionId}`));
    checkpointKeys.forEach(key => localStorage.removeItem(key));
    console.log(`🗑️ Cleared ${checkpointKeys.length} checkpoints`);
  } catch (err) {
    console.warn('Failed to clear checkpoints:', err);
  }
}

// Progressive merge function for large PDFs with checkpointing
async function progressiveMerge(sessionId: string, chunkPaths: string[], finalOutputPath: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  console.log(`Starting progressive merge for ${chunkPaths.length} chunks`);

  // Try to resume from checkpoint
  const stage1Checkpoint = await loadCheckpoint(sessionId, 'stage1_complete');
  let intermediatePaths: string[] = [];

  if (stage1Checkpoint && stage1Checkpoint.intermediatePaths) {
    console.log(`📂 Resuming from Stage 1 checkpoint (${stage1Checkpoint.intermediatePaths.length} intermediate PDFs)`);
    intermediatePaths = stage1Checkpoint.intermediatePaths;
  } else {
  console.log(`Memory optimization strategy:`);
  console.log(`  - Stage 1 size: 8 chunks per intermediate PDF`);
  console.log(`  - Stage 2 threshold: >12 intermediate files`);
  console.log(`  - Stage 2 size: 8 intermediate PDFs per Stage 2 file`);
  console.log(`  - Stage 3 threshold: >2 Stage 2 files`);
  console.log(`  - Stage 3+ size: 2 PDFs per merge (prevents timeout)`);

  // Stage 1: Merge chunks into intermediate PDFs
  // Size optimized to balance Edge Function memory limits with minimizing merge stages
  const INTERMEDIATE_SIZE = 8; // Reduced from 12 to create smaller intermediate PDFs
  const intermediateGroups = [];

  for (let i = 0; i < chunkPaths.length; i += INTERMEDIATE_SIZE) {
    intermediateGroups.push(chunkPaths.slice(i, i + INTERMEDIATE_SIZE));
  }

  console.log(`Stage 1: Creating ${intermediateGroups.length} intermediate PDFs (${chunkPaths.length} chunks ÷ ${INTERMEDIATE_SIZE} = ${intermediateGroups.length} files)`);

  const intermediatePaths: string[] = [];

  // Process intermediate groups sequentially to avoid Edge Function rate limits
  // With 60 files, concurrent batching was causing 502 errors
  console.log(`Processing ${intermediateGroups.length} intermediate merges sequentially to avoid rate limits...`);

  for (let groupIndex = 0; groupIndex < intermediateGroups.length; groupIndex++) {
    const group = intermediateGroups[groupIndex];
    const intermediatePath = `${sessionId}/intermediate/stage1_${groupIndex}.pdf`;

    const result = await mergeGroup(group, intermediatePath, sessionId, groupIndex + 1, intermediateGroups.length);
    intermediatePaths.push(result);

    // Log progress every 10 merges
    if ((groupIndex + 1) % 10 === 0 || groupIndex === intermediateGroups.length - 1) {
      console.log(`Stage 1 progress: ${groupIndex + 1}/${intermediateGroups.length} intermediate PDFs created`);
    }

    // Small delay between calls to avoid rate limiting (except for last one)
    if (groupIndex < intermediateGroups.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Stage 1 complete: ${intermediatePaths.length} intermediate PDFs created`);

  // Save checkpoint after Stage 1
  await saveCheckpoint(sessionId, 'stage1_complete', { intermediatePaths });
  }

  // Check for Stage 2 checkpoint
  const stage2Checkpoint = await loadCheckpoint(sessionId, 'stage2_complete');
  let stage2Paths: string[] = [];

  // Stage 2: If we have many intermediate PDFs, create another level
  // This prevents the final merge from trying to handle too many large files at once
  if (stage2Checkpoint && stage2Checkpoint.stage2Paths) {
    console.log(`📂 Resuming from Stage 2 checkpoint (${stage2Checkpoint.stage2Paths.length} Stage 2 PDFs)`);
    stage2Paths = stage2Checkpoint.stage2Paths;
  } else if (intermediatePaths.length > 12) {
    console.log(`📊 Stage 2 REQUIRED: ${intermediatePaths.length} intermediate files exceed threshold of 12`);
    console.log(`Stage 2: Merging ${intermediatePaths.length} intermediate PDFs into final groups`);

    const stage2Groups = [];
    const STAGE2_SIZE = 8; // Reduced from 12 to create smaller Stage 2 PDFs

    for (let i = 0; i < intermediatePaths.length; i += STAGE2_SIZE) {
      stage2Groups.push(intermediatePaths.slice(i, i + STAGE2_SIZE));
    }

    console.log(`  → Creating ${stage2Groups.length} Stage 2 files (${intermediatePaths.length} intermediates ÷ ${STAGE2_SIZE})`);

    stage2Paths = [];

    for (let groupIndex = 0; groupIndex < stage2Groups.length; groupIndex++) {
      const group = stage2Groups[groupIndex];
      const stage2Path = `${sessionId}/intermediate/stage2_${groupIndex}.pdf`;

      const result = await mergeGroup(group, stage2Path, sessionId, groupIndex + 1, stage2Groups.length);
      stage2Paths.push(result);
    }

    // Save checkpoint after Stage 2
    await saveCheckpoint(sessionId, 'stage2_complete', { stage2Paths });

    // Clean up Stage 1 intermediate files - no longer needed
    console.log(`Cleaning up ${intermediatePaths.length} Stage 1 intermediate files...`);
    try {
      await supabase.storage
        .from('processed-pdfs')
        .remove(intermediatePaths);
      console.log('✓ Stage 1 files cleaned up');
    } catch (cleanupError) {
      console.warn('Failed to cleanup Stage 1 files:', cleanupError);
    }

    // Final stage: Merge stage2 results
    // Safety check: If we have >2 Stage 2 files, use split strategy to avoid timeout
    // Merging 3+ large Stage 2 PDFs in one go can hit WORKER_LIMIT (CPU timeout)
    if (stage2Paths.length > 2) {
      console.warn(`⚠️ PERFORMANCE: Stage 2 produced ${stage2Paths.length} files (>2 threshold)`);
      console.warn(`⚠️ Using Stage 3 split-merge to prevent timeout and memory errors`);

      const stage3Groups = [];
      const STAGE3_SIZE = 2; // Merge only 2 at a time to stay under CPU timeout limit

      for (let i = 0; i < stage2Paths.length; i += STAGE3_SIZE) {
        stage3Groups.push(stage2Paths.slice(i, i + STAGE3_SIZE));
      }

      console.log(`  → Creating ${stage3Groups.length} Stage 3 files (${stage2Paths.length} Stage 2 files, ${STAGE3_SIZE} per merge)`);

      const stage3Paths: string[] = [];

      for (let groupIndex = 0; groupIndex < stage3Groups.length; groupIndex++) {
        const group = stage3Groups[groupIndex];
        const stage3Path = `${sessionId}/intermediate/stage3_${groupIndex}.pdf`;

        const result = await mergeGroup(group, stage3Path, sessionId, groupIndex + 1, stage3Groups.length);
        stage3Paths.push(result);
      }

      // Clean up Stage 2 files
      console.log(`Cleaning up ${stage2Paths.length} Stage 2 intermediate files...`);
      try {
        await supabase.storage
          .from('processed-pdfs')
          .remove(stage2Paths);
        console.log('✓ Stage 2 files cleaned up');
      } catch (cleanupError) {
        console.warn('Failed to cleanup Stage 2 files:', cleanupError);
      }

      // Continue merging until we have ≤2 files
      let currentPaths = stage3Paths;
      let stageNumber = 4;

      while (currentPaths.length > 2) {
        console.log(`Stage ${stageNumber}: Merging ${currentPaths.length} files (2 at a time)...`);

        const nextGroups = [];
        for (let i = 0; i < currentPaths.length; i += 2) {
          nextGroups.push(currentPaths.slice(i, i + 2));
        }

        const nextPaths: string[] = [];
        for (let groupIndex = 0; groupIndex < nextGroups.length; groupIndex++) {
          const group = nextGroups[groupIndex];
          const stagePath = `${sessionId}/intermediate/stage${stageNumber}_${groupIndex}.pdf`;

          const result = await mergeGroup(group, stagePath, sessionId, groupIndex + 1, nextGroups.length);
          nextPaths.push(result);
        }

        // Clean up previous stage
        await supabase.storage
          .from('processed-pdfs')
          .remove(currentPaths)
          .catch(err => console.warn(`Failed to cleanup Stage ${stageNumber - 1}:`, err));

        currentPaths = nextPaths;
        stageNumber++;
      }

      // Final merge
      console.log(`✅ Final stage: Merging ${currentPaths.length} PDFs into final PDF`);
      const finalPath = await mergeGroup(currentPaths, finalOutputPath, sessionId, 1, 1);

      // Clean up last intermediate stage
      await supabase.storage
        .from('processed-pdfs')
        .remove(currentPaths)
        .catch(err => console.warn('Failed to cleanup final intermediate files:', err));

      return finalPath;
    } else {
      console.log(`✅ Final stage: Merging ${stage2Paths.length} stage2 PDFs into final PDF (safe: ≤2 files)`);
      const finalPath = await mergeGroup(stage2Paths, finalOutputPath, sessionId, 1, 1);

      // Clean up Stage 2 intermediate files - no longer needed
      console.log(`Cleaning up ${stage2Paths.length} Stage 2 intermediate files...`);
      try {
        await supabase.storage
          .from('processed-pdfs')
          .remove(stage2Paths);
        console.log('✓ Stage 2 files cleaned up');
      } catch (cleanupError) {
        console.warn('Failed to cleanup Stage 2 files:', cleanupError);
      }

      return finalPath;
    }
  } else if (intermediatePaths.length > 0) {
    // Final stage: Merge intermediate PDFs directly
    console.log(`📊 Stage 2 SKIPPED: ${intermediatePaths.length} intermediate files ≤ threshold of 12`);
    console.log(`✅ Final stage: Merging ${intermediatePaths.length} intermediate PDFs into final PDF`);
    const finalPath = await mergeGroup(intermediatePaths, finalOutputPath, sessionId, 1, 1);

    // Clean up Stage 1 intermediate files - no longer needed
    console.log(`Cleaning up ${intermediatePaths.length} Stage 1 intermediate files...`);
    try {
      await supabase.storage
        .from('processed-pdfs')
        .remove(intermediatePaths);
      console.log('✓ Stage 1 files cleaned up');
    } catch (cleanupError) {
      console.warn('Failed to cleanup Stage 1 files:', cleanupError);
    }

    return finalPath;
  } else {
    // No intermediate paths - this shouldn't happen but handle gracefully
    throw new Error('No intermediate PDFs were created. This indicates a problem with the chunking process.');
  }
}

// Helper function to merge a group of PDFs with retry logic for memory errors
async function mergeGroup(chunkPaths: string[], outputPath: string, sessionId: string, groupNum: number, totalGroups: number): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  console.log(`Merging group ${groupNum}/${totalGroups} (${chunkPaths.length} files) → ${outputPath}`);

  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
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
        const errorMessage = `${mergeResponse.status} - ${errorText}`;

        // Check if it's a memory or resource error
        const isMemoryError = errorText.includes('Array buffer allocation failed') ||
                            errorText.includes('out of memory') ||
                            errorText.includes('OOM');

        const isWorkerLimit = errorText.includes('WORKER_LIMIT') ||
                             errorText.includes('not having enough compute resources');

        // For WORKER_LIMIT or memory errors with multiple files, split the merge
        // Even 2 files can be too large, so we allow splitting down to 1 file per merge
        if ((isMemoryError || isWorkerLimit) && chunkPaths.length >= 2 && retryCount < maxRetries) {
          if (isWorkerLimit) {
            console.warn(`⚠️ WORKER_LIMIT error (timeout/CPU exhausted) merging ${chunkPaths.length} files. Splitting into smaller groups...`);
          } else {
            console.warn(`⚠️ Memory error merging ${chunkPaths.length} files. Splitting into smaller groups...`);
          }

          // Split into two groups and merge recursively
          const midpoint = Math.ceil(chunkPaths.length / 2);
          const firstHalf = chunkPaths.slice(0, midpoint);
          const secondHalf = chunkPaths.slice(midpoint);

          const tempPath1 = `${sessionId}/intermediate/split_${groupNum}_a.pdf`;
          const tempPath2 = `${sessionId}/intermediate/split_${groupNum}_b.pdf`;

          console.log(`Splitting merge: ${firstHalf.length} + ${secondHalf.length} files`);

          // Merge each half
          await mergeGroup(firstHalf, tempPath1, sessionId, groupNum, totalGroups);
          await mergeGroup(secondHalf, tempPath2, sessionId, groupNum, totalGroups);

          // Now merge the two halves
          const finalResult = await mergeGroup([tempPath1, tempPath2], outputPath, sessionId, groupNum, totalGroups);

          // Clean up temp files
          if (supabase) {
            await supabase.storage
              .from('processed-pdfs')
              .remove([tempPath1, tempPath2])
              .catch(err => console.warn('Failed to cleanup split merge files:', err));
          }

          return finalResult;
        }

        throw new Error(`Failed to merge group ${groupNum}: ${errorMessage}`);
      }

      await mergeResponse.json(); // Consume the response
      console.log(`✓ Group ${groupNum}/${totalGroups} merged successfully`);
      return outputPath;

    } catch (error) {
      clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isMemoryError = errorMessage.includes('Array buffer allocation failed') ||
                          errorMessage.includes('out of memory') ||
                          errorMessage.includes('OOM');

      const isWorkerLimit = errorMessage.includes('WORKER_LIMIT') ||
                           errorMessage.includes('not having enough compute resources');

      if ((isMemoryError || isWorkerLimit) && chunkPaths.length >= 2 && retryCount < maxRetries) {
        retryCount++;
        console.warn(`Resource error (attempt ${retryCount}/${maxRetries}). Retrying with split merge...`);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to merge group ${groupNum} after ${maxRetries} retries`);
}

// Progressive chunking with adaptive sizing and retry logic
async function progressiveChunking(
  supabaseUrl: string,
  supabaseAnonKey: string,
  sessionId: string,
  pdfPath: string,
  totalPages: number
): Promise<any[]> {
  // Adaptive batch sizes: try larger first, fall back to smaller if timeout occurs
  // Start with batch of 50, Edge Function will return partial results if it times out
  const BATCH_SIZES = [50, 25, 10]; // Try 50 pages, then 25, then 10
  let currentBatchSizeIndex = 0;
  let BATCH_SIZE = BATCH_SIZES[currentBatchSizeIndex];

  const allChunks: any[] = [];
  let currentPage = 0;

  while (currentPage < totalPages) {
    const batch = {
      startPage: currentPage,
      endPage: Math.min(currentPage + BATCH_SIZE - 1, totalPages - 1)
    };
    const batchPageCount = batch.endPage - batch.startPage + 1;
    const batchNumber = Math.floor(currentPage / BATCH_SIZE) + 1;
    const estimatedTotalBatches = Math.ceil(totalPages / BATCH_SIZE);

    console.log(`Chunking batch ${batchNumber} (pages ${batch.startPage + 1}-${batch.endPage + 1}, batch size: ${BATCH_SIZE})...`);

    let success = false;
    let retryCount = 0;
    const maxRetries = 3;

    while (!success && retryCount < maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

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
            startPage: batch.startPage,
            endPage: batch.endPage,
            totalPages
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!chunkResponse.ok) {
          const errorText = await chunkResponse.text();
          const errorMessage = `${chunkResponse.status} - ${errorText}`;

          // Check if it's a timeout or resource error
          const isTimeoutError = errorMessage.includes('timeout') ||
                                errorMessage.includes('504') ||
                                errorMessage.includes('503') ||
                                errorMessage.includes('WORKER_LIMIT');

          if (isTimeoutError && currentBatchSizeIndex < BATCH_SIZES.length - 1) {
            // Timeout with larger batch - reduce batch size and retry
            currentBatchSizeIndex++;
            BATCH_SIZE = BATCH_SIZES[currentBatchSizeIndex];
            console.warn(`⚠️ Batch timed out. Reducing batch size to ${BATCH_SIZE} pages and retrying...`);
            retryCount = 0; // Reset retry count for new batch size
            continue;
          }

          throw new Error(errorMessage);
        }

        const chunkData = await chunkResponse.json();
        if (!chunkData || !chunkData.chunks) {
          throw new Error('No chunks returned');
        }

        allChunks.push(...chunkData.chunks);

        // Check if this was a partial response (Edge Function timed out)
        if (chunkData.partial && chunkData.nextStartPage !== undefined) {
          console.log(`✓ Partial batch completed (${chunkData.chunks.length} pages). Continuing from page ${chunkData.nextStartPage + 1}...`);
          // Move to the next page after what was processed
          currentPage = chunkData.nextStartPage;
          success = true;
          // Don't reduce batch size - the Edge Function handled it gracefully
        } else {
          console.log(`✓ Batch chunked successfully (${chunkData.chunks.length} pages)`);
          success = true;
          // Move to next batch
          currentPage = batch.endPage + 1;
        }

      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if error is retryable
        const isTimeoutError = errorMessage.includes('timeout') ||
                              errorMessage.includes('504') ||
                              errorMessage.includes('503') ||
                              errorMessage.includes('aborted') ||
                              errorMessage.includes('WORKER_LIMIT') ||
                              errorMessage.includes('Failed to fetch') ||
                              errorMessage.includes('NetworkError');

        if (isTimeoutError) {
          // First, try reducing batch size if we haven't tried smallest yet
          if (currentBatchSizeIndex < BATCH_SIZES.length - 1) {
            currentBatchSizeIndex++;
            BATCH_SIZE = BATCH_SIZES[currentBatchSizeIndex];
            console.warn(`⚠️ Timeout detected. Reducing batch size to ${BATCH_SIZE} pages...`);
            retryCount = 0; // Reset retry count for new batch size
            continue;
          }

          // Already at smallest batch size, just retry
          if (retryCount < maxRetries) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 8000);
            console.warn(`⚠️ Batch failed (attempt ${retryCount}/${maxRetries}). Retrying in ${backoffTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue;
          }
        }

        // Non-retryable error or max retries reached
        throw new Error(`Failed to chunk batch (pages ${batch.startPage + 1}-${batch.endPage + 1}) after ${maxRetries} attempts: ${errorMessage}`);
      }
    }

    if (!success) {
      throw new Error(`Failed to chunk batch (pages ${batch.startPage + 1}-${batch.endPage + 1}) after ${maxRetries} attempts`);
    }
  }

  console.log(`✓ All ${totalPages} pages successfully chunked into ${allChunks.length} chunks`);
  return allChunks;
}