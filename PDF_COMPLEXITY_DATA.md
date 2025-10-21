# PDF Complexity Real-World Data

This document tracks real-world PDF processing results to help calibrate the complexity analyzer.

## Failed PDFs

### Failed PDF #1 (Original)
- **File Size**: 2.16 MB
- **Pages**: 336
- **File Size per Page**: 0.0064 MB/page (SMALLEST of all tested)
- **Fonts**: 14
- **Images**: 2 (0 potentially large, but known to be full color)
- **Transparency**: Yes
- **Annotations**: Yes
- **Links**: Yes (email and website)
- **Complexity Score**: 55/100 (old scoring)
- **Outcome**: Failed - hits worker limits
- **Notes**:
  - Failed even after removing annotations
  - Failed even after converting final page with links to PNG (so links don't work)
  - Appears to be non-flattened with compression

## Successful PDFs

### Success #1 - Flattened Version
- **File Size**: 10.22 MB
- **Pages**: 336
- **File Size per Page**: 0.0304 MB/page (LARGEST of all tested)
- **Fonts**: 0
- **Images**: ~334 (must be the pages - 0 potentially large)
- **Transparency**: Yes
- **Annotations**: No
- **Complexity Score**: 20/100 (old scoring)
- **Outcome**: Success
- **Notes**: Flattened and lowered resolution version of Failed PDF #1

### Success #2 - High Font Count
- **File Size**: 4.38 MB
- **Pages**: 474
- **File Size per Page**: 0.0092 MB/page
- **Fonts**: 97 (HIGH but still works!)
- **Images**: 89 (0 potentially large)
- **Transparency**: Yes
- **Annotations**: No
- **Complexity Score**: 45/100 (old scoring)
- **Outcome**: Success
- **Notes**: Proves that high font count alone does NOT predict failure

### Success #3 - Moderate Font Count
- **File Size**: 2.39 MB
- **Pages**: 286
- **File Size per Page**: 0.0084 MB/page
- **Fonts**: 64
- **Images**: 3 (0 potentially large, but known to be full color)
- **Transparency**: Yes
- **Annotations**: No
- **Complexity Score**: 85/100 (old scoring, would have been blocked)
- **Outcome**: Success
- **Notes**: Would have been incorrectly blocked by original 80+ threshold

### Success #4 - Black & White Background Images
- **File Size**: Unknown
- **Pages**: 500
- **Black & White Background Images**: Yes (on chapter titles)
- **Outcome**: Success
- **Notes**: Shows that some image types work fine

## Key Insights

1. **File Size per Page Correlation**:
   - Failed: 0.0064 MB/page (smallest)
   - Success (64 fonts): 0.0084 MB/page
   - Success (97 fonts): 0.0092 MB/page
   - Success (flattened): 0.0304 MB/page (largest)
   - **Pattern**: Smaller file size per page with fonts may indicate problematic compression/non-flattening

2. **Fonts Alone Don't Predict Failure**:
   - 97 fonts succeeded
   - 64 fonts succeeded
   - 14 fonts failed
   - **Conclusion**: Font count is NOT a reliable standalone predictor

3. **Annotations May Not Be the Issue**:
   - Removing annotations from failed PDF didn't fix it
   - **Conclusion**: Annotations are a symptom, not the root cause

4. **Flattening Matters**:
   - Same PDF content, flattened = success (10.22 MB)
   - Same PDF content, non-flattened = failure (2.16 MB)
   - **Conclusion**: Non-flattened structure is the key issue

5. **Current Hypothesis**:
   - Non-flattened PDFs with very low file size per page (< 0.007 MB/page?) combined with fonts, images, and transparency = failure
   - Need more data to determine exact threshold

## Questions to Answer

1. What is the actual threshold for "too small" file size per page?
2. Are there other PDF metadata we can check for flattening/compression?
3. Can PDF.js detect compression algorithms used?
4. Can we detect PDF version or creation method?
5. Are there other structural indicators of non-flattened PDFs?

## Next Steps

1. Continue collecting data on all uploaded PDFs (logging is in place)
2. Research additional PDF metadata available via PDF.js
3. Analyze correlation between metrics and success/failure
4. Calibrate scoring thresholds based on real data
5. Eventually implement hard blocking only for guaranteed failures
