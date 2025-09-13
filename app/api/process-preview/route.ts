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
    // Use localhost for development, environment variable for production
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
    const fullUrl = pythonServiceUrl;
    const pythonResponse = await fetch(`${fullUrl}/process-files`, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text().catch(() => '');
      console.error('Python service error:', pythonResponse.status, pythonResponse.statusText, errorText);
      return NextResponse.json({
        success: false,
        error: `Python service error: ${pythonResponse.status} ${pythonResponse.statusText}`,
        details: errorText.substring(0, 500) // Limit error text length
      }, { status: 500 });
    }

    // Check if response is JSON or binary (PDF)
    const contentType = pythonResponse.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      // Handle JSON responses from Python service
      const jsonResponse = await pythonResponse.json();
      
      if (jsonResponse.status === 'error') {
        return NextResponse.json({
          success: false,
          error: jsonResponse.message || 'Python service returned an error'
        }, { status: 500 });
      }
      
      if (jsonResponse.status === 'success') {
        // This is our test response - Python service is working but not processing PDFs yet
        return NextResponse.json({
          success: false,
          error: 'PDF processing temporarily disabled on Render free tier',
          message: jsonResponse.message || 'Python service is in test mode'
        });
      }
      
      return NextResponse.json({
        success: false,
        error: 'Unexpected response from Python service',
        details: JSON.stringify(jsonResponse)
      }, { status: 500 });
    }

    // If we get here, it should be a PDF blob
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
    
    // If it's a JSON parsing error, it means we got HTML instead of expected response
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Unexpected token') && errorMessage.includes('not valid JSON')) {
      return NextResponse.json(
        { 
          error: 'Python service returned HTML instead of expected response. This usually means the service is having issues.',
          details: 'The Python service at Render may be sleeping, having dependency issues, or returning an error page.'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to process PDF: ' + errorMessage },
      { status: 500 }
    );
  }
}