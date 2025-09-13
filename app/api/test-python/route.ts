import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Use localhost for development
    const fullUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';
    
    console.log('Testing Python service at:', fullUrl);
    
    const pythonResponse = await fetch(`${fullUrl}/health`, {
      method: 'GET',
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text().catch(() => '');
      return NextResponse.json({
        success: false,
        error: `Python service error: ${pythonResponse.statusText}`,
        status: pythonResponse.status,
        url: fullUrl,
        response: errorText
      });
    }

    const healthData = await pythonResponse.json();
    
    return NextResponse.json({
      success: true,
      url: fullUrl,
      health: healthData,
      status: pythonResponse.status
    });

  } catch (error) {
    console.error('Error testing Python service:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}