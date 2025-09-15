# Deployment Instructions for Printed Edges

## Overview
This application uses:
- **Supabase** for backend (authentication, database, and edge functions)
- **Vercel** for frontend hosting
- **Python service backup** (optional, for local development)

## Prerequisites
1. Supabase account and project
2. Vercel account
3. Node.js 18+ installed locally

## Supabase Setup

### 1. Create Supabase Project
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project
3. Note your project URL and anon key from Settings > API

### 2. Deploy Edge Function
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the edge function
supabase functions deploy process-pdf
```

### 3. Configure Environment Variables
Create `.env.local` with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Vercel Deployment

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy to Vercel
```bash
# From project root
vercel

# Follow prompts to:
# - Link to existing project or create new
# - Configure environment variables
# - Deploy
```

### 3. Add Environment Variables in Vercel
1. Go to your Vercel project dashboard
2. Settings > Environment Variables
3. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Project Structure

```
printed-edges/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Main application page
│   └── api/               # API routes (backup)
├── supabase/
│   └── functions/
│       └── process-pdf/   # Edge function for PDF processing
│           └── index.ts   # TypeScript edge function
├── lib/
│   └── supabase.ts        # Supabase client configuration
└── python-service/        # Backup Python service
    └── app_backup_*.py    # Original Python implementation
```

## How It Works

1. **Frontend (Vercel)**:
   - User uploads PDF and edge images
   - Sends to Supabase Edge Function for processing
   - Downloads processed PDF

2. **Backend (Supabase Edge Function)**:
   - Receives PDF and edge images
   - Processes using TypeScript/Deno
   - Returns processed PDF with bleed and edges

3. **Fallback (Python Service)**:
   - If Supabase is not configured, falls back to local API
   - Uses `/api/process-preview` endpoint

## Testing

### Local Development
```bash
# Start Next.js dev server
npm run dev

# Test Supabase function locally (optional)
supabase functions serve process-pdf
```

### Production Testing
1. Upload a PDF file
2. Upload edge images (side, top, bottom as needed)
3. Select edge type (side-only or all-edges)
4. Click "Process PDF"
5. Download the processed file

## Troubleshooting

### Supabase Function Not Working
- Check CORS settings in edge function
- Verify environment variables are set
- Check Supabase function logs: `supabase functions logs process-pdf`

### PDF Processing Issues
- Ensure PDF is valid and not corrupted
- Check image formats (PNG/JPG supported)
- Verify bleed settings match your print requirements

### Deployment Issues
- Clear Vercel cache: `vercel --force`
- Rebuild Supabase function: `supabase functions deploy process-pdf --no-verify-jwt`

## Support
For issues or questions:
1. Check Supabase logs
2. Review Vercel function logs
3. Test with the Python backup service locally