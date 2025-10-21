"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileImage,
  CreditCard,
  Lock,
  Eye,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Pipette,
  Calculator
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { processPDFWithChunking } from '@/lib/process-with-chunking';
import { analyzePDFComplexity, formatComplexityReport, type PDFComplexityMetrics } from '@/lib/pdf-complexity-analyzer';
import { logPDFComplexity } from '@/lib/log-pdf-complexity';
import PDFComplexityWarningModal from '@/components/pdf-complexity-warning-modal';
import { HelpButton } from "@/components/help-button";
import { HowToGuide } from "@/components/how-to-guide";
import { HowToGuideLink } from "@/components/how-to-guide-link";

export default function CreatePage() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [sideEdgeImageFile, setSideEdgeImageFile] = useState<File | null>(null);
  const [topEdgeImageFile, setTopEdgeImageFile] = useState<File | null>(null);
  const [bottomEdgeImageFile, setBottomEdgeImageFile] = useState<File | null>(null);
  const [sideEdgeImage, setSideEdgeImage] = useState<string | null>(null);
  const [topEdgeImage, setTopEdgeImage] = useState<string | null>(null);
  const [bottomEdgeImage, setBottomEdgeImage] = useState<string | null>(null);
  const [topEdgeColor, setTopEdgeColor] = useState<string>("none");
  const [bottomEdgeColor, setBottomEdgeColor] = useState<string>("none");
  const [topCustomColor, setTopCustomColor] = useState<string>("#000000");
  const [bottomCustomColor, setBottomCustomColor] = useState<string>("#000000");
  const [showPreview, setShowPreview] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"2page" | "edge">("edge");
  const [scaleMode, setScaleMode] = useState<'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'>('fill');
  const [showScaleModeInfo, setShowScaleModeInfo] = useState(false);
  const [bleedType, setBleedType] = useState("add_bleed");
  const [bookWidth, setBookWidth] = useState(6);
  const [bookHeight, setBookHeight] = useState(9);
  const [totalPages, setTotalPages] = useState(120);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [apiUserData, setApiUserData] = useState<any>(null);
  const [credits, setCredits] = useState<{ total_credits: number; used_credits: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBleedZones, setShowBleedZones] = useState(true);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState('');
  const [processedPdfUrl, setProcessedPdfUrl] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [pageWarnings, setPageWarnings] = useState<Array<{ pageNumber: number; issue: string }>>([]);
  const [canvasReady, setCanvasReady] = useState(false);
  const [isSavingDesign, setIsSavingDesign] = useState(false);
  const [savedDesignName, setSavedDesignName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pdfComplexity, setPdfComplexity] = useState<PDFComplexityMetrics | null>(null);
  const [showComplexityWarning, setShowComplexityWarning] = useState(false);
  const [isPdfBlocked, setIsPdfBlocked] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);


  const scaleModeInfoRef = useRef<HTMLDivElement>(null);
  const topEdgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const sideEdgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const bottomEdgeCanvasRef = useRef<HTMLCanvasElement>(null);

  const supabase = createClient();
  const numLeaves = Math.ceil(totalPages / 2);

  // Check auth status and fetch credits on mount
  useEffect(() => {
    const loadUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Check if user is admin
      if (user?.email === 'rachgrahamreads@gmail.com') {
        setIsAdmin(true);
      }

      // Fetch credits if user is logged in
      if (user) {
        try {
          const response = await fetch('/api/dashboard/user-data');
          if (response.ok) {
            const data = await response.json();
            if (data.credits) {
              setCredits(data.credits);
            }
            if (data.user) {
              setApiUserData(data.user);
            }
          }
        } catch (error) {
          console.error('Error fetching credits:', error);
        }
      }
    };

    loadUserData();
  }, []);


  // Close scale mode info when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (scaleModeInfoRef.current && !scaleModeInfoRef.current.contains(event.target as Node)) {
        setShowScaleModeInfo(false);
      }
    }

    if (showScaleModeInfo) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showScaleModeInfo]);

  const loadPdfForPreview = async (file: File) => {
    try {
      const fileUrl = URL.createObjectURL(file);

      // Load PDF.js
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) {
        // Load PDF.js if not already loaded
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        document.head.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });

        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      const pdf = await (window as any).pdfjsLib.getDocument(fileUrl).promise;
      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);

      // Auto-detect page dimensions from first page
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      const widthInches = viewport.width / 72;
      const heightInches = viewport.height / 72;
      setBookWidth(Math.round(widthInches * 4) / 4);
      setBookHeight(Math.round(heightInches * 4) / 4);

      // Load first few pages for preview
      const loadPromises = [];
      for (let i = 1; i <= Math.min(3, pdf.numPages); i++) {
        loadPromises.push(loadPage(pdf, i));
      }
      await Promise.all(loadPromises);

      // Clean up the blob URL
      URL.revokeObjectURL(fileUrl);
    } catch (error) {
      console.error('Error loading PDF for preview:', error);
      throw new Error(`Failed to load PDF: ${error.message}`);
    }
  };

  const loadPage = async (pdf: any, pageNumber: number) => {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      const dataUrl = canvas.toDataURL();
      if (!dataUrl) {
        throw new Error('Failed to generate page image');
      }

      setPdfPages(prev => {
        const newPages = [...prev];
        newPages[pageNumber - 1] = dataUrl;
        return newPages;
      });
    } catch (error) {
      console.error(`Error loading page ${pageNumber}:`, error);
      throw error;
    }
  };

  // Helper to check if preview is ready to show
  const isPreviewReady = useCallback(() => {
    return pdfDocument &&
           totalPages > 0 &&
           numLeaves > 0 &&
           bookWidth > 0 &&
           bookHeight > 0 &&
           (sideEdgeImage || topEdgeColor !== "none" || bottomEdgeColor !== "none");
  }, [pdfDocument, totalPages, numLeaves, bookWidth, bookHeight, sideEdgeImage, topEdgeColor, bottomEdgeColor]);

  // Edge preview rendering function
  const renderEdgePreview = useCallback((
    imageUrl: string,
    edgeType: 'side' | 'top' | 'bottom',
    canvasRef: React.RefObject<HTMLCanvasElement | null>
  ) => {
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        // Validate dependencies before setting dimensions
        if (!numLeaves || numLeaves <= 0 || !bookWidth || !bookHeight) {
          console.warn('Invalid dimensions for canvas rendering:', { numLeaves, bookWidth, bookHeight });
          return;
        }

        // Set canvas dimensions to match physical book edge ratios
        const PAPER_THICKNESS_INCHES = 0.0035; // Standard paper thickness
        const FIXED_SIDE_HEIGHT = 300; // Always keep side edge preview at 300px height

        if (edgeType === 'side') {
          // Side edge: fixed height (300px), width based on physical thickness ratio
          canvas.height = FIXED_SIDE_HEIGHT;

          // Calculate actual book height including bleed
          const actualBookHeight = bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight;

          // Physical edge dimensions
          const physicalEdgeWidth = numLeaves * PAPER_THICKNESS_INCHES; // e.g., 60 leaves × 0.0035" = 0.21"
          const physicalEdgeHeight = actualBookHeight; // e.g., 8.25" with bleed

          // Calculate canvas width based on physical ratio
          const physicalRatio = physicalEdgeWidth / physicalEdgeHeight; // e.g., 0.21" / 8.25" = 0.0255
          canvas.width = Math.max(FIXED_SIDE_HEIGHT * physicalRatio, 8); // Minimum 8px width

          console.log(`Side edge physical: ${physicalEdgeWidth.toFixed(3)}" × ${physicalEdgeHeight}" (ratio: ${physicalRatio.toFixed(4)})`);
          console.log(`Side edge canvas: ${canvas.width}px × ${canvas.height}px`);
        } else {
          // Top/bottom edge: width and height based on physical thickness ratio
          const actualBookWidth = bleedType === "add_bleed" ? bookWidth + 0.125 : bookWidth; // Outer edge bleed only

          // Physical edge dimensions
          const physicalEdgeWidth = actualBookWidth; // e.g., 5.125" with bleed
          const physicalEdgeHeight = numLeaves * PAPER_THICKNESS_INCHES; // e.g., 60 leaves × 0.0035" = 0.21"

          // Calculate canvas dimensions based on physical ratio
          const physicalRatio = physicalEdgeWidth / physicalEdgeHeight; // e.g., 5.125" / 0.21" = 24.4
          canvas.width = 400; // Fixed reasonable width for top/bottom
          canvas.height = Math.max(canvas.width / physicalRatio, 8); // Minimum 8px height

          console.log(`Top/bottom edge physical: ${physicalEdgeWidth}" × ${physicalEdgeHeight.toFixed(3)}" (ratio: ${physicalRatio.toFixed(1)}:1)`);
          console.log(`Top/bottom edge canvas: ${canvas.width}px × ${canvas.height}px`);
        }

        // Set high DPI for sharper rendering
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.width;
        const displayHeight = canvas.height;

        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';

        ctx.scale(dpr, dpr);

        // Clear canvas and show loading state
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, displayWidth, displayHeight);

        // Add loading indicator
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', displayWidth / 2, displayHeight / 2);

        const img = new Image();

        img.onload = () => {
          try {
            // Clear canvas again
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, displayWidth, displayHeight);

            // Enable image smoothing for better quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Mark canvas as ready
            setCanvasReady(true);

            // Apply scale mode logic
            let drawWidth, drawHeight, drawX, drawY;

            switch (scaleMode) {
              case 'stretch':
                drawWidth = displayWidth;
                drawHeight = displayHeight;
                drawX = 0;
                drawY = 0;
                break;

              case 'fill':
                const fillScale = Math.max(displayWidth / img.width, displayHeight / img.height);
                drawWidth = img.width * fillScale;
                drawHeight = img.height * fillScale;
                drawX = (displayWidth - drawWidth) / 2;
                drawY = (displayHeight - drawHeight) / 2;
                break;

              case 'fit':
                const fitScale = Math.min(displayWidth / img.width, displayHeight / img.height);
                drawWidth = img.width * fitScale;
                drawHeight = img.height * fitScale;
                drawX = (displayWidth - drawWidth) / 2;
                drawY = (displayHeight - drawHeight) / 2;
                break;

              case 'none':
                // For 'none' mode: show image at actual size scaled to preview
                // Calculate recommended image dimensions in pixels (same as processing logic)
                const noneActualBookWidth = bleedType === "add_bleed" ? bookWidth + 0.125 : bookWidth;
                const noneActualBookHeight = bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight;

                const recommendedWidth = edgeType === 'side' ?
                  numLeaves : // Side: 1px per leaf
                  Math.round(noneActualBookWidth * 285.7); // Top/bottom: book width in pixels
                const recommendedHeight = edgeType === 'side' ?
                  Math.round(noneActualBookHeight * 285.7) : // Side: book height in pixels
                  numLeaves; // Top/bottom: 1px per leaf

                // Scale recommended dimensions to fit preview canvas
                const previewScale = edgeType === 'side' ?
                  displayHeight / recommendedHeight : // Side: scale based on height
                  displayWidth / recommendedWidth; // Top/bottom: scale based on width

                // Scale the actual image by the same ratio
                drawWidth = img.width * previewScale;
                drawHeight = img.height * previewScale;
                drawX = (displayWidth - drawWidth) / 2;
                drawY = (displayHeight - drawHeight) / 2;

                console.log(`None mode: Recommended ${recommendedWidth}×${recommendedHeight}px, Preview scale: ${(previewScale*100).toFixed(1)}%`);
                console.log(`None mode: Image ${img.width}×${img.height}px → Draw ${drawWidth.toFixed(1)}×${drawHeight.toFixed(1)}px`);
                break;

              case 'extend-sides':
                const extendFitScale = Math.min(displayWidth / img.width, displayHeight / img.height);
                const fittedWidth = img.width * extendFitScale;
                const fittedHeight = img.height * extendFitScale;
                const fittedX = (displayWidth - fittedWidth) / 2;
                const fittedY = (displayHeight - fittedHeight) / 2;

                ctx.drawImage(img, fittedX, fittedY, fittedWidth, fittedHeight);

                if (fittedX > 0) {
                  ctx.drawImage(img, 0, 0, 1, img.height, 0, fittedY, fittedX, fittedHeight);
                  ctx.drawImage(img, img.width - 1, 0, 1, img.height, fittedX + fittedWidth, fittedY, displayWidth - fittedX - fittedWidth, fittedHeight);
                }
                if (fittedY > 0) {
                  ctx.drawImage(img, 0, 0, img.width, 1, 0, 0, displayWidth, fittedY);
                  ctx.drawImage(img, 0, img.height - 1, img.width, 1, 0, fittedY + fittedHeight, displayWidth, displayHeight - fittedY - fittedHeight);
                }

                // Add overlay zones for extended mode as well
                if (edgeType === 'side' && showBleedZones) {
                  const actualHeight = bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight;
                  const bleedHeightInches = 0.125;
                  const bufferHeightInches = 0.125;
                  const bleedHeightPx = (bleedHeightInches / actualHeight) * displayHeight;
                  const bufferHeightPx = (bufferHeightInches / actualHeight) * displayHeight;

                  console.log(`Extended preview zones - Bleed type: ${bleedType}, Display: ${displayWidth}x${displayHeight}, Bleed: ${bleedHeightPx}px, Buffer: ${bufferHeightPx}px`);

                  // Draw bleed zones (red) - always show as they represent final book dimensions
                  console.log('Drawing red bleed zones (extended)');
                  ctx.fillStyle = 'rgba(220, 53, 69, 0.4)';
                  ctx.fillRect(0, 0, displayWidth, Math.max(bleedHeightPx, 4));
                  ctx.fillRect(0, displayHeight - Math.max(bleedHeightPx, 4), displayWidth, Math.max(bleedHeightPx, 4));

                  // Draw buffer zones (blue) - positioned inside the bleed zones
                  console.log('Drawing blue buffer zones (extended)');
                  ctx.fillStyle = 'rgba(0, 123, 255, 0.4)';
                  const bufferTop = Math.max(bleedHeightPx, 4); // Always inside the bleed zone
                  const bufferBottom = Math.max(bleedHeightPx, 4); // Always inside the bleed zone
                  ctx.fillRect(0, bufferTop, displayWidth, Math.max(bufferHeightPx, 4));
                  ctx.fillRect(0, displayHeight - bufferBottom - Math.max(bufferHeightPx, 4), displayWidth, Math.max(bufferHeightPx, 4));

                }

                return;

              default:
                drawWidth = displayWidth;
                drawHeight = displayHeight;
                drawX = 0;
                drawY = 0;
            }

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

            // Add bleed and buffer zone overlays for side edges only
            if (edgeType === 'side' && showBleedZones) {
              const actualHeight = bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight;

              // Calculate zone heights in display coordinates
              const bleedHeightInches = 0.125; // 0.125" bleed
              const bufferHeightInches = 0.125; // 0.125" buffer

              const bleedHeightPx = (bleedHeightInches / actualHeight) * displayHeight;
              const bufferHeightPx = (bufferHeightInches / actualHeight) * displayHeight;

              console.log(`Preview zones - Bleed type: ${bleedType}, Display: ${displayWidth}x${displayHeight}, Bleed: ${bleedHeightPx}px, Buffer: ${bufferHeightPx}px`);

              // Draw bleed zones (red, semi-transparent) - always show as they represent the final book dimensions
              console.log('Drawing red bleed zones');
              ctx.fillStyle = 'rgba(220, 53, 69, 0.4)';
              // Top bleed
              ctx.fillRect(0, 0, displayWidth, Math.max(bleedHeightPx, 4)); // Minimum 4px for visibility
              // Bottom bleed
              ctx.fillRect(0, displayHeight - Math.max(bleedHeightPx, 4), displayWidth, Math.max(bleedHeightPx, 4));

              // Draw buffer zones (blue, semi-transparent) - positioned inside the bleed zones
              console.log('Drawing blue buffer zones');
              ctx.fillStyle = 'rgba(0, 123, 255, 0.4)';
              const bufferTop = Math.max(bleedHeightPx, 4); // Always inside the bleed zone
              const bufferBottom = Math.max(bleedHeightPx, 4); // Always inside the bleed zone

              // Top buffer (inside bleed zone)
              ctx.fillRect(0, bufferTop, displayWidth, Math.max(bufferHeightPx, 4));
              // Bottom buffer (inside bleed zone)
              ctx.fillRect(0, displayHeight - bufferBottom - Math.max(bufferHeightPx, 4), displayWidth, Math.max(bufferHeightPx, 4));

            }
          } catch (error) {
            console.error('Error drawing image to canvas:', error);
            setPreviewError('Failed to render edge preview');
          }
        };

        img.onerror = () => {
          console.error('Failed to load edge image for preview');
          setPreviewError('Failed to load edge image');

          // Show error state in canvas
          ctx.fillStyle = '#fee2e2';
          ctx.fillRect(0, 0, displayWidth, displayHeight);
          ctx.fillStyle = '#dc2626';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Failed to load', displayWidth / 2, displayHeight / 2);
        };

        img.src = imageUrl;
      } catch (error) {
        console.error('Error in renderEdgePreview:', error);
        setPreviewError(`Rendering error: ${error.message}`);
      }
    });
  }, [scaleMode, numLeaves, bookWidth, bookHeight, bleedType, showBleedZones]);

  // Update edge previews when images or scale mode changes
  useEffect(() => {
    if (topEdgeImage && numLeaves > 0 && topEdgeCanvasRef.current && showPreview) {
      renderEdgePreview(topEdgeImage, 'top', topEdgeCanvasRef);
    }
  }, [topEdgeImage, scaleMode, numLeaves, bookWidth, bookHeight, renderEdgePreview, showPreview]);

  useEffect(() => {
    if (sideEdgeImage && numLeaves > 0 && sideEdgeCanvasRef.current && showPreview) {
      renderEdgePreview(sideEdgeImage, 'side', sideEdgeCanvasRef);
    }
  }, [sideEdgeImage, scaleMode, numLeaves, bookWidth, bookHeight, renderEdgePreview, showPreview, showBleedZones]);

  useEffect(() => {
    if (bottomEdgeImage && numLeaves > 0 && bottomEdgeCanvasRef.current && showPreview) {
      renderEdgePreview(bottomEdgeImage, 'bottom', bottomEdgeCanvasRef);
    }
  }, [bottomEdgeImage, scaleMode, numLeaves, bookWidth, bookHeight, renderEdgePreview, showPreview]);

  // Generate template function
  const generateTemplate = () => {
    if (!pdfFile || totalPages === 0) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate paper thickness and edge dimensions
    const PAPER_THICKNESS_INCHES = 0.0035; // Standard paper thickness
    const numLeaves = Math.ceil(totalPages / 2);
    const totalThickness = numLeaves * PAPER_THICKNESS_INCHES;

    // Calculate template dimensions to match actual processing dimensions
    const templateWidth = numLeaves; // Width in pixels = number of leaves (1px per leaf)
    const templateHeight = Math.round((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 285.7); // Height in pixels at 285.7 DPI

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
    // For add_bleed: buffer zones start after the bleed zones
    // For existing_bleed: buffer zones also start after the bleed zones (not overlapping)
    const bufferTop = bleedMargin; // Always start after the top bleed zone
    const bufferBottom = bleedMargin; // Always account for bottom bleed zone

    ctx.fillStyle = 'rgba(0, 123, 255, 0.5)';
    // Top buffer zone (starts after the red bleed zone)
    ctx.fillRect(0, bufferTop, templateWidth, bufferMargin);
    // Bottom buffer zone (ends before the red bleed zone)
    ctx.fillRect(0, templateHeight - bufferBottom - bufferMargin, templateWidth, bufferMargin);

    // Draw main design area (safe zone) border - REMOVED
    // ctx.strokeStyle = '#28a745';
    // ctx.setLineDash([]);
    // ctx.lineWidth = 2;
    // const safeTop = bufferTop + bufferMargin;
    // const safeHeight = templateHeight - bufferTop - bufferBottom - (2 * bufferMargin);
    // ctx.strokeRect(0, safeTop, templateWidth, safeHeight);

    // Add rotated text instructions (90 degrees)
    ctx.save();
    ctx.translate(templateWidth / 2, templateHeight / 2);
    ctx.rotate(Math.PI / 2); // 90 degrees

    // Calculate font sizes based on template width (narrow templates need smaller fonts)
    const baseFontSize = Math.max(Math.min(templateWidth / 8, 24), 10); // Scale with width, min 10px, max 24px
    const smallFontSize = Math.max(Math.min(templateWidth / 10, 18), 8); // Scale with width, min 8px, max 18px
    const lineSpacing = baseFontSize * 1.2; // Tighter line spacing

    ctx.fillStyle = '#495057';
    ctx.font = `${baseFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';

    // Combine all template info into one line to prevent cropping
    const templateText = `Side Edge Template for ${bookWidth}" × ${bookHeight}" trim; ${Math.round(templateWidth)} × ${Math.round(templateHeight)}px - Bleed (red) - Buffer (blue)`;

    ctx.fillText(templateText, 0, -lineSpacing);

    ctx.restore();

    // Download the template
    const link = document.createElement('a');
    link.download = `side-edge-template-${bookWidth}x${bookHeight}-${totalPages}pages.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Trigger edge preview rendering when switching to edge view mode
  useEffect(() => {
    if (viewMode === "edge" && sideEdgeImage && numLeaves > 0 && sideEdgeCanvasRef.current && showPreview) {
      // Small delay to ensure canvas is rendered in DOM
      setTimeout(() => {
        if (sideEdgeCanvasRef.current) {
          renderEdgePreview(sideEdgeImage, 'side', sideEdgeCanvasRef);
        }
      }, 100);
    }
  }, [viewMode, sideEdgeImage, numLeaves, renderEdgePreview, showPreview]);

  // Helper function that simulates 1px slice extraction for preview
  const getEdgeBackgroundStyle = useCallback((
    edgeType: 'side' | 'top' | 'bottom',
    imageUrl: string,
    pageIndex: number,
    stripWidth: number,
    stripHeight: number
  ) => {
    const leafIndex = Math.floor(pageIndex / 2);

    const baseStyles: React.CSSProperties = {
      backgroundImage: `url(${imageUrl})`
    };

    if (edgeType === 'side') {
      // Calculate the actual edge dimensions that would be used in processing
      const actualEdgeWidth = numLeaves; // Width in pixels = number of leaves
      const actualEdgeHeight = Math.round(bookHeight * 285.7); // Height at 285.7 DPI

      // Simulate how the image would be scaled and then sliced
      switch (scaleMode) {
        case 'stretch':
          // Stretch: Image is stretched to fit actualEdgeWidth × actualEdgeHeight
          // Each leaf gets 1px wide slice from the stretched image
          const stretchedImageWidth = actualEdgeWidth;
          baseStyles.backgroundSize = `${stretchedImageWidth * stripWidth}px ${stripHeight}px`;
          baseStyles.backgroundPosition = `${-leafIndex * stripWidth}px center`;
          baseStyles.backgroundRepeat = 'no-repeat';
          break;

        case 'fill':
          // Fill: Image is scaled to cover entire edge area (crop to fit)
          // Simulate scaling to cover, then extract slice
          const coverScale = Math.max(actualEdgeWidth / 1000, actualEdgeHeight / 600); // Assume 1000x600 source
          const scaledImageWidthFill = 1000 * coverScale;
          const slicePosition = leafIndex / actualEdgeWidth; // Position within scaled image
          baseStyles.backgroundSize = `${(scaledImageWidthFill * stripWidth) / actualEdgeWidth}px ${stripHeight}px`;
          baseStyles.backgroundPosition = `${(-slicePosition * scaledImageWidthFill * stripWidth) / actualEdgeWidth}px center`;
          baseStyles.backgroundRepeat = 'no-repeat';
          break;

        case 'fit':
          // Fit: Image is scaled to fit within edge area (show all, may have gaps)
          // Extract 1-pixel slice from the fitted image
          const containScale = Math.min(actualEdgeWidth / 1000, actualEdgeHeight / 600);
          const scaledImageWidthFit = 1000 * containScale;

          if (scaledImageWidthFit < actualEdgeWidth) {
            // Image doesn't fill full width - show centered with gaps
            const gapSize = (actualEdgeWidth - scaledImageWidthFit) / 2;
            if (leafIndex < gapSize || leafIndex >= gapSize + scaledImageWidthFit) {
              // In gap area - show transparent/empty
              baseStyles.backgroundImage = 'none';
              baseStyles.backgroundColor = 'transparent';
            } else {
              // In image area - extract 1px slice from the scaled image
              const slicePositionInImage = (leafIndex - gapSize) / scaledImageWidthFit;
              // Scale the image to match the strip width and position to show only 1 pixel
              baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
              baseStyles.backgroundPosition = `${-slicePositionInImage * stripWidth}px center`;
              baseStyles.backgroundRepeat = 'no-repeat';
            }
          } else {
            // Image fills or exceeds width - extract 1px slice
            const slicePositionFit = leafIndex / scaledImageWidthFit;
            baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
            baseStyles.backgroundPosition = `${-slicePositionFit * stripWidth}px center`;
            baseStyles.backgroundRepeat = 'no-repeat';
          }
          break;

        case 'extend-sides':
          // Extend-sides: Fit image, then extend edges to fill gaps
          // Extract 1-pixel slice from the fitted image or extended edges
          const extendContainScale = Math.min(actualEdgeWidth / 1000, actualEdgeHeight / 600);
          const extendScaledWidth = 1000 * extendContainScale;
          const extendGapSize = Math.max(0, (actualEdgeWidth - extendScaledWidth) / 2);

          if (leafIndex < extendGapSize) {
            // Left gap - extend first pixel of the image
            baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
            baseStyles.backgroundPosition = '0px center';
            baseStyles.backgroundRepeat = 'no-repeat';
          } else if (leafIndex >= extendGapSize + extendScaledWidth) {
            // Right gap - extend last pixel of the image
            baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
            baseStyles.backgroundPosition = `${-stripWidth + 1}px center`;
            baseStyles.backgroundRepeat = 'no-repeat';
          } else {
            // Image area - extract 1px slice from the scaled image
            const relativePos = (leafIndex - extendGapSize) / extendScaledWidth;
            baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
            baseStyles.backgroundPosition = `${-relativePos * stripWidth}px center`;
            baseStyles.backgroundRepeat = 'no-repeat';
          }
          break;

        case 'none':
        default:
          // None: Use image at original size, center it both horizontally and vertically
          // For a square image on a tall edge, this creates gaps at top/bottom
          const originalImageWidth = 1000; // Assume original width
          const originalImageHeight = 1000; // Assume square image

          // Calculate horizontal centering
          const horizontalCenterOffset = Math.max(0, (actualEdgeWidth - originalImageWidth) / 2);

          // Calculate vertical centering - if image height < edge height, there will be gaps
          const verticalScale = originalImageHeight / actualEdgeHeight;
          const verticalCenterOffset = Math.max(0, (actualEdgeHeight - originalImageHeight) / 2);

          if (originalImageWidth >= actualEdgeWidth) {
            // Image is wider than edge - extract slice from the image
            const noneSlicePosition = leafIndex / actualEdgeWidth;
            baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
            // Position vertically to show only the middle part if image is square on tall edge
            const verticalPosition = verticalScale < 1 ? `${verticalCenterOffset}px` : 'center';
            baseStyles.backgroundPosition = `${-noneSlicePosition * stripWidth}px ${verticalPosition}`;
            baseStyles.backgroundRepeat = 'no-repeat';
          } else if (leafIndex < horizontalCenterOffset || leafIndex >= horizontalCenterOffset + originalImageWidth) {
            // Outside horizontal image bounds - show transparent
            baseStyles.backgroundImage = 'none';
            baseStyles.backgroundColor = 'transparent';
          } else {
            // Within horizontal image bounds - extract 1px slice from the original image
            const pixelPositionNone = (leafIndex - horizontalCenterOffset) / originalImageWidth;
            baseStyles.backgroundSize = `${stripWidth}px ${stripHeight}px`;
            // For vertical positioning: if square image on tall edge, center it vertically
            // This will show gaps at top/bottom for square images on tall edges
            baseStyles.backgroundPosition = `${-pixelPositionNone * stripWidth}px center`;
            baseStyles.backgroundRepeat = 'no-repeat';
          }
          break;
      }
    } else {
      // Top/bottom edges (keeping original logic for now)
      const leafPosition = leafIndex / Math.max(1, numLeaves - 1);
      const pixelScale = Math.max(2, stripHeight / 4);
      const scaledImageHeight = 1000 * pixelScale;
      const backgroundPosY = -(leafPosition * scaledImageHeight);

      baseStyles.backgroundSize = `${stripWidth}px ${scaledImageHeight}px`;
      baseStyles.backgroundPosition = `center ${backgroundPosY}px`;
      baseStyles.backgroundRepeat = 'repeat-y';
    }

    return baseStyles;
  }, [numLeaves, scaleMode, bookHeight]);

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      // Check file size (hard limit at 50MB)
      const fileSizeMB = file.size / (1024 * 1024);

      if (fileSizeMB > 50) {
        setPreviewError(`PDF file is too large (${fileSizeMB.toFixed(1)}MB). Please upload a PDF under 50MB.`);
        return;
      }

      setPdfFile(file);
      setShowPreview(false);
      setPreviewError(null);
      setCanvasReady(false);
      setIsLoadingPreview(true);
      setPdfComplexity(null);
      setShowComplexityWarning(false);

      try {
        await loadPdfForPreview(file);

        // Generate session ID for tracking
        const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setCurrentSessionId(sessionId);

        // Analyze PDF complexity for logging and warnings
        console.log('📊 Analyzing PDF complexity...');
        const complexity = await analyzePDFComplexity(file);
        setPdfComplexity(complexity);

        // Log detailed complexity report to console
        console.log(formatComplexityReport(complexity));

        // Log complexity to database for data collection
        await logPDFComplexity(sessionId, complexity, user?.id);

        // No complexity warnings - just log for analysis
        setShowComplexityWarning(false);
        setIsPdfBlocked(false);

        // Check page count after loading (keep existing warning)
        if (pdfDocument && pdfDocument.numPages > 500) {
          console.warn(`⚠️ Large PDF detected (${pdfDocument.numPages} pages). Processing may take several minutes.`);
        }
      } catch (error) {
        console.error('Error loading PDF for preview:', error);
        setPreviewError(`Failed to load PDF: ${error.message}`);
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const handleEdgeImageUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    edgeType: 'side' | 'top' | 'bottom'
  ) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const imageUrl = e.target?.result as string;
          if (!imageUrl) {
            setPreviewError('Failed to read image file');
            return;
          }

          if (edgeType === 'side') {
            setSideEdgeImageFile(file);
            setSideEdgeImage(imageUrl);
          } else if (edgeType === 'top') {
            setTopEdgeImageFile(file);
            setTopEdgeImage(imageUrl);
          } else if (edgeType === 'bottom') {
            setBottomEdgeImageFile(file);
            setBottomEdgeImage(imageUrl);
          }

          setShowPreview(false);
          setPreviewError(null);
          setCanvasReady(false);
        } catch (error) {
          console.error('Error processing image:', error);
          setPreviewError('Failed to process image file');
        }
      };

      reader.onerror = () => {
        console.error('FileReader error');
        setPreviewError('Failed to read image file');
      };

      reader.readAsDataURL(file);
    } else {
      setPreviewError('Please select a valid image file');
    }
  };

  const handlePreview = async () => {
    if (pdfFile && (sideEdgeImage || topEdgeImage || bottomEdgeImage || topEdgeColor !== "none" || bottomEdgeColor !== "none")) {
      setIsLoadingPreview(true);
      setPreviewError(null);
      setCanvasReady(false);

      try {
        // Ensure PDF is loaded
        if (!pdfDocument) {
          await loadPdfForPreview(pdfFile);
        }

        // Wait for DOM elements to be ready
        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify canvas refs are available
        if (sideEdgeImage && !sideEdgeCanvasRef.current) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Check if everything is ready
        if (isPreviewReady()) {
          setShowPreview(true);
          setViewMode("edge");

          // Trigger canvas rendering after a short delay
          setTimeout(() => {
            if (sideEdgeImage && sideEdgeCanvasRef.current) {
              renderEdgePreview(sideEdgeImage, 'side', sideEdgeCanvasRef);
            }
          }, 100);
        } else {
          setPreviewError('Preview data not ready. Please try again.');
        }
      } catch (error) {
        console.error('Error preparing preview:', error);
        setPreviewError('Failed to prepare preview. Please try again.');
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, or data:application/pdf;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const imageFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const autoSaveDesignWithPdfData = async (designId?: string, sliceStoragePaths?: any) => {
    if (!user) {
      return;
    }

    if (!sideEdgeImageFile && !topEdgeImageFile && !bottomEdgeImageFile) {
      return;
    }

    try {
      setIsSavingDesign(true);

      // Generate automatic name
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const autoName = `Design ${bookWidth}"×${bookHeight}" - ${dateStr}`;

      // Convert files to base64 for upload
      const edgeFiles: any = {};

      if (sideEdgeImageFile) {
        edgeFiles.side = await fileToBase64(sideEdgeImageFile);
      }
      if (topEdgeImageFile) {
        edgeFiles.top = await fileToBase64(topEdgeImageFile);
      } else if (topEdgeColor && topEdgeColor !== "none") {
        edgeFiles.top = topEdgeColor === "custom" ? topCustomColor : topEdgeColor; // Pass color value directly
      }

      if (bottomEdgeImageFile) {
        edgeFiles.bottom = await fileToBase64(bottomEdgeImageFile);
      } else if (bottomEdgeColor && bottomEdgeColor !== "none") {
        edgeFiles.bottom = bottomEdgeColor === "custom" ? bottomCustomColor : bottomEdgeColor; // Pass color value directly
      }

      const designData = {
        name: autoName,
        edgeFiles,
        pdfWidth: bookWidth,
        pdfHeight: bookHeight,
        pageCount: totalPages,
        bleedType: bleedType,
        edgeType: 'all-edges', // Always all-edges for now
        designId: designId, // Use provided designId to match slice paths
        sliceStoragePaths: sliceStoragePaths // Pre-computed slice paths from processing
      };

      console.log('Auto-saving design with data:', {
        name: autoName,
        hasUser: !!user,
        userId: user?.id,
        hasEdgeFiles: Object.keys(edgeFiles).length > 0,
        edgeFileTypes: Object.keys(edgeFiles),
        pdfWidth: bookWidth,
        pdfHeight: bookHeight,
        pageCount: totalPages,
        bleedType,
        edgeType: 'all-edges'
      });

      const response = await fetch('/api/edge-designs/save-with-pdf-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(designData)
      });

      if (response.ok) {
        const data = await response.json();
        setSavedDesignName(autoName);
        console.log('Design automatically saved:', autoName);
      } else {
        const errorText = await response.text();
        console.error('Failed to auto-save design:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
      }
    } catch (error) {
      console.error('Error auto-saving design:', error);
    } finally {
      setIsSavingDesign(false);
    }
  };

  const handleProcessPdf = async () => {
    if (!user) {
      window.location.href = '/auth/signup';
      return;
    }

    // Block processing if PDF is high-risk (guaranteed to fail)
    if (isPdfBlocked) {
      setShowComplexityWarning(true);
      return;
    }

    // Pre-processing credit check (fresh verification before starting)
    try {
      const creditCheckResponse = await fetch('/api/credits/check');
      if (!creditCheckResponse.ok) {
        throw new Error('Failed to verify credits');
      }

      const creditData = await creditCheckResponse.json();

      if (!creditData.hasCredits) {
        alert('You need credits to process PDFs. Visit the pricing page to purchase credits.');
        window.location.href = '/pricing';
        return;
      }
    } catch (error) {
      console.error('Credit check failed:', error);
      alert('Unable to verify credits. Please try again.');
      return;
    }

    // Validate required files
    if (!pdfFile) {
      alert('Please upload a PDF file first.');
      return;
    }

    if (!sideEdgeImageFile && topEdgeColor === "none" && bottomEdgeColor === "none") {
      alert('Please upload a side edge image or select top/bottom edge colors.');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingProgress(0);
      setProcessingStep('Preparing files...');
      setProcessingError(null);
      setProcessedPdfUrl(null);
      setPageWarnings([]);

      // Prepare edge data (always all-edges mode)
      const edgeData: any = {};

      // Handle side edge (always file for now)
      if (sideEdgeImageFile) edgeData.side = sideEdgeImageFile;

      // Handle top edge - check for image file first, then color
      if (topEdgeImageFile) {
        edgeData.top = topEdgeImageFile;
      } else if (topEdgeColor !== "none") {
        edgeData.top = topEdgeColor === "black" ? "#000000" :
                      topEdgeColor === "custom" ? topCustomColor : topEdgeColor;
      }

      // Handle bottom edge - check for image file first, then color
      if (bottomEdgeImageFile) {
        edgeData.bottom = bottomEdgeImageFile;
      } else if (bottomEdgeColor !== "none") {
        edgeData.bottom = bottomEdgeColor === "black" ? "#000000" :
                         bottomEdgeColor === "custom" ? bottomCustomColor : bottomEdgeColor;
      }

      setProcessingStep('Processing PDF...');

      // Generate designId for slice storage (if user is authenticated)
      const designId = user ? crypto.randomUUID() : undefined;

      // Use chunking workflow for all PDFs (now with storage-based slicing)
      const result = await processPDFWithChunking(
        pdfFile,
        edgeData,
        {
          numPages: totalPages,
          pageType: 'standard', // Fixed value since we no longer use page type calculations
          bleedType: bleedType as 'add_bleed' | 'existing_bleed',
          edgeType: 'all-edges', // Always use all-edges mode
          trimWidth: bookWidth,
          trimHeight: bookHeight,
          scaleMode: 'fill' // Default scale mode
        },
        designId,
        user?.id,
        (progress) => setProcessingProgress(progress),
        (warnings) => setPageWarnings(warnings),
        currentSessionId || undefined // Pass sessionId for complexity log tracking
      );

      setProcessingStep('Complete!');
      setProcessingProgress(100);

      // Handle new return format - extract PDF buffer and slice paths
      const pdfBuffer = typeof result === 'object' && 'pdfBuffer' in result ? result.pdfBuffer : result;
      const sliceStoragePaths = typeof result === 'object' && 'sliceStoragePaths' in result ? result.sliceStoragePaths : null;

      console.log('Processing result:', {
        hasPdfBuffer: !!pdfBuffer,
        hasSlicePaths: !!sliceStoragePaths,
        designId
      });

      // Convert the PDF buffer to a data URL for download
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setProcessedPdfUrl(url);

      // Post-processing: Deduct credit and update local state
      try {
        const deductResponse = await fetch('/api/credits/deduct', {
          method: 'POST'
        });

        if (deductResponse.ok) {
          const deductData = await deductResponse.json();

          // Update local credits with server response
          if (credits) {
            setCredits({
              ...credits,
              total_credits: deductData.totalCredits,
              used_credits: deductData.usedCredits
            });
          }
        } else {
          console.warn('Failed to deduct credit, but PDF was processed successfully');
        }
      } catch (error) {
        console.error('Credit deduction failed:', error);
        // Don't block the user - PDF was processed successfully
      }

      // Auto-save the design after successful processing
      if (user) {
        autoSaveDesignWithPdfData(designId, sliceStoragePaths);
      }

      // Show success message
      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);

    } catch (error) {
      console.error('PDF processing error:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStep('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto p-8">
        {/* Navigation */}
        <nav className="flex justify-between items-center mb-8">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="flex gap-4 items-center">
            {user && credits && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {credits.total_credits - credits.used_credits} credits
              </Badge>
            )}
            <HowToGuideLink />
            <Link href="/calculator">
              <Button variant="ghost" size="sm" className="gap-2">
                <Calculator className="h-4 w-4" />
                Size Calculator
              </Button>
            </Link>
            <HelpButton />
            <Link href="/pricing">
              <Button variant="ghost" size="sm">Pricing</Button>
            </Link>
            {user ? (
              <Link href="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <div className="flex gap-2">
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link href="/auth/signup">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </nav>

        <div className="text-center mb-8">
          {user && (
            <div className="mb-2">
              <p className="text-lg font-medium text-gray-700">
                Hi, {apiUserData?.first_name || user.user_metadata?.first_name || user.email?.split('@')[0]}!
              </p>
            </div>
          )}
          <h1 className="text-4xl font-bold mb-4">Printed Edge Generator</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload a PDF and edge images to see how your custom book edges will look.
            {!user && " Sign in to process and download your files."}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Upload Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Your Files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* PDF Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">1</div>
                  <Label htmlFor="pdf-upload" className="font-medium">Upload Your PDF</Label>
                </div>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="cursor-pointer border-dashed border-2 h-12 hover:border-blue-300 transition-colors"
                  placeholder="Choose PDF file..."
                />
                {pdfFile && (
                  <div className="flex items-center gap-2 text-sm">
                    {isLoadingPreview ? (
                      <>
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-blue-600">Loading PDF...</span>
                      </>
                    ) : previewError ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-red-600">Error loading PDF</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">
                          {pdfFile.name} • {totalPages} pages • {bookWidth}"×{bookHeight}"
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* PDF Options */}
              {pdfFile && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <input
                      id="hasBleed"
                      type="checkbox"
                      checked={bleedType === "existing_bleed"}
                      onChange={(e) => setBleedType(e.target.checked ? "existing_bleed" : "add_bleed")}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <Label htmlFor="hasBleed" className="text-sm font-medium">My document already has bleed</Label>
                  </div>
                </div>
              )}

              {/* Edge Design Section */}
              {pdfFile && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">2</div>
                    <Label className="font-medium">Choose Your Edge Design</Label>
                  </div>

                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-800 mb-1">Recommended Image Size:</p>
                        <p className="text-xs text-blue-700">Side: {numLeaves} × {((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 285.7).toFixed(0)}px minimum</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={generateTemplate}
                        className="ml-4 text-xs"
                      >
                        📄 Download Template
                      </Button>
                    </div>
                  </div>


                  {/* Side Edge Image */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <Label htmlFor="sideImage" className="text-sm font-medium mb-2 block">Side Edge Image</Label>
                    <Input
                      id="sideImage"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleEdgeImageUpload(e, 'side')}
                      className="border-dashed border-2 h-10 hover:border-purple-300 transition-colors"
                    />
                    {sideEdgeImage && (
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Side edge uploaded
                      </p>
                    )}
                  </div>

                  {/* Top and Bottom Edge Colors */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <Label className="text-sm font-medium mb-3 block">Edge Colors</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      {/* Top Edge Color */}
                      <div>
                        <Label htmlFor="topEdgeColor" className="text-xs text-gray-600">Top Edge</Label>
                        <div className="flex gap-2 items-center mt-1">
                          <select
                            id="topEdgeColor"
                            value={topEdgeColor}
                            onChange={(e) => setTopEdgeColor(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-300 rounded-md flex-1"
                            disabled={!!topEdgeImage}
                          >
                            <option value="none">None</option>
                            <option value="black">Black</option>
                            <option value="custom">Custom</option>
                          </select>
                          {topEdgeColor === "custom" && !topEdgeImage && (
                            <>
                              <input
                                type="color"
                                value={topCustomColor}
                                onChange={(e) => setTopCustomColor(e.target.value)}
                                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                                title="Pick color"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if ('EyeDropper' in window) {
                                    const eyeDropper = new (window as any).EyeDropper();
                                    eyeDropper.open().then((result: any) => {
                                      setTopCustomColor(result.sRGBHex);
                                    }).catch((error: any) => {
                                      // User cancelled or eyedropper failed - don't change state
                                      console.log('Eyedropper cancelled or failed:', error);
                                    });
                                  }
                                }}
                                className="p-2 border border-gray-300 rounded hover:bg-gray-50"
                                title="Use eyedropper"
                              >
                                <Pipette className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                        {topEdgeColor !== "none" && (
                          <p className="text-xs text-green-600 mt-1">✅ Top edge color set</p>
                        )}
                      </div>

                      {/* Bottom Edge Color */}
                      <div>
                        <Label htmlFor="bottomEdgeColor" className="text-xs text-gray-600">Bottom Edge</Label>
                        <div className="flex gap-2 items-center mt-1">
                          <select
                            id="bottomEdgeColor"
                            value={bottomEdgeColor}
                            onChange={(e) => setBottomEdgeColor(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-300 rounded-md flex-1"
                            disabled={!!bottomEdgeImage}
                          >
                            <option value="none">None</option>
                            <option value="black">Black</option>
                            <option value="custom">Custom</option>
                          </select>
                          {bottomEdgeColor === "custom" && !bottomEdgeImage && (
                            <>
                              <input
                                type="color"
                                value={bottomCustomColor}
                                onChange={(e) => setBottomCustomColor(e.target.value)}
                                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                                title="Pick color"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if ('EyeDropper' in window) {
                                    const eyeDropper = new (window as any).EyeDropper();
                                    eyeDropper.open().then((result: any) => {
                                      setBottomCustomColor(result.sRGBHex);
                                    }).catch((error: any) => {
                                      // User cancelled or eyedropper failed - don't change state
                                      console.log('Eyedropper cancelled or failed:', error);
                                    });
                                  }
                                }}
                                className="p-2 border border-gray-300 rounded hover:bg-gray-50"
                                title="Use eyedropper"
                              >
                                <Pipette className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                        {bottomEdgeColor !== "none" && (
                          <p className="text-xs text-green-600 mt-1">✅ Bottom edge color set</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Admin-only top/bottom image upload options */}
                  {isAdmin && (
                    <>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <Label htmlFor="topImage" className="text-sm font-medium mb-2 block">Top Edge Image <span className="text-gray-500">(Admin only - optional)</span></Label>
                        <Input
                          id="topImage"
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleEdgeImageUpload(e, 'top')}
                          className="border-dashed border-2 h-10 hover:border-purple-300 transition-colors"
                        />
                        {topEdgeImage && (
                          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Top edge uploaded
                          </p>
                        )}
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <Label htmlFor="bottomImage" className="text-sm font-medium mb-2 block">Bottom Edge Image <span className="text-gray-500">(Admin only - optional)</span></Label>
                        <Input
                          id="bottomImage"
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleEdgeImageUpload(e, 'bottom')}
                          className="border-dashed border-2 h-10 hover:border-purple-300 transition-colors"
                        />
                        {bottomEdgeImage && (
                          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Bottom edge uploaded
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Scaling Options - moved here */}
                  {sideEdgeImage && (
                    <div className="relative">
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="scaleMode" className="text-sm">Side Edge Image Scaling</Label>
                        <button
                          type="button"
                          onClick={() => setShowScaleModeInfo(!showScaleModeInfo)}
                          className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center hover:bg-blue-600"
                          title="Click for scaling mode information"
                        >
                          ?
                        </button>
                      </div>
                      <select
                        id="scaleMode"
                        value={scaleMode}
                        onChange={(e) => setScaleMode(e.target.value as 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides')}
                        className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                      >
                        <option value="fill">Fill (recommended) - Crop to fit perfectly</option>
                        <option value="fit">Fit - Show entire image, may have gaps</option>
                        <option value="none">None - Use image as-is</option>
                        <option value="stretch">Stretch - May distort (use for abstracts)</option>
                        <option value="extend-sides">Extend Sides - Center image, extend edges</option>
                      </select>

                      {/* Information popup */}
                      {showScaleModeInfo && (
                        <div
                          ref={scaleModeInfoRef}
                          className="absolute top-full left-0 mt-2 p-4 bg-white border border-gray-300 rounded-lg shadow-lg z-10 w-80"
                        >
                          <div className="space-y-3">
                            <div className="border-b pb-2">
                              <h4 className="font-semibold text-sm">Edge Image Scaling Modes</h4>
                            </div>
                            <div>
                              <p className="font-medium text-xs text-green-700">Fill (Recommended)</p>
                              <p className="text-xs text-gray-600">Scales your image to perfectly fit the required dimensions. May crop parts of the image but ensures optimal coverage.</p>
                            </div>
                            <div>
                              <p className="font-medium text-xs text-purple-700">Fit</p>
                              <p className="text-xs text-gray-600">Shows your entire image without cropping, but may leave gaps if proportions don't match.</p>
                            </div>
                            <div>
                              <p className="font-medium text-xs text-gray-700">None</p>
                              <p className="text-xs text-gray-600">Uses your image at original size with no scaling - best for images already sized correctly.</p>
                            </div>
                            <div>
                              <p className="font-medium text-xs text-blue-700">Stretch</p>
                              <p className="text-xs text-gray-600">Uses your entire image but may distort proportions to fit the exact dimensions needed.</p>
                              <p className="text-xs text-amber-600 mt-1">⚠️ Best for abstract patterns or gradients where distortion won't be noticeable.</p>
                            </div>
                            <div>
                              <p className="font-medium text-xs text-orange-700">Extend Sides</p>
                              <p className="text-xs text-gray-600">Centers your image and extends the edge pixels to fill any gaps. Good for solid colors or simple gradients.</p>
                            </div>
                            <button
                              onClick={() => setShowScaleModeInfo(false)}
                              className="w-full mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                            >
                              Got it!
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!sideEdgeImage && topEdgeColor === "none" && bottomEdgeColor === "none" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700">
                          Upload a side edge image or choose colors for top/bottom edges to enable preview
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {pdfFile && (sideEdgeImage || topEdgeColor !== "none" || bottomEdgeColor !== "none") && (
                <div className="space-y-3 pt-4">
                  <Button
                    onClick={handlePreview}
                    className="w-full"
                    variant="outline"
                    disabled={isLoadingPreview || !isPreviewReady()}
                  >
                    {isLoadingPreview ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                        Preparing Preview...
                      </>
                    ) : !isPreviewReady() ? (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Preview Not Ready
                      </>
                    ) : (
                      <>
                        Preview Design
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleProcessPdf}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {!user ? (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        Sign Up to Process PDF
                      </>
                    ) : isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                        {processingStep || 'Processing...'}
                      </>
                    ) : (
                      <>
                        Process PDF
                      </>
                    )}
                  </Button>

                  {/* Progress Bar */}
                  {isProcessing && (
                    <div className="mt-2 space-y-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${processingProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 text-center">
                        Processing may take several minutes for large PDFs. Please do not close this page.
                      </p>
                    </div>
                  )}

                  {/* Processing Error */}
                  {processingError && (
                    <div className="text-red-600 text-sm mt-2 p-2 bg-red-50 rounded border border-red-200">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      {processingError}
                    </div>
                  )}

                  {/* Success State */}
                  {processedPdfUrl && !isProcessing && (
                    <div className="space-y-3">
                      <div className="text-green-600 text-sm p-2 bg-green-50 rounded border border-green-200">
                        <CheckCircle className="h-4 w-4 inline mr-1" />
                        PDF processed successfully!
                        <a
                          href={processedPdfUrl}
                          download="processed-pdf.pdf"
                          className="ml-2 text-blue-600 underline hover:text-blue-800"
                        >
                          Download PDF
                        </a>
                      </div>

                      {/* Page Warnings */}
                      {pageWarnings.length > 0 && (
                        <div className="border border-amber-300 bg-amber-50 p-3 rounded">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-amber-900 mb-1">
                                Page Content Warning
                              </p>
                              <p className="text-sm text-amber-800 mb-2">
                                The following page(s) in your PDF had missing or corrupt content and have been rendered as blank pages with edges:
                              </p>
                              <ul className="text-sm text-amber-800 list-disc list-inside space-y-1 mb-2">
                                {pageWarnings.map((warning, idx) => (
                                  <li key={idx}>
                                    Page {warning.pageNumber}
                                  </li>
                                ))}
                              </ul>
                              <p className="text-sm text-amber-900 font-medium">
                                Please check these pages in your downloaded PDF to ensure this is acceptable. If the original pages were not intentionally blank, please repair your PDF and try again. If you need help, please <a href="mailto:support@printededges.com" className="underline font-semibold hover:text-amber-950">contact us</a>.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Auto-Save Notification */}
                      {user && (isSavingDesign || savedDesignName) && (
                        <div className="border border-green-200 bg-green-50 p-3 rounded">
                          <div className="flex items-center gap-2">
                            {isSavingDesign ? (
                              <>
                                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-sm text-green-800">Saving design automatically...</span>
                              </>
                            ) : savedDesignName ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <span className="text-sm text-green-800">
                                  Design saved as "{savedDesignName}"
                                </span>
                              </>
                            ) : null}
                          </div>
                          {savedDesignName && (
                            <div className="text-xs text-green-700 mt-1">
                              View and manage your saved designs in the <a href="/dashboard" className="underline font-medium">dashboard</a>.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!user && (
                    <p className="text-xs text-center text-muted-foreground">
                      Create a free account to process and download your PDFs
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Preview */}
          <Card className="min-h-[600px]">
            <CardContent className="p-6">
              {!showPreview ? (
                <div className="h-full flex items-center justify-center text-center">
                  {isLoadingPreview ? (
                    <div className="space-y-4">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                      <p className="text-gray-600">Preparing preview...</p>
                    </div>
                  ) : previewError ? (
                    <div className="space-y-4">
                      <div className="text-red-500 text-center">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                        <p className="font-medium">Preview Error</p>
                        <p className="text-sm">{previewError}</p>
                      </div>
                      <Button
                        onClick={() => {
                          setPreviewError(null);
                          setShowPreview(false);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-500 mb-4">Upload files and click "Preview Design" to see your custom edges</p>
                      <p className="text-xs text-gray-400">• Choose PDF file</p>
                      <p className="text-xs text-gray-400">• Choose edge image files</p>
                      <p className="text-xs text-gray-400">• Click preview to see the result</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* View Mode Toggle */}
                  {/* View Toggle Buttons - Temporarily disabled while fixing syntax errors */}
                  {/* <div className="flex gap-2 justify-center">
                    <Button
                      size="sm"
                      variant={viewMode === "2page" ? "default" : "outline"}
                      onClick={() => setViewMode("2page")}
                    >
                      📖 2-Page View
                    </Button>
                    {sideEdgeImage && (
                      <Button
                        size="sm"
                        variant={viewMode === "edge" ? "default" : "outline"}
                        onClick={() => setViewMode("edge")}
                      >
                        🖼️ Edge Image
                      </Button>
                    )}
                  </div> */}

                  {/* 2-Page View - Temporarily disabled while fixing syntax errors */}
                  {false && (
                    <div className="relative">
                      {/* Page Navigation */}
                      <div className="flex justify-between items-center mb-4">
                        <Button
                          size="sm"
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 2))}
                          disabled={currentPage <= 1}
                        >
                          ← Previous Spread
                        </Button>
                        <span className="text-sm font-medium">
                          {currentPage === 1 ? "Cover" : `Pages ${currentPage - 1} & ${currentPage}`}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 2))}
                          disabled={currentPage >= totalPages}
                        >
                          Next Spread →
                        </Button>
                      </div>

                      {/* 2-Page Spread */}
                      <div className="flex justify-center gap-4 items-center">
                        {/* Left Page */}
                        <div
                          className="relative bg-white border-2 border-gray-300 shadow-lg"
                          style={{
                            width: `${Math.min(bookWidth * 25, 200)}px`,
                            height: `${Math.min(bookHeight * 25, 280)}px`,
                          }}
                        >
                          <div className="h-full bg-white overflow-hidden relative">
                            {currentPage > 1 && pdfPages.length > 0 && pdfPages[currentPage - 2] ? (
                              <img
                                src={pdfPages[currentPage - 2]}
                                alt={`PDF page ${currentPage - 1}`}
                                className="w-full h-full object-contain"
                                style={{ filter: "contrast(1.1) brightness(0.98)" }}
                              />
                            ) : currentPage === 1 ? (
                              <div className="h-full bg-white flex items-center justify-center" />
                            ) : (
                              <div className="h-full bg-white flex items-center justify-center">
                                <div className="text-xs text-gray-400 text-center">
                                  Page {currentPage - 1}<br/>Preview
                                </div>
                              </div>
                            )}

                            {/* Side Edge Bleed Zone - extends edge slice into page content */}
                            {currentPage > 1 && sideEdgeImage && bleedType === "add_bleed" && (
                              <div
                                className="absolute top-0 left-0 h-full pointer-events-none"
                                style={{
                                  width: `${Math.max(0.125 * 50, 6)}px`,
                                  backgroundImage: `url(${sideEdgeImage})`,
                                  backgroundSize: '1px 100%',
                                  backgroundRepeat: 'repeat-x',
                                  backgroundPosition: `${-((currentPage - 1) - 1)}px center`,
                                  opacity: 0.3,
                                  mixBlendMode: 'multiply',
                                }}
                              />
                            )}

                            {/* Top Edge Bleed Zone */}
                            {(topEdgeImage || topEdgeColor !== "none") && currentPage > 1 && bleedType === "add_bleed" && (
                              <div
                                className="absolute top-0 left-0 w-full pointer-events-none"
                                style={{
                                  height: `${Math.max(0.125 * 50, 6)}px`,
                                  ...(topEdgeImage
                                    ? {
                                        backgroundImage: `url(${topEdgeImage})`,
                                        backgroundSize: '100% 1px',
                                        backgroundRepeat: 'repeat-y',
                                        backgroundPosition: `center ${-((currentPage - 1) - 1)}px`,
                                      }
                                    : {
                                        backgroundColor: topEdgeColor === "black" ? "#000000" : topEdgeColor,
                                      }
                                  ),
                                  opacity: 0.3,
                                  mixBlendMode: 'multiply',
                                }}
                              />
                            )}

                            {/* Bottom Edge Bleed Zone */}
                            {(bottomEdgeImage || bottomEdgeColor !== "none") && currentPage > 1 && bleedType === "add_bleed" && (
                              <div
                                className="absolute bottom-0 left-0 w-full pointer-events-none"
                                style={{
                                  height: `${Math.max(0.125 * 50, 6)}px`,
                                  ...(bottomEdgeImage
                                    ? getEdgeBackgroundStyle(
                                        'bottom',
                                        bottomEdgeImage,
                                        (currentPage - 1) - 1,
                                        Math.min(bookWidth * 25, 200),
                                        Math.max(0.125 * 50, 6)
                                      )
                                    : {
                                        backgroundColor: bottomEdgeColor === "black" ? "#000000" : bottomEdgeColor,
                                      }
                                  ),
                                  opacity: 0.3,
                                  mixBlendMode: 'multiply',
                                }}
                              />
                            )}
                          </div>

                          {/* Left Edge Strip */}
                          {currentPage > 1 && sideEdgeImage && (
                            <div
                              className="absolute top-0"
                              style={{
                                left: `${Math.max(0.125 * 50, 6)}px`,
                                width: `${Math.max(0.125 * 50, 6)}px`,
                                height: "100%",
                                ...getEdgeBackgroundStyle(
                                  'side',
                                  sideEdgeImage,
                                  (currentPage - 1) - 1,
                                  Math.max(0.125 * 50, 6),
                                  Math.min(bookHeight * 25, 280)
                                ),
                                transform: "scaleX(-1) skewY(2deg)",
                                transformOrigin: "left center",
                                clipPath: (topEdgeImage || bottomEdgeImage) ?
                                  `polygon(0 ${Math.max(0.125 * 50, 6)}px, 100% 0, 100% 100%, 0 calc(100% - ${Math.max(0.125 * 50, 6)}px))` :
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                              }}
                            />
                          )}

                          {/* Top Edge Strip for Left Page */}
                          {(topEdgeImage || topEdgeColor !== "none") && currentPage > 1 && (
                            <div
                              className="absolute top-0 left-0 w-full border-t border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...(topEdgeImage
                                  ? getEdgeBackgroundStyle(
                                      'top',
                                      topEdgeImage,
                                      (currentPage - 1) - 1,
                                      Math.min(bookWidth * 25, 200),
                                      Math.max(0.125 * 50, 6)
                                    )
                                  : {
                                      backgroundColor: topEdgeColor === "black" ? "#000000" : topEdgeColor,
                                    }
                                ),
                                transform: "scaleX(-1) skewX(1deg)",
                                transformOrigin: "center top",
                                zIndex: 10,
                                clipPath: sideEdgeImage ?
                                  `polygon(0 0, 100% 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 100%, 0 100%)` :
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                              }}
                            />
                          )}

                          {/* Bottom Edge Strip for Left Page */}
                          {(bottomEdgeImage || bottomEdgeColor !== "none") && currentPage > 1 && (
                            <div
                              className="absolute bottom-0 left-0 w-full border-b border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...(bottomEdgeImage
                                  ? getEdgeBackgroundStyle(
                                      'bottom',
                                      bottomEdgeImage,
                                      (currentPage - 1) - 1,
                                      Math.min(bookWidth * 25, 200),
                                      Math.max(0.125 * 50, 6)
                                    )
                                  : {
                                      backgroundColor: bottomEdgeColor === "black" ? "#000000" : bottomEdgeColor,
                                    }
                                ),
                                transform: "scaleX(-1) skewX(-1deg)",
                                transformOrigin: "center bottom",
                                zIndex: 10,
                                clipPath: sideEdgeImage ?
                                  `polygon(0 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 0, 100% 100%, 0 100%)` :
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                              }}
                            />
                          )}
                        </div>

                        {/* Binding Gutter */}
                        <div className="w-2 bg-gray-400 h-64 rounded-sm shadow-inner"></div>

                        {/* Right Page */}
                        <div
                          className="relative bg-white border-2 border-gray-300 shadow-lg"
                          style={{
                            width: `${Math.min(bookWidth * 25, 200)}px`,
                            height: `${Math.min(bookHeight * 25, 280)}px`,
                          }}
                        >
                          {/* Right Page Content */}
                          <div className="h-full bg-white overflow-hidden relative">
                            {pdfPages.length > 0 && pdfPages[currentPage - 1] ? (
                              <img
                                src={pdfPages[currentPage - 1]}
                                alt={`PDF page ${currentPage}`}
                                className="w-full h-full object-contain"
                                style={{ filter: "contrast(1.1) brightness(0.98)" }}
                              />
                            ) : (
                              <div className="h-full bg-white flex items-center justify-center">
                                <div className="text-xs text-gray-400 text-center">
                                  Page {currentPage}<br/>Preview
                                </div>
                              </div>
                            )}

                            {/* Side Edge Bleed Zone - extends edge slice into page content */}
                            {sideEdgeImage && bleedType === "add_bleed" && (
                              <div
                                className="absolute top-0 right-0 h-full pointer-events-none"
                                style={{
                                  width: `${Math.max(0.125 * 50, 6)}px`,
                                  ...getEdgeBackgroundStyle(
                                    'side',
                                    sideEdgeImage,
                                    currentPage - 1,
                                    Math.max(0.125 * 50, 6),
                                    Math.min(bookHeight * 25, 280)
                                  ),
                                  opacity: 0.3,
                                  mixBlendMode: 'multiply',
                                }}
                              />
                            )}

                            {/* Top Edge Bleed Zone */}
                            {(topEdgeImage || topEdgeColor !== "none") && bleedType === "add_bleed" && (
                              <div
                                className="absolute top-0 left-0 w-full pointer-events-none"
                                style={{
                                  height: `${Math.max(0.125 * 50, 6)}px`,
                                  ...(topEdgeImage
                                    ? getEdgeBackgroundStyle(
                                        'top',
                                        topEdgeImage,
                                        currentPage - 1,
                                        Math.min(bookWidth * 25, 200),
                                        Math.max(0.125 * 50, 6)
                                      )
                                    : {
                                        backgroundColor: topEdgeColor === "black" ? "#000000" : topEdgeColor,
                                      }
                                  ),
                                  opacity: 0.3,
                                  mixBlendMode: 'multiply',
                                }}
                              />
                            )}

                            {/* Bottom Edge Bleed Zone */}
                            {(bottomEdgeImage || bottomEdgeColor !== "none") && bleedType === "add_bleed" && (
                              <div
                                className="absolute bottom-0 left-0 w-full pointer-events-none"
                                style={{
                                  height: `${Math.max(0.125 * 50, 6)}px`,
                                  ...(bottomEdgeImage
                                    ? getEdgeBackgroundStyle(
                                        'bottom',
                                        bottomEdgeImage,
                                        currentPage - 1,
                                        Math.min(bookWidth * 25, 200),
                                        Math.max(0.125 * 50, 6)
                                      )
                                    : {
                                        backgroundColor: bottomEdgeColor === "black" ? "#000000" : bottomEdgeColor,
                                      }
                                  ),
                                  opacity: 0.3,
                                  mixBlendMode: 'multiply',
                                }}
                              />
                            )}
                          </div>

                          {/* Right Edge Strip */}
                          {sideEdgeImage && (
                            <div
                              className="absolute top-0 right-0 h-full border-r border-gray-400"
                              style={{
                                width: `${Math.max(0.125 * 50, 6)}px`,
                                ...getEdgeBackgroundStyle(
                                  'side',
                                  sideEdgeImage,
                                  currentPage - 1,
                                  Math.max(0.125 * 50, 6),
                                  Math.min(bookHeight * 25, 280)
                                ),
                                transform: "skewY(-2deg)",
                                transformOrigin: "right center",
                                clipPath: (topEdgeImage || bottomEdgeImage) ?
                                  `polygon(0 ${Math.max(0.125 * 50, 6)}px, 100% 0, 100% 100%, 0 calc(100% - ${Math.max(0.125 * 50, 6)}px))` :
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                              }}
                            />
                          )}

                          {/* Top Edge Strip */}
                          {(topEdgeImage || topEdgeColor !== "none") && (
                            <div
                              className="absolute top-0 left-0 w-full border-t border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...(topEdgeImage
                                  ? getEdgeBackgroundStyle(
                                      'top',
                                      topEdgeImage,
                                      currentPage - 1,
                                      Math.min(bookWidth * 25, 200),
                                      Math.max(0.125 * 50, 6)
                                    )
                                  : {
                                      backgroundColor: topEdgeColor === "black" ? "#000000" : topEdgeColor,
                                    }
                                ),
                                transform: "skewX(1deg)",
                                transformOrigin: "center top",
                                zIndex: 10,
                                clipPath: sideEdgeImage ?
                                  `polygon(0 0, 100% 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 100%, 0 100%)` :
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                              }}
                            />
                          )}

                          {/* Bottom Edge Strip */}
                          {(bottomEdgeImage || bottomEdgeColor !== "none") && (
                            <div
                              className="absolute bottom-0 left-0 w-full border-b border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...(bottomEdgeImage
                                  ? getEdgeBackgroundStyle(
                                      'bottom',
                                      bottomEdgeImage,
                                      currentPage - 1,
                                      Math.min(bookWidth * 25, 200),
                                      Math.max(0.125 * 50, 6)
                                    )
                                  : {
                                      backgroundColor: bottomEdgeColor === "black" ? "#000000" : bottomEdgeColor,
                                    }
                                ),
                                transform: "skewX(-1deg)",
                                transformOrigin: "center bottom",
                                zIndex: 10,
                                clipPath: sideEdgeImage ?
                                  `polygon(0 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 0, 100% 100%, 0 100%)` :
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                              }}
                            />
                          )}
                        </div>
                      </div>

                      <div className="text-center mt-4">
                        <div className="text-sm text-gray-600">
                          {currentPage === 1 ? "Front Cover"
                            : `Pages ${currentPage - 1} & ${currentPage}`
                          } • With Custom Edges
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Edge Image View */}
                  {sideEdgeImage && (
                    <div className="w-full bg-gradient-to-b from-gray-50 to-gray-100 p-6 rounded-lg">
                      <div className="flex flex-col items-center space-y-6">
                        <div className="flex items-center justify-between w-full max-w-4xl mb-4">
                          <h3 className="text-lg font-medium text-gray-800">Your Edge Design Preview</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowBleedZones(!showBleedZones)}
                            className="flex items-center gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            {showBleedZones ? 'Hide' : 'Show'} Zones
                          </Button>
                        </div>
                        <div className="text-sm text-gray-600 text-center">
                          Showing how your edges will appear with "{scaleMode}" scaling
                          {showBleedZones && <span> • <span className="text-red-600">Red</span> = Bleed zones, <span className="text-blue-600">Blue</span> = Buffer zones</span>}
                        </div>

                        <div className="flex flex-col items-center space-y-4 max-w-4xl w-full">
                          {/* Side Edge */}
                          <div className="flex flex-col items-center space-y-2">
                            <span className="text-sm font-medium text-gray-600">Side Edge Preview</span>
                            <div className="relative p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                              <canvas
                                ref={sideEdgeCanvasRef}
                                className="rounded-lg shadow-lg border-2 border-gray-300 bg-white mx-auto block"
                                style={{
                                  height: '350px',
                                  imageRendering: 'pixelated',
                                  imageRendering: '-moz-crisp-edges',
                                  imageRendering: 'crisp-edges',
                                  filter: 'contrast(1.05) brightness(1.02)'
                                }}
                              />
                              {!canvasReady && (
                                <div className="absolute inset-4 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                    <p className="text-sm text-gray-500">Rendering preview...</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Color Edges Info */}
                          {(topEdgeColor !== "none" || bottomEdgeColor !== "none") && (
                            <div className="bg-white p-4 rounded-lg border border-gray-200 w-full max-w-md">
                              <h4 className="font-medium text-gray-800 mb-2">Color Edges</h4>
                              {topEdgeColor !== "none" && (
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm text-gray-600">Top:</span>
                                  <div
                                    className="w-6 h-6 rounded border border-gray-300"
                                    style={{
                                      backgroundColor: topEdgeColor === "black" ? "#000000" :
                                                      topEdgeColor === "custom" ? topCustomColor : topEdgeColor,
                                    }}
                                  />
                                  <span className="text-sm text-gray-600">
                                    {topEdgeColor === "black" ? "Black" :
                                     topEdgeColor === "custom" ? topCustomColor : topEdgeColor}
                                  </span>
                                </div>
                              )}
                              {bottomEdgeColor !== "none" && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">Bottom:</span>
                                  <div
                                    className="w-6 h-6 rounded border border-gray-300"
                                    style={{
                                      backgroundColor: bottomEdgeColor === "black" ? "#000000" :
                                                      bottomEdgeColor === "custom" ? bottomCustomColor : bottomEdgeColor,
                                    }}
                                  />
                                  <span className="text-sm text-gray-600">
                                    {bottomEdgeColor === "black" ? "Black" :
                                     bottomEdgeColor === "custom" ? bottomCustomColor : bottomEdgeColor}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {previewError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 w-full max-w-md">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-red-800">Preview Error</p>
                                  <p className="text-xs text-red-700">{previewError}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                  )}
            </CardContent>
          </Card>
        </div>

        {/* How-to Guide Section */}
        <div className="mt-16" data-guide="how-to">
          <HowToGuide />
        </div>

      </div>

      <SiteFooter />

      {/* PDF Complexity Warning Modal */}
      <PDFComplexityWarningModal
        isOpen={showComplexityWarning}
        onClose={() => setShowComplexityWarning(false)}
        isBlocked={isPdfBlocked}
      />
    </div>
  );
}