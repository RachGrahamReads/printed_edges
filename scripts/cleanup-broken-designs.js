#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js')

// Use production credentials
const supabaseUrl = process.env.SUPABASE_URL || 'https://gsndpkiedjojlqpjdwgu.supabase.co'
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseSecretKey) {
  console.error('❌ SUPABASE_SECRET_KEY environment variable is required')
  console.error('Usage: SUPABASE_SECRET_KEY=your_key node scripts/cleanup-broken-designs.js')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)

async function findBrokenDesigns() {
  console.log('🔍 Finding edge designs with missing storage files...')

  // Get all edge designs
  const { data: designs, error } = await supabase
    .from('edge_designs')
    .select('id, name, user_id, side_image_path, top_image_path, bottom_image_path, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching designs:', error)
    throw error
  }

  console.log(`Found ${designs.length} total designs`)

  const brokenDesigns = []

  // Check each design's storage files
  for (const design of designs) {
    const missingFiles = []

    // Check side image
    if (design.side_image_path) {
      const { error: sideError } = await supabase.storage
        .from('edge-images')
        .createSignedUrl(design.side_image_path, 60)

      if (sideError && sideError.message?.includes('not found')) {
        missingFiles.push('side')
      }
    }

    // Check top image
    if (design.top_image_path) {
      const { error: topError } = await supabase.storage
        .from('edge-images')
        .createSignedUrl(design.top_image_path, 60)

      if (topError && topError.message?.includes('not found')) {
        missingFiles.push('top')
      }
    }

    // Check bottom image
    if (design.bottom_image_path) {
      const { error: bottomError } = await supabase.storage
        .from('edge-images')
        .createSignedUrl(design.bottom_image_path, 60)

      if (bottomError && bottomError.message?.includes('not found')) {
        missingFiles.push('bottom')
      }
    }

    if (missingFiles.length > 0) {
      brokenDesigns.push({
        ...design,
        missingFiles
      })
    }
  }

  return brokenDesigns
}

async function deleteBrokenDesigns(brokenDesigns) {
  console.log(`\n🗑️  Deleting ${brokenDesigns.length} broken designs...`)

  let deleted = 0
  let failed = 0

  for (const design of brokenDesigns) {
    console.log(`Deleting: ${design.name} (ID: ${design.id}) - Missing: ${design.missingFiles.join(', ')}`)

    const { error } = await supabase
      .from('edge_designs')
      .delete()
      .eq('id', design.id)

    if (error) {
      console.error(`  ❌ Failed to delete:`, error.message)
      failed++
    } else {
      console.log(`  ✅ Deleted`)
      deleted++
    }
  }

  console.log(`\n✅ Cleanup complete!`)
  console.log(`   Deleted: ${deleted}`)
  console.log(`   Failed: ${failed}`)
}

async function main() {
  console.log('🧹 Starting broken design cleanup...\n')

  const brokenDesigns = await findBrokenDesigns()

  if (brokenDesigns.length === 0) {
    console.log('✅ No broken designs found! All designs have valid storage files.')
    return
  }

  console.log(`\n⚠️  Found ${brokenDesigns.length} designs with missing storage files:`)
  brokenDesigns.forEach(d => {
    console.log(`  - ${d.name} (${new Date(d.created_at).toLocaleDateString()}) - Missing: ${d.missingFiles.join(', ')}`)
  })

  console.log(`\nThese designs will be deleted from the database.\n`)

  // Prompt for confirmation (if running interactively)
  if (process.stdin.isTTY) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const answer = await new Promise(resolve => {
      readline.question('Continue? (yes/no): ', resolve)
    })
    readline.close()

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('❌ Cancelled')
      return
    }
  }

  await deleteBrokenDesigns(brokenDesigns)
}

if (require.main === module) {
  main().catch(console.error)
}
