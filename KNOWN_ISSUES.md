# Known Issues

## Blank/Corrupt Page Handling

**Issue:** PDFs with blank or corrupt pages fail during processing, specifically when superimposing masked edges onto individual pages.

**Current Behavior:**
- The `chunk-pdf` function successfully creates blank page chunks as fallback
- The `process-pdf-chunk` function catches embedPage errors and creates blank pages
- However, the error is still being thrown when attempting to add masked edges to the blank pages
- This causes the entire PDF processing to fail

**Error Message:**
```
500 - {"error":"Can't embed page with missing Contents"}
```

**Workaround:**
Users must manually fix or remove blank/corrupt pages from their PDF before uploading.

**Root Cause:**
The error is likely occurring in one of the edge application steps:
1. When calling `addEdgeToPage()` for side edges
2. When calling `addEdgeToPage()` for top edges
3. When calling `addEdgeToPage()` for bottom edges

The `addEdgeToPage()` function may be trying to embed or manipulate the page in a way that fails for blank pages created as fallbacks.

**Potential Solutions to Investigate:**
1. Add try-catch blocks around each `addEdgeToPage()` call
2. Skip edge application for pages that were created as blank fallbacks
3. Investigate if the issue is in the `addEdgeToPage()` function itself when working with blank pages
4. Check if the blank pages created in the fallback need different initialization

**Priority:** Medium-High (affects users with blank pages in their PDFs)

**Files Involved:**
- `/supabase/functions/process-pdf-chunk/index.ts` (lines 239-268: edge application)
- `/supabase/functions/chunk-pdf/index.ts` (lines 148-172: blank page creation)

**Date Identified:** October 17, 2025
