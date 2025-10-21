import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Cleanup API endpoint for deleting temporary files from Supabase storage
 * Uses service role permissions to delete files from all buckets
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, finalPdfPath, isDesignBased } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    console.log(`🧹 Starting cleanup for session: ${sessionId}`);

    const supabase = createServiceRoleClient();
    const filesToDelete: string[] = [];

    // 1. Delete the final processed PDF (if provided)
    if (finalPdfPath) {
      filesToDelete.push(finalPdfPath);
    }

    // 2. Delete the original uploaded PDF
    const originalPdfPath = `${sessionId}/original.pdf`;
    filesToDelete.push(originalPdfPath);

    // 3. Delete all chunk PDFs (individual page chunks) from processed-pdfs bucket
    const { data: processedFiles } = await supabase.storage
      .from('processed-pdfs')
      .list(sessionId, { limit: 1000 });

    if (processedFiles && processedFiles.length > 0) {
      processedFiles.forEach(file => {
        const fullPath = `${sessionId}/${file.name}`;
        if (!filesToDelete.includes(fullPath)) {
          filesToDelete.push(fullPath);
        }
      });
    }

    // Also check intermediate folder for any leftover files
    const { data: intermediateFiles } = await supabase.storage
      .from('processed-pdfs')
      .list(`${sessionId}/intermediate`, { limit: 1000 });

    if (intermediateFiles && intermediateFiles.length > 0) {
      intermediateFiles.forEach(file => {
        filesToDelete.push(`${sessionId}/intermediate/${file.name}`);
      });
    }

    // 4. Delete edge images ONLY if this is session-based (not a saved design)
    const edgeImageFiles: string[] = [];
    if (!isDesignBased) {
      const { data: edgeFiles } = await supabase.storage
        .from('edge-images')
        .list(sessionId, { limit: 100 });

      if (edgeFiles && edgeFiles.length > 0) {
        edgeFiles.forEach(file => {
          edgeImageFiles.push(`${sessionId}/${file.name}`);
        });
      }
    }

    console.log(`🗑️ Cleaning up ${filesToDelete.length} PDF files and ${edgeImageFiles.length} edge images...`);

    // Execute cleanup in batches
    let deletedPdfCount = 0;
    let deletedEdgeCount = 0;
    const errors: string[] = [];

    // Delete from processed-pdfs bucket
    const processedPdfFiles = filesToDelete.filter(f => !f.includes('edge-'));
    if (processedPdfFiles.length > 0) {
      const { error: processedError } = await supabase.storage
        .from('processed-pdfs')
        .remove(processedPdfFiles);

      if (processedError) {
        console.warn('Failed to cleanup processed-pdfs:', processedError.message);
        errors.push(`processed-pdfs: ${processedError.message}`);
      } else {
        deletedPdfCount += processedPdfFiles.length;
        console.log(`✓ Cleaned up ${processedPdfFiles.length} files from processed-pdfs bucket`);
      }
    }

    // Delete from pdfs bucket (original PDF)
    const { error: pdfError } = await supabase.storage
      .from('pdfs')
      .remove([originalPdfPath]);

    if (pdfError) {
      console.warn('Failed to cleanup original PDF:', pdfError.message);
      errors.push(`pdfs: ${pdfError.message}`);
    } else {
      deletedPdfCount += 1;
      console.log(`✓ Cleaned up original PDF from pdfs bucket`);
    }

    // Delete edge images ONLY if session-based
    if (!isDesignBased && edgeImageFiles.length > 0) {
      const { error: edgeError } = await supabase.storage
        .from('edge-images')
        .remove(edgeImageFiles);

      if (edgeError) {
        console.warn('Failed to cleanup edge images:', edgeError.message);
        errors.push(`edge-images: ${edgeError.message}`);
      } else {
        deletedEdgeCount = edgeImageFiles.length;
        console.log(`✓ Cleaned up ${edgeImageFiles.length} edge images from edge-images bucket`);
      }
    } else if (isDesignBased) {
      console.log(`ℹ️ Preserving edge images for saved design`);
    }

    return NextResponse.json({
      success: true,
      deletedPdfCount,
      deletedEdgeCount,
      preservedEdgeImages: isDesignBased,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error during cleanup:', error);
    return NextResponse.json(
      {
        error: 'Failed to cleanup session files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
