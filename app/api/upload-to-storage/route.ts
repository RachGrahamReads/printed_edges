import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Missing Supabase environment variables. Some features may not work.');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

export async function POST(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase storage not configured. Missing environment variables.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const pdfFile = formData.get('pdf') as File;
    const sideEdgeFile = formData.get('sideEdge') as File;
    const topEdgeFile = formData.get('topEdge') as File;
    const bottomEdgeFile = formData.get('bottomEdge') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!pdfFile || !sessionId) {
      return NextResponse.json(
        { error: 'PDF file and session ID are required' },
        { status: 400 }
      );
    }

    const uploadResults: any = {};

    // Upload PDF
    const pdfPath = `${sessionId}/original.pdf`;
    const { data: pdfUpload, error: pdfError } = await supabase.storage
      .from('pdfs')
      .upload(pdfPath, pdfFile, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (pdfError) {
      console.error('PDF upload error:', pdfError);
      return NextResponse.json(
        { error: `Failed to upload PDF: ${pdfError.message}` },
        { status: 500 }
      );
    }

    const { data: pdfUrlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(pdfPath);

    uploadResults.pdfUrl = pdfUrlData.publicUrl;

    // Upload edge images if provided
    if (sideEdgeFile && sideEdgeFile.size > 0) {
      const sidePath = `${sessionId}/edge-side.png`;
      const { error: sideError } = await supabase.storage
        .from('edge-images')
        .upload(sidePath, sideEdgeFile, {
          contentType: sideEdgeFile.type,
          upsert: true
        });

      if (sideError) {
        console.error('Side edge upload error:', sideError);
        return NextResponse.json(
          { error: `Failed to upload side edge: ${sideError.message}` },
          { status: 500 }
        );
      }

      const { data: sideUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(sidePath);

      uploadResults.sideUrl = sideUrlData.publicUrl;
    }

    if (topEdgeFile && topEdgeFile.size > 0) {
      const topPath = `${sessionId}/edge-top.png`;
      const { error: topError } = await supabase.storage
        .from('edge-images')
        .upload(topPath, topEdgeFile, {
          contentType: topEdgeFile.type,
          upsert: true
        });

      if (topError) {
        console.error('Top edge upload error:', topError);
        return NextResponse.json(
          { error: `Failed to upload top edge: ${topError.message}` },
          { status: 500 }
        );
      }

      const { data: topUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(topPath);

      uploadResults.topUrl = topUrlData.publicUrl;
    }

    if (bottomEdgeFile && bottomEdgeFile.size > 0) {
      const bottomPath = `${sessionId}/edge-bottom.png`;
      const { error: bottomError } = await supabase.storage
        .from('edge-images')
        .upload(bottomPath, bottomEdgeFile, {
          contentType: bottomEdgeFile.type,
          upsert: true
        });

      if (bottomError) {
        console.error('Bottom edge upload error:', bottomError);
        return NextResponse.json(
          { error: `Failed to upload bottom edge: ${bottomError.message}` },
          { status: 500 }
        );
      }

      const { data: bottomUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(bottomPath);

      uploadResults.bottomUrl = bottomUrlData.publicUrl;
    }

    return NextResponse.json({
      success: true,
      urls: uploadResults
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files: ' + (error as Error).message },
      { status: 500 }
    );
  }
}