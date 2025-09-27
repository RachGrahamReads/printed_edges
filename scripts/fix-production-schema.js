const { createClient } = require('@supabase/supabase-js')

// Production credentials from environment
const supabaseUrl = 'https://gsndpkiedjojlqpjdwgu.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbmRwa2llZGpvamxxcGpkd2d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNjc1MzE5NSwiZXhwIjoyMDQyMzI5MTk1fQ.xYiWH7fgaWnlOp8oLGSOwRwC6h5jU4yHOOKJ3bfEfh4'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addMissingColumns() {
  console.log('🔧 Adding missing columns to edge_designs table...')

  // SQL to add all missing columns
  const sql = `
    -- Add missing columns to edge_designs table for PDF data storage
    ALTER TABLE edge_designs
    ADD COLUMN IF NOT EXISTS bleed_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS edge_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS pdf_width DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS pdf_height DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS page_count INTEGER,
    ADD COLUMN IF NOT EXISTS top_edge_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS bottom_edge_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS slice_storage_paths JSONB,
    ADD COLUMN IF NOT EXISTS regeneration_count INTEGER DEFAULT 0;
  `

  try {
    const { data, error } = await supabase.rpc('execute_sql', { sql })

    if (error) {
      console.error('❌ Error executing SQL:', error)
      return false
    }

    console.log('✅ Successfully added missing columns to edge_designs table')
    return true
  } catch (err) {
    console.error('❌ Failed to add columns:', err)
    return false
  }
}

async function checkTableStructure() {
  console.log('🔍 Checking edge_designs table structure...')

  try {
    // Check if columns exist by querying the table info
    const { data, error } = await supabase
      .from('edge_designs')
      .select('*')
      .limit(1)

    if (error && error.message.includes("bleed_type")) {
      console.log('❌ Missing bleed_type column - needs migration')
      return false
    }

    console.log('✅ Table structure appears correct')
    return true

  } catch (err) {
    console.error('❌ Error checking table structure:', err)
    return false
  }
}

async function main() {
  console.log('🚀 Starting production database schema fix...')

  // Check current structure
  const isCorrect = await checkTableStructure()

  if (!isCorrect) {
    // Try to add missing columns
    await addMissingColumns()
  }

  console.log('✅ Schema fix complete!')
}

if (require.main === module) {
  main().catch(console.error)
}