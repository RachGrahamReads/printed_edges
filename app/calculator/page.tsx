"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Calculator,
  Download,
  Info
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";

// Constants from Edge Functions
const BLEED_INCHES = 0.125;
const SAFETY_BUFFER_INCHES = 0.125;
const POINTS_PER_INCH = 72;
const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;
const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH;
const PAPER_THICKNESS_INCHES = 0.0035; // Standard paper thickness

interface CalculationResult {
  sideImageWidth: number;
  sideImageHeight: number;
  templateWidth: number;
  templateHeight: number;
  numLeaves: number;
}

export default function CalculatorPage() {
  const [trimWidth, setTrimWidth] = useState<string>("");
  const [trimHeight, setTrimHeight] = useState<string>("");
  const [totalPages, setTotalPages] = useState<string>("");
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);

  const calculateImageSize = () => {
    const widthInches = parseFloat(trimWidth);
    const heightInches = parseFloat(trimHeight);
    const numPages = parseInt(totalPages);

    if (!widthInches || !heightInches || !numPages || widthInches <= 0 || heightInches <= 0 || numPages <= 0) {
      return;
    }

    // Calculate number of leaves (sheets)
    const numLeaves = Math.ceil(numPages / 2);

    // Calculate physical edge dimensions (automatically add bleed)
    const physicalEdgeWidth = numLeaves * PAPER_THICKNESS_INCHES; // Width based on spine thickness
    const actualBookHeight = heightInches + 0.25; // Always add 0.25" bleed to height
    const physicalEdgeHeight = actualBookHeight; // Height matches book height with bleed

    // Calculate template dimensions to match actual processing dimensions
    const templateWidth = numLeaves; // Width in pixels = number of leaves (1px per leaf)
    const templateHeight = Math.round(actualBookHeight * 285.7); // Height in pixels at 285.7 DPI

    // Convert back to inches for display
    const result: CalculationResult = {
      sideImageWidth: physicalEdgeWidth,
      sideImageHeight: physicalEdgeHeight,
      templateWidth: templateWidth,
      templateHeight: templateHeight,
      numLeaves: numLeaves
    };

    setCalculation(result);
  };

  const formatDimension = (inches: number): string => {
    return `${inches.toFixed(3)}"`;
  };

  const formatPixels = (inches: number, dpi: number = 300): string => {
    return `${Math.round(inches * dpi)}px`;
  };

  // Generate template function (same as /create page)
  const generateTemplate = () => {
    if (!calculation) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const widthInches = parseFloat(trimWidth);
    const heightInches = parseFloat(trimHeight);
    const numPages = parseInt(totalPages);

    // Calculate template dimensions to match actual processing dimensions
    const templateWidth = calculation.templateWidth;
    const templateHeight = calculation.templateHeight;

    canvas.width = templateWidth;
    canvas.height = templateHeight;

    // Fill with light background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, templateWidth, templateHeight);

    // Calculate zones using the same DPI as template height
    const bleedMargin = Math.round(0.125 * 285.7); // 0.125" in pixels at 285.7 DPI
    const bufferMargin = Math.round(0.125 * 285.7); // Additional 0.125" buffer zone

    // Draw bleed zones (50% transparent red) - show for both add_bleed and existing_bleed
    ctx.fillStyle = 'rgba(220, 53, 69, 0.5)';
    // Top bleed zone
    ctx.fillRect(0, 0, templateWidth, bleedMargin);
    // Bottom bleed zone
    ctx.fillRect(0, templateHeight - bleedMargin, templateWidth, bleedMargin);

    // Draw buffer zones (50% transparent blue)
    // Buffer zones start after the bleed zones
    const bufferTop = bleedMargin;
    const bufferBottom = bleedMargin;

    ctx.fillStyle = 'rgba(0, 123, 255, 0.5)';
    // Top buffer zone (starts after the red bleed zone)
    ctx.fillRect(0, bufferTop, templateWidth, bufferMargin);
    // Bottom buffer zone (ends before the red bleed zone)
    ctx.fillRect(0, templateHeight - bufferBottom - bufferMargin, templateWidth, bufferMargin);

    // Add rotated text instructions (90 degrees)
    ctx.save();
    ctx.translate(templateWidth / 2, templateHeight / 2);
    ctx.rotate(Math.PI / 2); // 90 degrees

    // Calculate font sizes based on template width (narrow templates need smaller fonts)
    const baseFontSize = Math.max(Math.min(templateWidth / 8, 24), 10); // Scale with width, min 10px, max 24px
    const lineSpacing = baseFontSize * 1.2; // Tighter line spacing

    ctx.fillStyle = '#495057';
    ctx.font = `${baseFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';

    // Combine all template info into one line to prevent cropping
    const templateText = `Side Edge Template for ${widthInches}" × ${heightInches}" trim; ${Math.round(templateWidth)} × ${Math.round(templateHeight)}px - Bleed (red) - Buffer (blue)`;

    ctx.fillText(templateText, 0, -lineSpacing);

    ctx.restore();

    // Download the template
    const link = document.createElement('a');
    link.download = `side-edge-template-${widthInches}x${heightInches}-${numPages}pages.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex flex-col">
      <div className="flex-1">
        <div className="max-w-4xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link href="/create">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Create
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Calculator className="h-8 w-8 text-amber-600" />
                Edge Image Size Calculator
              </h1>
              <p className="text-gray-600 mt-2">
                Calculate the recommended image dimensions for your book's trim size
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Book Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="trim-width">Trim Width (inches)</Label>
                    <Input
                      id="trim-width"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="6.0"
                      value={trimWidth}
                      onChange={(e) => setTrimWidth(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="trim-height">Trim Height (inches)</Label>
                    <Input
                      id="trim-height"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="9.0"
                      value={trimHeight}
                      onChange={(e) => setTrimHeight(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="total-pages">Total Pages</Label>
                  <Input
                    id="total-pages"
                    type="number"
                    min="1"
                    placeholder="120"
                    value={totalPages}
                    onChange={(e) => setTotalPages(e.target.value)}
                  />
                </div>


                <Button
                  onClick={calculateImageSize}
                  className="w-full"
                  disabled={!trimWidth || !trimHeight || !totalPages}
                >
                  Calculate Image Sizes
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            {calculation && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Recommended Image Sizes
                    <Badge variant="secondary">Results</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-blue-900">Side Edge Image</h4>
                        <div className="mt-2">
                          <div className="text-sm">
                            <span className="font-medium">Template size:</span> {calculation.templateWidth}px × {calculation.templateHeight}px
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-3">
                    <Button
                      onClick={generateTemplate}
                      className="w-full"
                      variant="outline"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Template
                    </Button>
                    <Link href="/create">
                      <Button className="w-full" variant="default">
                        Start Creating with These Dimensions
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </div>
      <SiteFooter />
    </div>
  );
}