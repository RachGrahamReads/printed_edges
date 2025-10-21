// Script to set up Supabase storage buckets
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://gsndpkiedjojlqpjdwgu.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node setup-storage.js')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupStorage() {
  console.log('Setting up Supabase storage buckets...')

  // Create buckets
  const buckets = [
    { id: 'pdfs', name: 'pdfs', public: true },
    { id: 'edge-images', name: 'edge-images', public: true },
    { id: 'processed-pdfs', name: 'processed-pdfs', public: true }
  ]

  for (const bucket of buckets) {
    try {
      const { data, error } = await supabase.storage.createBucket(bucket.id, {
        public: bucket.public,
        fileSizeLimit: 5368709120, // 5GB
      })

      if (error && error.message.includes('already exists')) {
        console.log(`✓ Bucket '${bucket.id}' already exists`)
      } else if (error) {
        console.error(`✗ Failed to create bucket '${bucket.id}':`, error.message)
      } else {
        console.log(`✓ Created bucket '${bucket.id}'`)
      }
    } catch (err) {
      console.error(`✗ Error with bucket '${bucket.id}':`, err.message)
    }
  }

  console.log('Storage setup complete!')
}

setupStorage().catch(console.error)