import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// POST: Regenerate edge design with new PDF
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    const designId = formData.get('designId') as string;

    if (!pdfFile || !designId) {
      return NextResponse.json(
        { error: 'PDF file and design ID are required' },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceRoleClient();

    // Fetch the edge design and verify ownership
    const { data: design, error: designError } = await serviceSupabase
      .from('edge_designs')
      .select('*')
      .eq('id', designId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (designError || !design) {
      return NextResponse.json(
        { error: 'Design not found or access denied' },
        { status: 404 }
      );
    }

    // Check if design is expired (60 days)
    const createdDate = new Date(design.created_at);
    const expiryDate = new Date(createdDate.getTime() + (60 * 24 * 60 * 60 * 1000));
    const today = new Date();

    if (today > expiryDate) {
      return NextResponse.json(
        { error: 'Design has expired. Please create a new design with a credit.' },
        { status: 403 }
      );
    }

    // TODO: Validate PDF dimensions and page count here
    // For now, we'll assume the validation happens in the processing function

    // Convert PDF to base64 for processing
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const pdfBase64 = pdfBuffer.toString('base64');

    // Check if we have stored slices for fast regeneration
    console.log('Full design data:', JSON.stringify(design, null, 2));
    console.log('Design data summary:', {
      id: design.id,
      name: design.name,
      sideImagePath: design.side_image_path,
      topImagePath: design.top_image_path,
      bottomImagePath: design.bottom_image_path,
      edgeType: design.edge_type,
      hasStoredSlices: !!design.slice_storage_paths,
      createdAt: design.created_at
    });

    let sliceStoragePaths = null;

    if (design.slice_storage_paths) {
      console.log('Found stored slices for fast regeneration');
      sliceStoragePaths = design.slice_storage_paths;
    } else {
      console.log('No stored slices found - this design was created before slice storage was implemented');
      return NextResponse.json(
        { error: 'This design cannot be regenerated. Please create a new design to enable fast regeneration.' },
        { status: 400 }
      );
    }

    // Determine the appropriate edge type based on stored slices
    let effectiveEdgeType = design.edge_type || 'side-only';

    // Validate that we have the required slices for the edge type
    if (effectiveEdgeType === 'side-only' && !sliceStoragePaths.side?.masked) {
      throw new Error('Side edge slices not found. This design may be corrupted.');
    }
    if (effectiveEdgeType === 'all-edges' && (!sliceStoragePaths.side?.masked || !sliceStoragePaths.top?.masked || !sliceStoragePaths.bottom?.masked)) {
      throw new Error('All-edges slices not found. This design may be corrupted.');
    }

    console.log(`Processing with edge type: ${effectiveEdgeType}`);

    try {
      const numPages = design.page_count || 1;
      console.log(`Using stored slices for fast regeneration - Side: ${sliceStoragePaths.side?.masked?.length || 0}, Top: ${sliceStoragePaths.top?.masked?.length || 0}, Bottom: ${sliceStoragePaths.bottom?.masked?.length || 0}`);

      // Use chunked processing for large PDFs (>20 pages), simple processing for smaller ones
      if (numPages > 20) {
        console.log(`Large PDF detected (${numPages} pages), using chunked processing`);

        // Upload PDF to storage for chunked processing
        const sessionId = `regenerate_${designId}_${Date.now()}`;
        const pdfPath = `${sessionId}/original.pdf`;

        const { error: uploadError } = await serviceSupabase.storage
          .from('pdfs')
          .upload(pdfPath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Failed to upload PDF: ${uploadError.message}`);
        }

        // Use the process-pdf-chunked function with stored slices
        const processResult = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-pdf-chunked`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId,
            pdfPath,
            sliceStoragePaths: sliceStoragePaths, // Use the stored slices for fast regeneration
            numPages: numPages,
            pageType: 'standard',
            bleedType: design.bleed_type || 'add_bleed',
            edgeType: effectiveEdgeType,
            trimWidth: design.pdf_width,
            trimHeight: design.pdf_height
          })
        });

        if (!processResult.ok) {
          let errorMessage = 'PDF processing failed';
          try {
            const errorData = await processResult.json();
            errorMessage = errorData.error || errorData.message || 'PDF processing failed';
          } catch (parseError) {
            const errorText = await processResult.text();
            errorMessage = errorText.includes('Function not found')
              ? 'Regeneration is temporarily unavailable. Please try again later.'
              : `Processing failed: ${processResult.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const result = await processResult.json();

        // Increment regeneration counter
        const { error: updateError } = await serviceSupabase
          .from('edge_designs')
          .update({
            regeneration_count: (design.regeneration_count || 0) + 1
          })
          .eq('id', designId);

        if (updateError) {
          console.error('Failed to update regeneration count:', updateError);
          // Don't fail the request if counter update fails
        }

        return NextResponse.json({
          success: true,
          outputPdfUrl: result.outputPdfUrl,
          regenerationCount: (design.regeneration_count || 0) + 1
        });

      } else {
        console.log(`Small PDF (${numPages} pages), using simple processing`);

        // Use the simple process-pdf function with base64 data and stored slices
        const processResult = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pdfBase64: pdfBase64,
            sliceStoragePaths: sliceStoragePaths, // Use the stored slices for fast regeneration
            numPages: numPages,
            pageType: 'standard', // Use standard as default
            bleedType: design.bleed_type || 'add_bleed',
            edgeType: effectiveEdgeType,
            trimWidth: design.pdf_width,
            trimHeight: design.pdf_height
          })
        });

        if (!processResult.ok) {
          let errorMessage = 'PDF processing failed';
          try {
            const errorData = await processResult.json();
            errorMessage = errorData.error || errorData.message || 'PDF processing failed';
          } catch (parseError) {
            const errorText = await processResult.text();
            errorMessage = errorText.includes('Function not found')
              ? 'Regeneration is temporarily unavailable. Please try again later.'
              : `Processing failed: ${processResult.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const result = await processResult.json();

        // Increment regeneration counter
        const { error: updateError } = await serviceSupabase
          .from('edge_designs')
          .update({
            regeneration_count: (design.regeneration_count || 0) + 1
          })
          .eq('id', designId);

        if (updateError) {
          console.error('Failed to update regeneration count:', updateError);
          // Don't fail the request if counter update fails
        }

        return NextResponse.json({
          success: true,
          outputPdfUrl: result.outputPdfUrl,
          regenerationCount: (design.regeneration_count || 0) + 1
        });
      }

    } catch (processingError) {

      console.error('PDF processing error:', processingError);
      return NextResponse.json(
        { error: processingError instanceof Error ? processingError.message : 'PDF processing failed' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Regeneration API error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate design' },
      { status: 500 }
    );
  }
}