import { NextResponse } from 'next/server';

// Simple test route to verify deployment
export async function GET() {
  return NextResponse.json({
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    deployment: 'latest'
  });
}