const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function fixCredits() {
  const email = process.argv[2] || 'rachgrahamreads@gmail.com';
  const creditsToGrant = parseInt(process.argv[3]) || 1;

  console.log('🔧 Fixing credits for:', email);
  console.log('💳 Credits to grant:', creditsToGrant);
  console.log('=' .repeat(50));

  // Get user ID
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (userError || !userData) {
    console.error('❌ Error finding user:', userError);
    return;
  }

  console.log('✓ Found user ID:', userData.id);

  // Get ALL credit records for this user
  const { data: allCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userData.id)
    .order('created_at', { ascending: true });

  if (creditsError) {
    console.error('❌ Error fetching credits:', creditsError);
    return;
  }

  console.log('📊 Found', allCredits.length, 'credit records:');
  allCredits.forEach((record, index) => {
    console.log(`   ${index + 1}. ID: ${record.id}`);
    console.log(`      Total: ${record.total_credits}, Used: ${record.used_credits}`);
    console.log(`      Created: ${record.created_at}`);
    console.log(`      Updated: ${record.updated_at}`);
    console.log();
  });

  if (allCredits.length === 0) {
    console.log('❌ No credit records found. Creating new one...');

    const { data: newRecord, error: insertError } = await supabase
      .from('user_credits')
      .insert({
        user_id: userData.id,
        total_credits: creditsToGrant,
        used_credits: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating credit record:', insertError);
      return;
    }

    console.log('✅ Created new credit record:', newRecord);
    console.log('🎉 User now has', creditsToGrant, 'available credits!');
    return;
  }

  if (allCredits.length > 1) {
    console.log('⚠️  Multiple credit records found. Consolidating...');

    // Calculate total credits from all records
    const totalCredits = allCredits.reduce((sum, record) => sum + record.total_credits, 0);
    const totalUsed = allCredits.reduce((sum, record) => sum + record.used_credits, 0);

    console.log(`   Consolidated total: ${totalCredits}`);
    console.log(`   Consolidated used: ${totalUsed}`);

    // Keep the first record and delete the others
    const keepRecord = allCredits[0];
    const deleteRecords = allCredits.slice(1);

    // Delete duplicate records
    for (const record of deleteRecords) {
      const { error: deleteError } = await supabase
        .from('user_credits')
        .delete()
        .eq('id', record.id);

      if (deleteError) {
        console.error(`❌ Error deleting duplicate record ${record.id}:`, deleteError);
      } else {
        console.log(`   ✓ Deleted duplicate record ${record.id}`);
      }
    }

    // Update the kept record with consolidated values plus new credits
    const { data: updateData, error: updateError } = await supabase
      .from('user_credits')
      .update({
        total_credits: totalCredits + creditsToGrant,
        used_credits: totalUsed,
        updated_at: new Date().toISOString()
      })
      .eq('id', keepRecord.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating consolidated record:', updateError);
      return;
    }

    console.log('✅ Updated consolidated record:', updateData);
    console.log('🎉 User now has', (updateData.total_credits - updateData.used_credits), 'available credits!');
  } else {
    // Single record - just update it
    const record = allCredits[0];
    const newTotal = record.total_credits + creditsToGrant;

    const { data: updateData, error: updateError } = await supabase
      .from('user_credits')
      .update({
        total_credits: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('id', record.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating credits:', updateError);
      return;
    }

    console.log('✅ Updated credit record:', updateData);
    console.log('🎉 User now has', (updateData.total_credits - updateData.used_credits), 'available credits!');
  }
}

fixCredits().then(() => process.exit(0));