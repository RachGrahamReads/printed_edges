import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const pdfFile = formData.get('pdf') as File;
    const edgeFile = formData.get('edge') as File;
    const numPages = parseInt(formData.get('numPages') as string) || 30;
    const pageType = formData.get('pageType') as string || 'standard';
    const bleedType = formData.get('bleedType') as string || 'add_bleed';
    const trimWidth = parseFloat(formData.get('trimWidth') as string) || 6;
    const trimHeight = parseFloat(formData.get('trimHeight') as string) || 9;

    if (!pdfFile || !edgeFile) {
      return NextResponse.json(
        { error: 'PDF file and edge image file are required' },
        { status: 400 }
      );
    }

    // Create form data for Python service
    const pythonFormData = new FormData();
    pythonFormData.append('pdf', pdfFile);
    pythonFormData.append('edge', edgeFile);
    pythonFormData.append('num_pages', numPages.toString());
    pythonFormData.append('page_type', pageType);
    pythonFormData.append('bleed_type', bleedType);
    pythonFormData.append('trim_width', trimWidth.toString());
    pythonFormData.append('trim_height', trimHeight.toString());

    // For now, we'll need to create a temporary endpoint in Python service that accepts files
    // Since the current /process endpoint expects URLs, let's call a new endpoint
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
    // Ensure the URL has protocol
    const fullUrl = pythonServiceUrl.startsWith('http') ? pythonServiceUrl : `https://${pythonServiceUrl}`;
    const pythonResponse = await fetch(`${fullUrl}/process-files`, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text().catch(() => '');
      throw new Error(`Python service error: ${pythonResponse.statusText} - ${errorText}`);
    }

    // Get the processed PDF as blob
    const processedPdfBlob = await pythonResponse.blob();
    
    // Convert blob to base64 for easier handling in frontend
    const arrayBuffer = await processedPdfBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return NextResponse.json({
      success: true,
      pdfData: `data:application/pdf;base64,${base64}`
    });

  } catch (error) {
    console.error('Error processing PDF for preview:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF: ' + (error as Error).message },
      { status: 500 }
    );
  }
}