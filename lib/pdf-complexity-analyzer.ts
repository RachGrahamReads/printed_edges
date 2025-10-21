/**
 * PDF Complexity Analyzer
 *
 * Analyzes PDF files using PDF.js to detect complexity factors that may cause processing failures.
 * Logs detailed metrics to help calibrate file requirements over time.
 */

export interface PDFComplexityMetrics {
  // Basic metadata
  fileSize: number;           // In bytes
  fileSizeMB: number;        // In megabytes
  pageCount: number;

  // Page properties
  avgPageWidth: number;      // In points
  avgPageHeight: number;     // In points
  hasVariablePageSizes: boolean;

  // Complexity indicators
  totalFonts: number;        // Count of unique fonts across all pages
  totalImages: number;       // Count of images across all pages
  hasTransparency: boolean;  // Any pages with alpha channel
  hasAnnotations: boolean;   // Form fields, comments, etc.
  hasXObjects: number;       // Complex embedded objects

  // Detailed font info
  fontNames: string[];       // Names of all fonts used

  // Detailed image info
  largeImageCount: number;   // Images that might be high-res

  // Complexity score (0-100, higher = more complex)
  complexityScore: number;

  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];     // Human-readable list of risk factors

  // Timestamp
  analyzedAt: string;
}

/**
 * Analyzes a PDF file and returns complexity metrics
 */
export async function analyzePDFComplexity(file: File): Promise<PDFComplexityMetrics> {
  const fileUrl = URL.createObjectURL(file);

  try {
    // Ensure PDF.js is loaded
    await loadPDFJS();

    const pdfjsLib = (window as any).pdfjsLib;
    const pdf = await pdfjsLib.getDocument(fileUrl).promise;

    // Initialize metrics
    const metrics: Partial<PDFComplexityMetrics> = {
      fileSize: file.size,
      fileSizeMB: Math.round(file.size / (1024 * 1024) * 100) / 100,
      pageCount: pdf.numPages,
      avgPageWidth: 0,
      avgPageHeight: 0,
      hasVariablePageSizes: false,
      totalFonts: 0,
      totalImages: 0,
      hasTransparency: false,
      hasAnnotations: false,
      hasXObjects: 0,
      fontNames: [],
      largeImageCount: 0,
      complexityScore: 0,
      riskLevel: 'low',
      riskFactors: [],
      analyzedAt: new Date().toISOString()
    };

    // Analyze ALL pages for accurate complexity detection
    const pagesToAnalyze: number[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      pagesToAnalyze.push(i);
    }

    let totalWidth = 0;
    let totalHeight = 0;
    const pageSizes: Array<{ width: number; height: number }> = [];
    const allFonts = new Set<string>();

    // Analyze sampled pages
    for (const pageNum of pagesToAnalyze) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });

      totalWidth += viewport.width;
      totalHeight += viewport.height;
      pageSizes.push({ width: viewport.width, height: viewport.height });

      // Get page annotations (form fields, comments, etc.)
      const annotations = await page.getAnnotations();
      if (annotations && annotations.length > 0) {
        metrics.hasAnnotations = true;
      }

      // Analyze operator list for complexity indicators
      const operatorList = await page.getOperatorList();

      // Count images (OPS.paintImageXObject, OPS.paintInlineImageXObject)
      const imageOps = operatorList.fnArray.filter((op: number) =>
        op === pdfjsLib.OPS.paintImageXObject ||
        op === pdfjsLib.OPS.paintInlineImageXObject
      );
      metrics.totalImages! += imageOps.length;

      // Count XObjects (complex embedded objects)
      const xObjectOps = operatorList.fnArray.filter((op: number) =>
        op === pdfjsLib.OPS.paintXObject
      );
      metrics.hasXObjects! += xObjectOps.length;

      // Detect transparency (setGState with alpha/blend modes)
      const transparencyOps = operatorList.fnArray.filter((op: number) =>
        op === pdfjsLib.OPS.setGState ||
        op === pdfjsLib.OPS.beginMarkedContent ||
        op === pdfjsLib.OPS.paintFormXObjectBegin
      );
      if (transparencyOps.length > 0) {
        metrics.hasTransparency = true;
      }

      // Get fonts (this is available from the page's font dict)
      try {
        const fonts = await page.getTextContent().then((content: any) => {
          const fontSet = new Set<string>();
          content.items.forEach((item: any) => {
            if (item.fontName) {
              fontSet.add(item.fontName);
            }
          });
          return Array.from(fontSet);
        });

        fonts.forEach((font: string) => allFonts.add(font));
      } catch (e) {
        // Some PDFs may not have text content
        console.warn('Could not extract fonts from page', pageNum, e);
      }
    }

    // Calculate averages
    metrics.avgPageWidth = Math.round(totalWidth / pagesToAnalyze.length);
    metrics.avgPageHeight = Math.round(totalHeight / pagesToAnalyze.length);

    // Check for variable page sizes
    const widthVariance = Math.max(...pageSizes.map(s => s.width)) - Math.min(...pageSizes.map(s => s.width));
    const heightVariance = Math.max(...pageSizes.map(s => s.height)) - Math.min(...pageSizes.map(s => s.height));
    metrics.hasVariablePageSizes = widthVariance > 5 || heightVariance > 5;

    // Font metrics
    metrics.totalFonts = allFonts.size;
    metrics.fontNames = Array.from(allFonts);

    // Estimate large image count (rough heuristic based on XObjects)
    // This is an approximation since we can't easily get actual image sizes from PDF.js
    metrics.largeImageCount = Math.floor(metrics.hasXObjects! / 3);

    // Calculate complexity score and risk assessment
    const analysis = calculateComplexityScore(metrics as PDFComplexityMetrics);
    metrics.complexityScore = analysis.score;
    metrics.riskLevel = analysis.riskLevel;
    metrics.riskFactors = analysis.riskFactors;

    return metrics as PDFComplexityMetrics;

  } finally {
    URL.revokeObjectURL(fileUrl);
  }
}

