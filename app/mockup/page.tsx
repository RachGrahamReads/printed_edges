"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function MockupPage() {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [edgeDesignFile, setEdgeDesignFile] = useState<File | null>(null);
  const [edgeDesignPreview, setEdgeDesignPreview] = useState<string | null>(null);
  const [trimWidth, setTrimWidth] = useState<number>(6);
  const [trimHeight, setTrimHeight] = useState<number>(9);
  const [pageCount, setPageCount] = useState<number>(200);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle cover image upload
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCoverPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      setMockupUrl(null);
      setError(null);
    }
  };

  // Handle edge design upload
  const handleEdgeDesignUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEdgeDesignFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setEdgeDesignPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      setMockupUrl(null);
      setError(null);
    }
  };

  // Handle trim size preset
  const handleTrimSizePreset = (preset: string) => {
    switch (preset) {
      case '5x8':
        setTrimWidth(5);
        setTrimHeight(8);
        break;
      case '6x9':
        setTrimWidth(6);
        setTrimHeight(9);
        break;
      case '8.5x11':
        setTrimWidth(8.5);
        setTrimHeight(11);
        break;
    }
    setMockupUrl(null);
  };

  // Generate mockup
  const handleGenerateMockup = async () => {
    if (!coverFile) {
      setError("Please upload a cover image");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Convert cover file to base64
      const coverBase64 = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          const result = fileReader.result as string;
          // Extract base64 part (remove data:image/...;base64, prefix)
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        fileReader.onerror = reject;
        fileReader.readAsDataURL(coverFile);
      });

      // Convert edge design file to base64 if provided
      let edgeDesignBase64: string | undefined;
      if (edgeDesignFile) {
        edgeDesignBase64 = await new Promise<string>((resolve, reject) => {
          const fileReader = new FileReader();
          fileReader.onload = () => {
            const result = fileReader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          fileReader.onerror = reject;
          fileReader.readAsDataURL(edgeDesignFile);
        });
      }

      // Call Edge Function to generate mockup with base64 images
      const { data, error: functionError } = await supabase.functions.invoke('generate-book-mockup', {
        body: {
          coverImageBase64: coverBase64,
          edgeDesignBase64,
          trimWidth,
          trimHeight,
          pageCount,
          outputPath: `mockup-${Date.now()}.png`
        }
      });

      if (functionError) {
        throw new Error(`Failed to generate mockup: ${functionError.message}`);
      }

      if (data?.success && data?.mockupUrl) {
        setMockupUrl(data.mockupUrl);
      } else {
        throw new Error("Mockup generation failed");
      }
    } catch (err) {
      console.error('Mockup generation error:', err);
      setError(err instanceof Error ? err.message : "Failed to generate mockup");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle download
  const handleDownload = () => {
    if (!mockupUrl) return;
    const link = document.createElement('a');
    link.href = mockupUrl;
    link.download = 'book-mockup.png';
    link.click();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Book Mockup Generator
          </h1>
          <p className="text-muted-foreground">
            Create a realistic 3D mockup of your book with custom cover and edge design
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Upload */}
          <div className="space-y-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Images</CardTitle>
                <CardDescription>Upload your book cover and edge design images</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="cover-upload">Book Cover Image *</Label>
                  <Input
                    id="cover-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="mt-2"
                    disabled={isProcessing}
                  />
                  {coverPreview && (
                    <div className="mt-4">
                      <p className="text-sm text-green-600 mb-2">✓ Cover uploaded</p>
                      <img
                        src={coverPreview}
                        alt="Cover preview"
                        className="w-full max-w-xs rounded-lg border shadow-sm"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="edge-upload">Edge Design Image (Optional)</Label>
                  <Input
                    id="edge-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleEdgeDesignUpload}
                    className="mt-2"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload your custom edge design to see it on the page edges
                  </p>
                  {edgeDesignPreview && (
                    <div className="mt-4">
                      <p className="text-sm text-green-600 mb-2">✓ Edge design uploaded</p>
                      <img
                        src={edgeDesignPreview}
                        alt="Edge design preview"
                        className="w-full max-w-xs rounded-lg border shadow-sm"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Book Dimensions */}
            <Card>
              <CardHeader>
                <CardTitle>Book Dimensions</CardTitle>
                <CardDescription>Specify your book size and page count for accurate edge rendering</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 block">Trim Size Presets</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={trimWidth === 5 && trimHeight === 8 ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTrimSizePreset('5x8')}
                      disabled={isProcessing}
                    >
                      5" × 8"
                    </Button>
                    <Button
                      type="button"
                      variant={trimWidth === 6 && trimHeight === 9 ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTrimSizePreset('6x9')}
                      disabled={isProcessing}
                    >
                      6" × 9"
                    </Button>
                    <Button
                      type="button"
                      variant={trimWidth === 8.5 && trimHeight === 11 ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTrimSizePreset('8.5x11')}
                      disabled={isProcessing}
                    >
                      8.5" × 11"
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="trim-width">Width (inches)</Label>
                    <Input
                      id="trim-width"
                      type="number"
                      min="4"
                      max="12"
                      step="0.5"
                      value={trimWidth}
                      onChange={(e) => setTrimWidth(parseFloat(e.target.value))}
                      disabled={isProcessing}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="trim-height">Height (inches)</Label>
                    <Input
                      id="trim-height"
                      type="number"
                      min="6"
                      max="14"
                      step="0.5"
                      value={trimHeight}
                      onChange={(e) => setTrimHeight(parseFloat(e.target.value))}
                      disabled={isProcessing}
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="page-count">Total Pages</Label>
                  <Input
                    id="page-count"
                    type="number"
                    min="20"
                    max="1000"
                    step="2"
                    value={pageCount}
                    onChange={(e) => setPageCount(parseInt(e.target.value))}
                    disabled={isProcessing}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Page count determines the thickness of the edge (calculated: {(Math.ceil(pageCount / 2) * 0.0035).toFixed(3)}" thick)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Card>
              <CardContent className="pt-6">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!coverFile || isProcessing}
                  onClick={handleGenerateMockup}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Mockup...
                    </>
                  ) : (
                    "Generate 3D Mockup"
                  )}
                </Button>

                {error && (
                  <div className="p-3 mt-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>1. Upload your book cover image (required)</p>
                <p>2. Optionally upload an edge design to preview on the page edges</p>
                <p>3. Set your book dimensions and page count for accurate edge thickness</p>
                <p>4. Click "Generate 3D Mockup" to create your mockup</p>
                <p>5. Download the final mockup for marketing materials</p>
                <p className="mt-4 text-xs">
                  The mockup is generated server-side using perspective warping and physically accurate edge dimensions based on your page count.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Preview */}
          <div>
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>Your 3D book mockup</CardDescription>
              </CardHeader>
              <CardContent>
                {mockupUrl ? (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-8 flex items-center justify-center">
                      <img
                        src={mockupUrl}
                        alt="Book mockup"
                        className="max-w-full h-auto rounded-lg shadow-lg"
                      />
                    </div>
                    <Button className="w-full" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Mockup
                    </Button>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-12 flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                      {isProcessing ? (
                        <div className="flex flex-col items-center gap-4">
                          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                          <p className="text-muted-foreground">Generating your mockup...</p>
                        </div>
                      ) : (
                        <>
                          <div className="w-64 h-64 mx-auto mb-4 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center">
                            <p className="text-slate-400 text-sm">Mockup preview</p>
                          </div>
                          <p className="text-muted-foreground">
                            Upload a cover image and generate a mockup to see the preview
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
