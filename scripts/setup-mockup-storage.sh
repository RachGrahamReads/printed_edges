#!/bin/bash

# Script to set up mockup storage buckets and upload template
# Run this after starting local Supabase

echo "Setting up mockup storage..."

# Get local Supabase anon key
ANON_KEY=$(grep SUPABASE_ANON_KEY .env.local | cut -d '=' -f2)
SUPABASE_URL="http://127.0.0.1:54321"

echo "Creating storage buckets..."

# Create mockup-uploads bucket
curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "mockup-uploads",
    "name": "mockup-uploads",
    "public": true,
    "file_size_limit": 10485760,
    "allowed_mime_types": ["image/png", "image/jpeg", "image/jpg", "image/webp"]
  }'

# Create mockup-outputs bucket
curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "mockup-outputs",
    "name": "mockup-outputs",
    "public": true,
    "file_size_limit": 10485760,
    "allowed_mime_types": ["image/png"]
  }'

# Create mockup-templates bucket
curl -X POST "$SUPABASE_URL/storage/v1/bucket" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "mockup-templates",
    "name": "mockup-templates",
    "public": true,
    "file_size_limit": 10485760,
    "allowed_mime_types": ["image/png"]
  }'

echo "Uploading template..."

# Upload template image
curl -X POST "$SUPABASE_URL/storage/v1/object/mockup-templates/book-mockup-template.png" \
  -H "Authorization: Bearer $ANON_KEY" \
  -F "file=@public/book-mockup-template.png"

echo "Setup complete!"