/**
 * Calculate complexity score (0-100) and risk assessment
 *
 * Based on real-world failure data:
 * - FAILED: 2.16MB, 336p, 14 fonts, 2 images, transparency, annotations → Score should be HIGH (block)
 * - SUCCESS: 10.22MB, 336p, 0 fonts, 334 images (flattened), transparency → Score should be LOW (allow)
 * - SUCCESS: 4.38MB, 474p, 97 fonts, 89 images, transparency → Score should be MEDIUM (allow)
 *
 * Key insight: Non-flattened PDFs with fonts + embedded graphics + transparency = guaranteed failure
 */
function calculateComplexityScore(metrics: PDFComplexityMetrics): {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
} {
  let score = 0;
  const riskFactors: string[] = [];

  // Calculate file size per page to detect flattened vs non-flattened
  const mbPerPage = metrics.fileSizeMB / metrics.pageCount;

  // CRITICAL INDICATOR: Small file size per page with fonts = non-flattened with compression
  // Failed PDF: 2.16MB / 336 pages = 0.0064 MB/page with 14 fonts
  // Working flattened: 10.22MB / 336 pages = 0.0304 MB/page with 0 fonts
  const isLikelyNonFlattened = mbPerPage < 0.015 && metrics.totalFonts > 0;

  // DEADLY COMBINATION: Non-flattened + Fonts + Images + Transparency (0-60 points)
  if (isLikelyNonFlattened && metrics.totalFonts > 0 && metrics.totalImages > 0 && metrics.hasTransparency) {
    score += 60;
    riskFactors.push(`Non-flattened PDF with fonts (${metrics.totalFonts}), images (${metrics.totalImages}), and transparency - guaranteed to fail`);
  }

  // Annotations are a red flag but not always fatal (0-20 points)
  if (metrics.hasAnnotations) {
    score += 20;
    riskFactors.push('Contains form fields/annotations (indicates non-flattened)');
  }

  // Many fonts in a non-flattened PDF (0-15 points)
  if (metrics.totalFonts > 20 && isLikelyNonFlattened) {
    score += 15;
    riskFactors.push(`Very high font count (${metrics.totalFonts} fonts) in non-flattened PDF`);
  } else if (metrics.totalFonts > 10 && isLikelyNonFlattened) {
    score += 8;
    riskFactors.push(`High font count (${metrics.totalFonts} fonts) in non-flattened PDF`);
  }

  // Embedded images in non-flattened context (0-10 points)
  // NOTE: Many images with NO fonts = likely flattened (good!)
  // Few images WITH fonts = likely embedded graphics (bad!)
  const avgImagesPerPage = metrics.totalImages / metrics.pageCount;
  if (avgImagesPerPage < 0.5 && avgImagesPerPage > 0 && metrics.totalFonts > 0) {
    // Few images mixed with text = embedded graphics in non-flattened PDF
    score += 10;
    riskFactors.push('Embedded graphics mixed with text (non-flattened)');
  }

  // Very large file size can still cause issues (0-10 points)
  if (metrics.fileSizeMB > 50) {
    score += 10;
    riskFactors.push(`Very large file size (${metrics.fileSizeMB}MB)`);
  }

  // Extreme page count (0-5 points)
  if (metrics.pageCount > 500) {
    score += 5;
    riskFactors.push(`Very high page count (${metrics.pageCount} pages)`);
  }

  // Determine risk level based on score
  // HIGH (80+): Block - guaranteed to fail (non-flattened with fonts+images+transparency)
  // MEDIUM (40-79): Warn - might fail, let user try
  // LOW (0-39): Allow - likely to succeed
  let riskLevel: 'low' | 'medium' | 'high';
  if (score >= 80) {
    riskLevel = 'high';
  } else if (score >= 40) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  return { score, riskLevel, riskFactors };
}

/**
 * Ensure PDF.js is loaded
 */
async function loadPDFJS(): Promise<void> {
  const pdfjsLib = (window as any).pdfjsLib;
  if (pdfjsLib) {
    return; // Already loaded
  }

  // Load PDF.js from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  document.head.appendChild(script);

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });

  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Format complexity metrics for logging/display
 */
export function formatComplexityReport(metrics: PDFComplexityMetrics): string {
  return `
PDF Complexity Analysis:
- File: ${metrics.fileSizeMB}MB, ${metrics.pageCount} pages
- Fonts: ${metrics.totalFonts} (${metrics.fontNames.join(', ') || 'none'})
- Images: ~${metrics.totalImages} total (${metrics.largeImageCount} potentially large)
- Transparency: ${metrics.hasTransparency ? 'Yes' : 'No'}
- Annotations: ${metrics.hasAnnotations ? 'Yes' : 'No'}
- XObjects: ${metrics.hasXObjects}
- Complexity Score: ${metrics.complexityScore}/100
- Risk Level: ${metrics.riskLevel.toUpperCase()}
${metrics.riskFactors.length > 0 ? '\nRisk Factors:\n' + metrics.riskFactors.map(f => `  - ${f}`).join('\n') : ''}
  `.trim();
}
