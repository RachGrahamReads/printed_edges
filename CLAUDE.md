# Printed Edges - Project Documentation for Claude

## Project Overview
Printed Edges is a Next.js application that adds decorative gilded edges to PDF files for print-on-demand books. It uses Supabase Edge Functions for PDF processing.

## Tech Stack
- **Frontend**: Next.js 15 with TypeScript, React 19, Tailwind CSS
- **Backend**: Supabase (Edge Functions, Storage, Database)
- **PDF Processing**: Supabase Edge Functions using pdf-lib
- **Local Development**: Docker for Supabase

## Project Structure
```
/printed-edges
├── app/                    # Next.js app directory
├── components/            # React components
├── lib/                   # Utility functions and Supabase client
├── supabase/
│   ├── functions/        # Edge Functions
│   │   ├── process-pdf/  # Main PDF processing function
│   │   └── process-pdf-urls/ # URL-based PDF processing
│   └── migrations/       # Database migrations
└── public/               # Static assets
```

## Key Features
1. Upload PDF and edge design images
2. Process PDFs with gilded edges (side-only or all-edges)
3. Support for different page types and thicknesses
4. Bleed management for print specifications
5. Real-time processing status updates

## Local Development Setup

### Prerequisites
- Node.js 18+
- Docker Desktop
- Supabase CLI

### Environment Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-local-anon-key>
```

### Running Locally
```bash
# Start Supabase locally
npx supabase start

# Start Next.js development server
npm run dev
```

### Local URLs
- Next.js App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Supabase API: http://localhost:54321

## Supabase Edge Functions

### process-pdf
Processes PDFs with edge designs from Supabase Storage.
- Input: PDF and edge image storage paths
- Output: Processed PDF with gilded edges

### process-pdf-urls
Processes PDFs from external URLs.
- Input: PDF and edge image URLs
- Output: Processed PDF with gilded edges

## Database Schema

### Tables
- `pdf_jobs`: Tracks PDF processing jobs
  - id, status, input_pdf_url, edge_image_url, output_pdf_url, created_at, updated_at, error

### Storage Buckets
- `pdfs`: Stores uploaded and processed PDF files
- `edges`: Stores edge design images

## Testing & Deployment

### Local Testing
1. Upload test PDFs and edge images via the web interface
2. Monitor processing in Supabase Studio
3. Check logs: `npx supabase functions logs process-pdf`

### Deployment
- Frontend: Deploy to Vercel
- Backend: Supabase project (already configured)

## Important Notes
- NO Python service - all PDF processing uses Supabase Edge Functions
- Edge Functions have 50MB response limit
- Large PDFs are handled via Storage URLs
- All processing happens server-side for security

## Common Commands
```bash
# View Edge Function logs
npx supabase functions logs process-pdf --limit 10

# Reset local database
npx supabase db reset

# Deploy Edge Functions (production)
npx supabase functions deploy process-pdf
```