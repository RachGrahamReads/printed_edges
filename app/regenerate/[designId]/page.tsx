"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText, Clock, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { HelpButton } from "@/components/help-button";

interface EdgeDesign {
  id: string;
  name: string;
  created_at: string;
  side_image_path?: string;
  top_image_path?: string;
  bottom_image_path?: string;
  top_edge_color?: string;
  bottom_edge_color?: string;
  pdf_width?: number;
  pdf_height?: number;
  page_count?: number;
  bleed_type?: string;
  edge_type?: string;
  regeneration_count?: number;
}

export default function RegeneratePage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [design, setDesign] = useState<EdgeDesign | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState('');
  const [processedPdfUrl, setProcessedPdfUrl] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);

  const supabase = createClient();
  const designId = params.designId as string;

  useEffect(() => {
    loadDesignAndUser();
  }, [designId]);

  const loadDesignAndUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (!user) {
        router.push('/');
        return;
      }

      // Load design details
      const apiUrl = `/api/edge-designs/${designId}`;
      console.log('Fetching design from URL:', apiUrl);

      const designResponse = await fetch(apiUrl);
      console.log('Design response status:', designResponse.status, designResponse.statusText);

      if (!designResponse.ok) {
        const errorText = await designResponse.text();
        console.error('Design fetch error:', {
          status: designResponse.status,
          statusText: designResponse.statusText,
          responseText: errorText,
          url: apiUrl
        });
        throw new Error('Design not found');
      }

      const designData = await designResponse.json();
      setDesign(designData.design);

      // Check if design is expired
      const createdDate = new Date(designData.design.created_at);
      const expiryDate = new Date(createdDate.getTime() + (60 * 24 * 60 * 60 * 1000));
      const today = new Date();
      setIsExpired(today > expiryDate);

      // Load image preview
      if (designData.design.side_image_path || designData.design.top_image_path || designData.design.bottom_image_path) {
        const imagePath = designData.design.side_image_path || designData.design.top_image_path || designData.design.bottom_image_path;

        const imageResponse = await fetch('/api/edge-designs/get-image-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePath })
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          if (imageData.signedUrl) {
            const response = await fetch(imageData.signedUrl);
            if (response.ok) {
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              setImageUrl(blobUrl);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading design:', error);
      setProcessingError('Failed to load edge design');
    } finally {
      setLoading(false);
    }
  };

  const validatePdf = async (file: File) => {
    if (!design) return false;

    // Basic file validation
    if (file.type !== 'application/pdf') {
      setValidationError('Please upload a PDF file');
      return false;
    }

    // Size validation (reasonable limit)
    if (file.size > 50 * 1024 * 1024) { // 50MB
      setValidationError('PDF file is too large (max 50MB)');
      return false;
    }

    // For now, we'll validate dimensions and page count during processing
    // In a production app, you might want to use a library like pdf-lib to pre-validate
    setValidationError(null);
    return true;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (await validatePdf(file)) {
      setPdfFile(file);
    }
  };

  const handleRegenerate = async () => {
    if (!pdfFile || !design || !user) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStep('Validating PDF...');
    setProcessingError(null);

    try {
      // Show different messages based on page count
      if (design.page_count && design.page_count > 20) {
        setProcessingStep(`Processing large PDF (${design.page_count} pages)...`);
      } else {
        setProcessingStep('Processing PDF...');
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('designId', designId);

      const response = await fetch('/api/edge-designs/regenerate', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to regenerate design');
      }

      const result = await response.json();

      setProcessingProgress(100);
      setProcessingStep('Complete!');
      setProcessedPdfUrl(result.outputPdfUrl);

      // Reload design to update regeneration count
      setTimeout(() => {
        loadDesignAndUser();
      }, 1000);

    } catch (error) {
      console.error('Regeneration error:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div>Loading design...</div>
    </div>;
  }

  if (!design) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div>Design not found</div>
    </div>;
  }

  const daysLeft = (() => {
    const createdDate = new Date(design.created_at);
    const expiryDate = new Date(createdDate.getTime() + (60 * 24 * 60 * 60 * 1000));
    const today = new Date();
    return Math.ceil((expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto p-8">
        {/* Navigation */}
        <nav className="flex justify-between items-center mb-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <HelpButton />
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Regenerate Edge Design</h1>
          <p className="text-muted-foreground">
            Upload a new PDF with the same specifications to reuse your existing edge design
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Design Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Design Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Design Preview */}
              <div className="flex gap-4">
                <div className="w-20 h-32 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={`${design.name} preview`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                      <div className="text-center">
                        <FileText className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                        <p className="text-xs text-gray-500">Design</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <h3 className="font-medium">{design.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Created {new Date(design.created_at).toLocaleDateString()}
                  </p>
                  {design.regeneration_count !== undefined && design.regeneration_count > 0 && (
                    <p className="text-sm text-blue-600">
                      Regenerated {design.regeneration_count} time{design.regeneration_count !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Expiry Status */}
              <div className="bg-gray-50 p-3 rounded-lg">
                {isExpired ? (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Expired - requires new credit</span>
                  </div>
                ) : daysLeft <= 7 ? (
                  <div className="flex items-center gap-2 text-orange-600">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Free regeneration available</span>
                  </div>
                )}
              </div>

              {/* Requirements */}
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="font-medium text-sm mb-2">PDF Requirements</h4>
                <div className="space-y-1 text-sm text-gray-700">
                  {design.pdf_width && design.pdf_height && (
                    <div>Dimensions: {design.pdf_width}" × {design.pdf_height}"</div>
                  )}
                  {design.page_count && (
                    <div>Pages: Exactly {design.page_count} pages</div>
                  )}
                  {design.bleed_type && (
                    <div>Bleed: {design.bleed_type === 'add_bleed' ? 'Add bleed' : 'Has bleed'}</div>
                  )}
                </div>
              </div>

              {/* Edge Details */}
              {(design.top_image_path || design.bottom_image_path) && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600 font-medium">Edges Applied:</div>
                  <div className="flex flex-wrap gap-2">
                    {design.top_image_path && (
                      <div className="flex items-center gap-2 text-xs">
                        <span>Top</span>
                        <div
                          className="w-4 h-4 border border-gray-300 rounded"
                          style={{
                            backgroundColor: design.top_edge_color || '#e5e7eb'
                          }}
                        ></div>
                      </div>
                    )}
                    {design.bottom_image_path && (
                      <div className="flex items-center gap-2 text-xs">
                        <span>Bottom</span>
                        <div
                          className="w-4 h-4 border border-gray-300 rounded"
                          style={{
                            backgroundColor: design.bottom_edge_color || '#e5e7eb'
                          }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Upload & Process */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload New PDF
              </CardTitle>
              <CardDescription>
                Your PDF must match the exact specifications shown
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isExpired ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                  <h3 className="font-medium text-red-600 mb-2">Design Expired</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This design can no longer be regenerated for free. You'll need to create a new design with a credit.
                  </p>
                  <Link href="/create">
                    <Button>Create New Design</Button>
                  </Link>
                </div>
              ) : (
                <>
                  {/* File Upload */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                    <div className="text-center">
                      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">Upload Your PDF</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Must match the exact dimensions and page count shown
                      </p>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="pdf-upload"
                        disabled={isProcessing}
                      />
                      <label htmlFor="pdf-upload" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer">
                        Choose PDF File
                      </label>
                    </div>
                  </div>

                  {/* Selected File */}
                  {pdfFile && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">
                          {pdfFile.name}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Validation Error */}
                  {validationError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-800">{validationError}</span>
                      </div>
                    </div>
                  )}

                  {/* Process Button */}
                  <Button
                    onClick={handleRegenerate}
                    disabled={!pdfFile || isProcessing || validationError !== null}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                        {processingStep || 'Processing...'}
                      </>
                    ) : (
                      'Regenerate with Original Design'
                    )}
                  </Button>

                  {/* Progress Bar */}
                  {isProcessing && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${processingProgress}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Processing Error */}
                  {processingError && (
                    <div className="text-red-600 text-sm p-3 bg-red-50 rounded border border-red-200">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      {processingError}
                    </div>
                  )}

                  {/* Success State */}
                  {processedPdfUrl && !isProcessing && (
                    <div className="space-y-3">
                      <div className="text-green-600 text-sm p-3 bg-green-50 rounded border border-green-200">
                        <CheckCircle className="h-4 w-4 inline mr-1" />
                        PDF regenerated successfully!
                        <a
                          href={processedPdfUrl}
                          download="regenerated-pdf.pdf"
                          className="ml-2 text-blue-600 underline hover:text-blue-800"
                        >
                          Download PDF
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}