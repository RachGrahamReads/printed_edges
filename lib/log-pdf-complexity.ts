import { createClient } from './supabase/client';
import type { PDFComplexityMetrics } from './pdf-complexity-analyzer';

/**
 * Logs PDF complexity metrics to the database
 * This data will be used for correlation analysis between complexity and success/failure
 */
export async function logPDFComplexity(
  sessionId: string,
  complexity: PDFComplexityMetrics,
  userId?: string
): Promise<string | null> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from('pdf_complexity_logs')
      .insert({
        user_id: userId || null,
        session_id: sessionId,
        file_size: complexity.fileSize,
        file_size_mb: complexity.fileSizeMB,
        page_count: complexity.pageCount,
        file_size_per_page_mb: complexity.fileSizePerPageMB,

        // PDF Document Metadata
        pdf_version: complexity.pdfVersion || null,
        is_linearized: complexity.isLinearized || false,
        creator: complexity.creator || null,
        producer: complexity.producer || null,
        creation_date: complexity.creationDate || null,
        is_acro_form_present: complexity.isAcroFormPresent || false,
        is_xfa_present: complexity.isXFAPresent || false,

        avg_page_width: complexity.avgPageWidth,
        avg_page_height: complexity.avgPageHeight,
        has_variable_page_sizes: complexity.hasVariablePageSizes,
        total_fonts: complexity.totalFonts,
        total_images: complexity.totalImages,
        has_transparency: complexity.hasTransparency,
        has_annotations: complexity.hasAnnotations,
        has_xobjects: complexity.hasXObjects,
        large_image_count: complexity.largeImageCount,
        font_names: complexity.fontNames,
        complexity_score: complexity.complexityScore,
        risk_level: complexity.riskLevel,
        risk_factors: complexity.riskFactors,
        processing_status: 'pending',
        analyzed_at: complexity.analyzedAt
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log PDF complexity:', error);
      return null;
    }

    console.log(`✅ Complexity logged to database (ID: ${data.id})`);
    return data.id;
  } catch (error) {
    console.error('Error logging PDF complexity:', error);
    return null;
  }
}

/**
 * Updates the processing status of a complexity log
 */
export async function updateComplexityLogStatus(
  sessionId: string,
  status: 'success' | 'failed' | 'cancelled',
  options?: {
    errorMessage?: string;
    errorType?: 'timeout' | 'memory' | 'complexity' | 'network' | 'unknown';
    pageType?: string;
    bleedType?: string;
    edgeType?: string;
    processingDurationMs?: number;
  }
): Promise<void> {
  const supabase = createClient();

  try {
    const updateData: any = {
      processing_status: status,
      processing_completed_at: new Date().toISOString()
    };

    if (options?.errorMessage) {
      updateData.error_message = options.errorMessage;
    }

    if (options?.errorType) {
      updateData.error_type = options.errorType;
    }

    if (options?.pageType) {
      updateData.page_type = options.pageType;
    }

    if (options?.bleedType) {
      updateData.bleed_type = options.bleedType;
    }

    if (options?.edgeType) {
      updateData.edge_type = options.edgeType;
    }

    if (options?.processingDurationMs !== undefined) {
      updateData.processing_duration_ms = options.processingDurationMs;
    }

    const { error } = await supabase
      .from('pdf_complexity_logs')
      .update(updateData)
      .eq('session_id', sessionId);

    if (error) {
      console.error('Failed to update complexity log status:', error);
    } else {
      console.log(`✅ Complexity log updated: ${status} (session: ${sessionId})`);
    }
  } catch (error) {
    console.error('Error updating complexity log status:', error);
  }
}

/**
 * Marks processing as started (sets processing_started_at timestamp)
 */
export async function markComplexityLogProcessingStarted(
  sessionId: string,
  options: {
    pageType: string;
    bleedType: string;
    edgeType: string;
  }
): Promise<void> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from('pdf_complexity_logs')
      .update({
        processing_started_at: new Date().toISOString(),
        page_type: options.pageType,
        bleed_type: options.bleedType,
        edge_type: options.edgeType
      })
      .eq('session_id', sessionId);

    if (error) {
      console.error('Failed to mark processing started:', error);
    }
  } catch (error) {
    console.error('Error marking processing started:', error);
  }
}

/**
 * Categorizes error message into error type
 */
export function categorizeError(errorMessage: string): 'timeout' | 'memory' | 'complexity' | 'network' | 'unknown' {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('timeout') || lowerError.includes('504') || lowerError.includes('503')) {
    return 'timeout';
  }

  if (lowerError.includes('memory') || lowerError.includes('oom') || lowerError.includes('worker_limit') ||
      lowerError.includes('array buffer allocation')) {
    return 'memory';
  }

  if (lowerError.includes('flatten') || lowerError.includes('complex') || lowerError.includes('embedded')) {
    return 'complexity';
  }

  if (lowerError.includes('network') || lowerError.includes('fetch') || lowerError.includes('connection')) {
    return 'network';
  }

  return 'unknown';
}
