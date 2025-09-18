#!/bin/bash
set -e

echo "🚀 Deploying Printed Edges to Production..."

echo "📦 1. Linking to Supabase production project..."
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase link --project-ref gsndpkiedjojlqpjdwgu

echo "🔧 2. Deploying Edge Functions..."
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase functions deploy process-pdf-with-slices
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase functions deploy chunk-pdf
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase functions deploy process-pdf-chunk
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase functions deploy merge-pdf-chunks

echo "☁️ 3. Creating storage buckets (if they don't exist)..."
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase storage create pdfs --public false --file-size-limit 5GB --allowed-mime-types "application/pdf" || echo "PDFs bucket already exists"
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase storage create edge-images --public false --file-size-limit 100MB --allowed-mime-types "image/png,image/jpeg" || echo "Edge images bucket already exists"
SUPABASE_ACCESS_TOKEN=sbp_7752c4b96c6f3e10bd0c82970130aed2ee8a2581 npx supabase storage create processed-pdfs --public false --file-size-limit 5GB --allowed-mime-types "application/pdf" || echo "Processed PDFs bucket already exists"

echo "🌐 4. Deploying to Vercel..."
npx vercel --prod

echo "✅ Deployment Complete!"
echo "🔗 Your app is live at: https://printed-edges.vercel.app"
echo "📊 Supabase Dashboard: https://supabase.com/dashboard/project/gsndpkiedjojlqpjdwgu"