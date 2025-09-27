const { createClient } = require('@supabase/supabase-js')

// Production credentials
const supabaseUrl = 'https://gsndpkiedjojlqpjdwgu.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbmRwa2llZGpvamxxcGpkd2d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNjc1MzE5NSwiZXhwIjoyMDQyMzI5MTk1fQ.xYiWH7fgaWnlOp8oLGSOwRwC6h5jU4yHOOKJ3bfEfh4'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugApiRoutes() {
  console.log('🔍 Debugging API routes and design storage...')

  const problemDesignId = '672305fa-b081-46ed-b40d-83352061effb'

  // Check if this design exists in database
  console.log(`\n1. Checking if design ${problemDesignId} exists in database...`)

  try {
    const { data: design, error } = await supabase
      .from('edge_designs')
      .select('*')
      .eq('id', problemDesignId)
      .maybeSingle()

    if (error) {
      console.error('❌ Database query error:', error)
      return
    }

    if (!design) {
      console.log('❌ Design not found in database')

      // Check what designs DO exist
      console.log('\n2. Checking what designs exist in database...')
      const { data: recentDesigns, error: recentError } = await supabase
        .from('edge_designs')
        .select('id, name, created_at, user_id, side_image_path, is_active')
        .order('created_at', { ascending: false })
        .limit(5)

      if (recentError) {
        console.error('❌ Error fetching recent designs:', recentError)
      } else {
        console.log('Recent designs:')
        recentDesigns.forEach(d => {
          console.log(`  ${d.id} - ${d.name} - Active: ${d.is_active}`)
          console.log(`    Image path: ${d.side_image_path}`)
        })
      }
      return
    }

    console.log('✅ Design found in database:')
    console.log({
      id: design.id,
      name: design.name,
      user_id: design.user_id,
      is_active: design.is_active,
      side_image_path: design.side_image_path,
      top_image_path: design.top_image_path,
      bottom_image_path: design.bottom_image_path
    })

    // Check if the image files exist in storage
    console.log('\n3. Checking if image files exist in storage...')

    if (design.side_image_path) {
      console.log(`Checking side image: ${design.side_image_path}`)
      const { data: sideImageData, error: sideError } = await supabase.storage
        .from('edge-images')
        .list(design.side_image_path.split('/').slice(0, -1).join('/'))

      if (sideError) {
        console.error('❌ Error checking side image storage:', sideError)
      } else {
        console.log('✅ Side image storage folder exists')
        console.log('Files in folder:', sideImageData?.map(f => f.name))
      }
    }

  } catch (err) {
    console.error('❌ Debug script error:', err)
  }
}

async function checkStorageStructure() {
  console.log('\n4. Checking storage bucket structure...')

  try {
    // List top level folders in edge-images bucket
    const { data: topLevel, error: topError } = await supabase.storage
      .from('edge-images')
      .list('', { limit: 10 })

    if (topError) {
      console.error('❌ Error listing storage:', topError)
    } else {
      console.log('Top level folders in edge-images:')
      topLevel?.forEach(item => {
        console.log(`  ${item.name} (${item.metadata?.size || 'folder'})`)
      })

      // If there's a 'users' folder, check what's inside
      if (topLevel?.some(item => item.name === 'users')) {
        console.log('\n5. Checking users folder structure...')
        const { data: usersFolder, error: usersError } = await supabase.storage
          .from('edge-images')
          .list('users', { limit: 5 })

        if (usersError) {
          console.error('❌ Error listing users folder:', usersError)
        } else {
          console.log('User folders:')
          usersFolder?.forEach(item => {
            console.log(`  users/${item.name}`)
          })
        }
      }
    }
  } catch (err) {
    console.error('❌ Storage check error:', err)
  }
}

async function main() {
  await debugApiRoutes()
  await checkStorageStructure()
  console.log('\n✅ Debug complete!')
}

if (require.main === module) {
  main().catch(console.error)
}