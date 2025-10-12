# Book Mockup Generator - Setup Guide

## Overview
The book mockup generator creates realistic 3D book mockups from cover images using server-side perspective warping in a Supabase Edge Function.

## Architecture
- **Frontend**: [/app/mockup/page.tsx](/app/mockup/page.tsx) - User uploads cover image
- **Edge Function**: [/supabase/functions/generate-book-mockup/index.ts](/supabase/functions/generate-book-mockup/index.ts) - Processes mockup with perspective warping
- **Template**: [/public/book-mockup-template.png](/public/book-mockup-template.png) - 3D book template with red cover area

## How It Works
1. User uploads a cover image on `/mockup` page
2. Cover is uploaded to `mockup-uploads` storage bucket
3. Edge Function is called with the cover path
4. Function downloads:
   - Cover image from storage
   - Template image (from storage or fallback URLs)
5. Function detects red pixels (R>200, G<50, B<50) in template to find cover area
6. Function applies perspective warping to map cover onto red area
7. Final mockup is returned as PNG (either stored in `mockup-outputs` or returned directly)

## Production Setup

### 1. Deploy Edge Function
```bash
SUPABASE_ACCESS_TOKEN=your_token npx supabase functions deploy generate-book-mockup
```

### 2. Create Storage Buckets
In Supabase Dashboard → Storage, create these **public** buckets:

- `mockup-uploads` - For user-uploaded covers
  - Public: Yes
  - File size limit: 10MB
  - Allowed MIME types: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`

- `mockup-outputs` - For generated mockups
  - Public: Yes
  - File size limit: 10MB
  - Allowed MIME types: `image/png`

- `mockup-templates` - For template images
  - Public: Yes
  - File size limit: 10MB
  - Allowed MIME types: `image/png`

### 3. Upload Template
Upload [/public/book-mockup-template.png](/public/book-mockup-template.png) to the `mockup-templates` bucket with filename `book-mockup-template.png`.

Alternatively, the function will fallback to fetching from your production URL (https://printededges.com/book-mockup-template.png).

### 4. Apply Database Migration
The migration [/supabase/migrations/20250948_setup_mockup_storage.sql](/supabase/migrations/20250948_setup_mockup_storage.sql) will create storage policies.

Apply it:
```bash
SUPABASE_ACCESS_TOKEN=your_token npx supabase db push
```

### 5. Test
Visit `/mockup` on your production site and upload a cover image to test the generator.

## Local Development

### Prerequisites
- Supabase running locally (`npx supabase start`)
- Next.js dev server running (`npm run dev`)

### Setup
1. Create storage buckets manually:
```sql
INSERT INTO storage.buckets (id, name, created_at, updated_at)
VALUES
  ('mockup-uploads', 'mockup-uploads', NOW(), NOW()),
  ('mockup-outputs', 'mockup-outputs', NOW(), NOW()),
  ('mockup-templates', 'mockup-templates', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

2. The Edge Function will automatically fetch the template from your local Next.js dev server (http://localhost:3005/book-mockup-template.png) as a fallback.

3. Visit http://localhost:3005/mockup to test.

## Template Format
The template image must have a bright red area (R>200, G<50, B<50) marking where the cover should be placed. The function automatically detects this area and applies perspective warping.

To create a new template:
1. Create a 3D book mockup image
2. Mark the cover area with pure red (#FF0000)
3. Save as PNG
4. Upload to `mockup-templates` bucket

## Troubleshooting

### "Failed to download cover"
- Check that `mockup-uploads` bucket exists and is public
- Verify storage policies allow public uploads

### "Failed to fetch template"
- Ensure template is uploaded to `mockup-templates` bucket
- Check that template filename is exactly `book-mockup-template.png`
- For local dev: verify Next.js is running and template is in `/public` folder

### "Mockup generation failed"
- Check Edge Function logs: `npx supabase functions logs generate-book-mockup`
- Verify template has red pixels for cover detection
- Ensure cover image is valid PNG/JPEG

## API Reference

### Edge Function Request
```typescript
{
  coverImagePath: string;    // Path in mockup-uploads bucket
  outputPath?: string;        // Optional: where to store output in mockup-outputs
}
```

### Edge Function Response
```typescript
{
  success: boolean;
  mockupUrl?: string;         // URL if outputPath provided
  error?: string;             // Error message if failed
}
```

Or returns PNG image directly if no `outputPath` specified.
