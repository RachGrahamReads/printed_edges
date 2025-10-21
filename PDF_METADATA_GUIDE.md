# PDF Metadata Collection Guide

This document explains all the metadata we now collect from uploaded PDFs to help identify patterns in processing success vs failure.

## Collected Metadata Fields

### Basic File Information
- **fileSize** (bytes): Raw file size
- **fileSizeMB**: File size in megabytes (rounded to 2 decimals)
- **pageCount**: Total number of pages
- **fileSizePerPageMB**: ⭐ **KEY METRIC** - File size divided by page count
  - Smaller values (< 0.007 MB/page) may indicate problematic compression/non-flattening
  - Larger values (> 0.025 MB/page) typically indicate flattened PDFs

### PDF Document Metadata (from getMetadata())
These fields come from the PDF's internal metadata and can reveal how the PDF was created:

- **pdfVersion**: PDF format version (e.g., "1.4", "1.7", "2.0")
  - Newer versions support more features but may be more complex

- **isLinearized**: Boolean - whether PDF is optimized for web streaming
  - Linearized PDFs load incrementally in browsers
  - May indicate professional PDF creation tools

- **creator**: Application that created the original document
  - Examples: "Adobe InDesign", "Microsoft Word", "LaTeX", "Canva"
  - Can help identify PDF creation workflows
  - DIY tools vs professional tools may create different PDF structures

- **producer**: Software that generated the PDF
  - Examples: "Adobe PDF Library", "iText", "wkhtmltopdf", "Ghostscript"
  - Can reveal conversion or optimization tools used
  - Some producers are known for better flattening

- **creationDate**: When the PDF was created
  - Useful for identifying batch jobs or automated generation

- **isAcroFormPresent**: Boolean - has interactive form fields
  - Interactive forms indicate non-flattened PDFs
  - Strong indicator of complexity

- **isXFAPresent**: Boolean - has XML Forms Architecture
  - Advanced form technology
  - Rare but indicates very complex PDFs

### Page Properties
- **avgPageWidth** (points): Average page width across all pages
- **avgPageHeight** (points): Average page height across all pages
- **hasVariablePageSizes**: Boolean - whether pages have different sizes
  - Variable sizes increase complexity

### Content Complexity Indicators
- **totalFonts**: Count of unique fonts across ALL pages
  - High count doesn't always predict failure (97 fonts succeeded!)
  - But combined with low file size per page = red flag

- **totalImages**: Approximate count of images across all pages
  - Many images with NO fonts = likely flattened (good!)
  - Few images WITH fonts = embedded graphics (potentially bad)

- **hasTransparency**: Boolean - any pages with alpha channel/transparency
  - Common in modern PDFs
  - Not a problem alone, but combined with other factors can cause issues

- **hasAnnotations**: Boolean - form fields, comments, markup
  - Indicates non-flattened PDF
  - But removing annotations didn't fix our failed PDF, so not root cause

- **hasXObjects**: Count of complex embedded objects
  - Used to estimate large image count

- **fontNames**: Array of font names used
  - Can reveal whether fonts are embedded or referenced
  - Standard fonts vs custom fonts

### Compression Analysis (Future Enhancement)
Fields prepared for future compression detection:

- **dominantImageCompression**: Most common compression (e.g., "FlateDecode", "DCTDecode")
- **hasFlateEncoding**: Uses Flate/ZIP compression
- **hasDCTEncoding**: Uses JPEG/DCT compression

> Note: These require deeper analysis of PDF stream objects and are not yet implemented.

### Scoring and Risk Assessment
- **complexityScore**: 0-100 calculated score
  - Current algorithm focuses on non-flattened detection
  - Will be calibrated as we collect more data

- **riskLevel**: "low", "medium", or "high"
  - HIGH (70+): Warning shown, strong indicator of likely failure
  - MEDIUM (35-69): Warning shown, might fail
  - LOW (0-34): No warning, likely to succeed
  - **Currently NO PDFs are blocked** - all can attempt processing

- **riskFactors**: Array of human-readable reasons for the score
  - e.g., "Non-flattened PDF with fonts (14), images (2), and transparency"

## How This Data Helps

### Pattern Detection
By logging all this metadata along with success/failure outcomes, we can:

1. **Identify correlations**: Which combinations of metadata predict failure?
2. **Calibrate thresholds**: What is the actual file size per page cutoff?
3. **Discover creator patterns**: Do certain creator apps produce problematic PDFs?
4. **Understand compression**: Is compression method predictive?

### Example Queries We Can Run

```sql
-- Find average file size per page for successful vs failed PDFs
SELECT
  processing_status,
  AVG(file_size_per_page_mb) as avg_mb_per_page,
  COUNT(*) as count
FROM pdf_complexity_logs
WHERE processing_status IN ('success', 'failed')
GROUP BY processing_status;

-- Find creator apps that correlate with failures
SELECT
  creator,
  COUNT(*) FILTER (WHERE processing_status = 'failed') as failures,
  COUNT(*) FILTER (WHERE processing_status = 'success') as successes,
  ROUND(COUNT(*) FILTER (WHERE processing_status = 'failed')::numeric /
        COUNT(*)::numeric * 100, 2) as failure_rate
FROM pdf_complexity_logs
WHERE processing_status IN ('success', 'failed')
GROUP BY creator
ORDER BY failures DESC;

-- Find the sweet spot for font count
SELECT
  CASE
    WHEN total_fonts = 0 THEN '0 fonts'
    WHEN total_fonts <= 10 THEN '1-10 fonts'
    WHEN total_fonts <= 50 THEN '11-50 fonts'
    WHEN total_fonts <= 100 THEN '51-100 fonts'
    ELSE '100+ fonts'
  END as font_range,
  COUNT(*) FILTER (WHERE processing_status = 'success') as successes,
  COUNT(*) FILTER (WHERE processing_status = 'failed') as failures
FROM pdf_complexity_logs
WHERE processing_status IN ('success', 'failed')
GROUP BY font_range
ORDER BY font_range;
```

## Current Hypothesis

Based on the 4 real-world PDFs tested (see [PDF_COMPLEXITY_DATA.md](PDF_COMPLEXITY_DATA.md)):

**Failed PDF Pattern**:
- Very low file size per page (0.0064 MB/page)
- Moderate font count (14)
- Few images (2)
- Has transparency
- Has annotations
- **Hypothesis**: Non-flattened + compressed + embedded fonts/images = failure

**Successful PDF Patterns**:
1. **Flattened**: High file size per page (0.0304 MB/page), 0 fonts, many images
2. **High fonts**: Moderate file size per page (0.0092 MB/page), 97 fonts, many images
3. **Moderate fonts**: Low file size per page (0.0084 MB/page), 64 fonts, few images

**Key Question**: Why does 0.0064 MB/page fail but 0.0084 MB/page succeed?
- Both have fonts
- Both have images
- Both have transparency
- File size per page difference is only 0.002 MB (2 KB)
- Need more data to find the actual threshold

## Next Steps

1. **Collect more data**: Let all PDFs process while logging this metadata
2. **Analyze patterns**: Look for correlations in the database
3. **Refine scoring**: Update complexity algorithm based on real data
4. **Eventually block**: Only implement hard blocking when we're confident in predictions
5. **Consider compression detection**: Implement stream filter analysis if needed

## Additional Metadata We Could Collect (Future)

If we need even more data, we could analyze:
- PDF structure depth (nesting of objects)
- Actual compression algorithms used (requires parsing streams)
- Font embedding types (subset vs full)
- Color space complexity (RGB vs CMYK vs spot colors)
- Layer count (if using optional content groups)
- Encryption/security settings
