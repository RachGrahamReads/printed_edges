# Supabase Setup Instructions

## 1. Create Storage Bucket

If the application fails to create the storage bucket automatically, you can create it manually:

1. Go to your Supabase Dashboard
2. Navigate to **Storage** > **Buckets**
3. Click **Create bucket**
4. Name it: `user-uploads`
5. Set it to **Private** (not public)
6. Click **Create**

## 2. Configure Bucket Policies (Optional)

For better security, you can add RLS policies:

1. Go to **Storage** > **Policies**
2. Add policy for `user-uploads` bucket:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Users can upload files" ON storage.objects
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow users to read their own files
CREATE POLICY "Users can read own files" ON storage.objects
FOR SELECT USING (auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (auth.uid()::text = (storage.foldername(name))[1]);
```

## 3. Environment Variables

Make sure your `.env.local` has:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
PYTHON_SERVICE_URL=http://localhost:5001
```

## 4. Test the Setup

1. Start the Next.js app: `npm run dev`
2. Start the Python service: `cd python-service && ./start.sh`
3. Visit: `http://localhost:3000/test-upload`
4. Sign up/login and try uploading files

## Troubleshooting

- **Bucket creation fails**: Create the bucket manually in Supabase Dashboard
- **Upload fails**: Check bucket policies and make sure user is authenticated
- **Processing fails**: Make sure Python service is running on port 5001