const { createClient } = require('@supabase/supabase-js')

// Production credentials
const supabaseUrl = 'https://gsndpkiedjojlqpjdwgu.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbmRwa2llZGpvamxxcGpkd2d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNjc1MzE5NSwiZXhwIjoyMDQyMzI5MTk1fQ.xYiWH7fgaWnlOp8oLGSOwRwC6h5jU4yHOOKJ3bfEfh4'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugSpecificDesign() {
  const designId = 'fb1ae0bf-9dad-482a-88c1-566c0e349ace'

  console.log(`🔍 Debugging design ID: ${designId}`)

  // Check if design exists at all (without any filters)
  console.log('\n1. Checking if design exists in database...')
  const { data: designExists, error: existsError } = await supabase
    .from('edge_designs')
    .select('id, user_id, is_active, created_at')
    .eq('id', designId)
    .maybeSingle()

  if (existsError) {
    console.error('❌ Error checking design existence:', existsError)
    return
  }

  if (!designExists) {
    console.log('❌ Design does not exist in database')

    // Check recent designs to see what IDs we have
    console.log('\n2. Checking recent designs in database...')
    const { data: recentDesigns, error: recentError } = await supabase
      .from('edge_designs')
      .select('id, created_at, user_id, is_active')
      .order('created_at', { ascending: false })
      .limit(10)

    if (recentError) {
      console.error('❌ Error fetching recent designs:', recentError)
    } else {
      console.log('Recent designs:')
      recentDesigns.forEach(design => {
        console.log(`  ${design.id} - ${design.created_at} - User: ${design.user_id} - Active: ${design.is_active}`)
      })
    }
    return
  }

  console.log('✅ Design exists:', {
    id: designExists.id,
    user_id: designExists.user_id,
    is_active: designExists.is_active,
    created_at: designExists.created_at
  })

  // Check full design data
  console.log('\n3. Fetching full design data...')
  const { data: fullDesign, error: fullError } = await supabase
    .from('edge_designs')
    .select('*')
    .eq('id', designId)
    .single()

  if (fullError) {
    console.error('❌ Error fetching full design:', fullError)
    return
  }

  console.log('✅ Full design data:')
  console.log('Design columns available:', Object.keys(fullDesign))
  console.log('Has new columns:', {
    bleed_type: fullDesign.bleed_type !== undefined,
    edge_type: fullDesign.edge_type !== undefined,
    pdf_width: fullDesign.pdf_width !== undefined,
    pdf_height: fullDesign.pdf_height !== undefined,
    page_count: fullDesign.page_count !== undefined,
    slice_storage_paths: fullDesign.slice_storage_paths !== undefined
  })

  // Check if this design has the required columns
  if (!fullDesign.bleed_type) {
    console.log('⚠️  This design was created before the schema update and lacks required columns')
    console.log('   This is why it might not work with the regenerate page')
  }
}

async function checkDatabaseSchema() {
  console.log('\n4. Checking database schema...')

  // Try to query with the new columns to see if they exist
  try {
    const { data, error } = await supabase
      .from('edge_designs')
      .select('id, bleed_type, edge_type, pdf_width, pdf_height, page_count, slice_storage_paths')
      .limit(1)

    if (error) {
      console.error('❌ Schema check failed:', error)
      console.log('   This suggests the database migrations may not have been applied correctly')
    } else {
      console.log('✅ New columns are available in the database')
    }
  } catch (err) {
    console.error('❌ Schema check exception:', err)
  }
}

async function main() {
  console.log('🚀 Starting design debugging...')

  await debugSpecificDesign()
  await checkDatabaseSchema()

  console.log('\n✅ Debug complete!')
}

if (require.main === module) {
  main().catch(console.error)
}