"use client";

import { useState } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SimpleHome() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedPdfUrl, setProcessedPdfUrl] = useState<string | null>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePdfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedPdf(file);
    }
  };

  const testPythonService = async () => {
    try {
      const response = await fetch('/api/test-python');
      const result = await response.json();
      alert('Python service status: ' + JSON.stringify(result));
    } catch (error) {
      alert('Error testing Python service: ' + (error as Error).message);
    }
  };

  const processActualPdf = async () => {
    if (!selectedImageFile || !selectedPdf) return;

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('pdf', selectedPdf);
      formData.append('edge', selectedImageFile);
      formData.append('numPages', '120');
      formData.append('pageType', 'bw');
      formData.append('bleedType', 'add_bleed');
      formData.append('trimWidth', '6');
      formData.append('trimHeight', '9');

      const response = await fetch('/api/process-preview', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success) {
        setProcessedPdfUrl(result.pdfData);
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      alert('Error processing PDF: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto p-8">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <div className="flex items-center gap-2">
                Custom Edge Generator
              </div>
            </div>
            <ThemeSwitcher />
          </div>
        </nav>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Custom Edge Generator</h1>
          <p className="text-lg text-muted-foreground">
            Upload your PDF and edge image to create custom printed edges for your book
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - Upload Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create Your Custom Edge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* PDF Upload */}
              <div>
                <Label htmlFor="pdf">1. Upload PDF</Label>
                <Input
                  id="pdf"
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                />
                {selectedPdf && (
                  <p className="text-xs text-green-600 mt-1">✅ PDF uploaded: {selectedPdf.name}</p>
                )}
              </div>

              {/* Edge Image Upload */}
              <div>
                <Label htmlFor="image">2. Upload Edge Image</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                {selectedImage && (
                  <p className="text-xs text-green-600 mt-1">✅ Image uploaded</p>
                )}
              </div>

              {/* Test Python Service */}
              <Button
                onClick={testPythonService}
                variant="outline"
                className="w-full"
              >
                🔍 Test Python Service
              </Button>

              {/* Process Button */}
              {selectedPdf && selectedImage && (
                <Button
                  onClick={processActualPdf}
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? "Processing..." : "🔄 Process PDF"}
                </Button>
              )}

              {/* Download section */}
              {processedPdfUrl && (
                <div className="p-3 bg-green-100 rounded-lg border border-green-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-green-800">✅ Processing Complete!</p>
                      <p className="text-xs text-green-600">Your PDF is ready for download</p>
                    </div>
                    <a
                      href={processedPdfUrl}
                      download={`processed-${selectedPdf?.name || 'book'}.pdf`}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      📥 Download PDF
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Preview Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedImage ? (
                <div className="text-center">
                  <p className="mb-4">Edge Image Preview:</p>
                  <img 
                    src={selectedImage} 
                    alt="Edge preview" 
                    className="max-w-full h-48 object-contain mx-auto border rounded"
                  />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-500 border-2 border-dashed border-gray-300 rounded">
                  Upload files to see preview
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16 mt-16">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}