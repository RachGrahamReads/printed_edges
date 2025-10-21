#!/bin/bash

# Redeploy all Edge Functions to pick up new API keys
# This is needed after migrating to new publishable/secret key format

PROJECT_REF="gsndpkiedjojlqpjdwgu"

echo "🚀 Redeploying all Edge Functions with new API keys..."
echo ""

# List of all functions
FUNCTIONS=(
  "chunk-pdf"
  "process-pdf-chunk"
  "merge-pdf-chunks"
  "process-pdf-chunked"
  "process-pdf"
  "process-pdf-urls"
  "process-large-pdf"
  "slice-edge-images"
  "process-pdf-with-slices"
  "process-pdf-with-storage-slices"
  "generate-book-mockup"
)

# Deploy each function
for func in "${FUNCTIONS[@]}"; do
  echo "📦 Deploying $func..."
  npx supabase functions deploy "$func" --project-ref "$PROJECT_REF" --no-verify-jwt

  if [ $? -eq 0 ]; then
    echo "✅ $func deployed successfully"
  else
    echo "❌ Failed to deploy $func"
  fi
  echo ""
done

echo "🎉 All functions redeployed!"
echo ""
echo "Note: Functions now use --no-verify-jwt flag for compatibility with new key format"
