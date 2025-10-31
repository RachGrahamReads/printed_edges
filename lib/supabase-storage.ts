import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface ProcessPDFOptions {
  numPages: number
  pageType: string
  bleedType: 'add_bleed' | 'existing_bleed'
  edgeType: 'side-only' | 'all-edges'
}

export async function processPDFWithStorage(
  pdfFile: File,
  edgeFiles: {
    side?: File
    top?: File
    bottom?: File
  },
  options: ProcessPDFOptions
) {
  try {
    // For anonymous users, use a session ID
    const userId = 'anonymous' // You can implement auth later
    const sessionId = Date.now().toString()

    // Upload PDF to Supabase Storage
    const pdfPath = `${userId}/${sessionId}/original.pdf`
    const { data: pdfUpload, error: pdfError } = await supabase.storage
      .from('pdfs')
      .upload(pdfPath, pdfFile, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (pdfError) throw new Error(`Failed to upload PDF: ${pdfError.message}`)

    // Get public URL for PDF
    const { data: pdfUrlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(pdfPath)

    // Upload edge images
    const edgeUrls: any = {}

    if (edgeFiles.side) {
      const sidePath = `${userId}/${sessionId}/edge-side.png`
      const { error: sideError } = await supabase.storage
        .from('edge-images')
        .upload(sidePath, edgeFiles.side, {
          contentType: edgeFiles.side.type,
          upsert: true
        })

      if (sideError) throw new Error(`Failed to upload side edge: ${sideError.message}`)

      const { data: sideUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(sidePath)

      edgeUrls.side = sideUrlData.publicUrl
    }

    if (edgeFiles.top) {
      const topPath = `${userId}/${sessionId}/edge-top.png`
      const { error: topError } = await supabase.storage
        .from('edge-images')
        .upload(topPath, edgeFiles.top, {
          contentType: edgeFiles.top.type,
          upsert: true
        })

      if (topError) throw new Error(`Failed to upload top edge: ${topError.message}`)

      const { data: topUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(topPath)

      edgeUrls.top = topUrlData.publicUrl
    }

    if (edgeFiles.bottom) {
      const bottomPath = `${userId}/${sessionId}/edge-bottom.png`
      const { error: bottomError } = await supabase.storage
        .from('edge-images')
        .upload(bottomPath, edgeFiles.bottom, {
          contentType: edgeFiles.bottom.type,
          upsert: true
        })

      if (bottomError) throw new Error(`Failed to upload bottom edge: ${bottomError.message}`)

      const { data: bottomUrlData } = supabase.storage
        .from('edge-images')
        .getPublicUrl(bottomPath)

      edgeUrls.bottom = bottomUrlData.publicUrl
    }

    // Call Supabase Edge Function with URLs instead of file data
    const { data, error } = await supabase.functions.invoke('process-pdf', {
      body: {
        pdfUrl: pdfUrlData.publicUrl,
        edgeUrls,
        numPages: options.numPages,
        pageType: options.pageType,
        bleedType: options.bleedType,
        edgeType: options.edgeType,
        outputPath: `${userId}/${sessionId}/processed.pdf`
      }
    })

    if (error) throw error

    // Return the URL of the processed PDF
    if (data.processedPdfUrl) {
      // Download the processed PDF to return to user
      const response = await fetch(data.processedPdfUrl)
      if (!response.ok) throw new Error('Failed to download processed PDF')

      return await response.arrayBuffer()
    }

    // Fallback if Edge Function returns base64 data directly
    if (data.pdfData) {
      const pdfBase64 = data.pdfData.split(',')[1]
      const binaryString = atob(pdfBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return bytes.buffer
    }

    throw new Error('No processed PDF returned')

  } catch (error) {
    console.error('Error processing PDF with storage:', error)
    throw error
  }
}