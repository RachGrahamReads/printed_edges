const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function grantCreditsDebug() {
  const email = process.argv[2] || 'rachgrahamreads@gmail.com';
  const creditsToGrant = parseInt(process.argv[3]) || 1;

  console.log('💳 Granting credits to:', email);
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

  // Check current credits before
  const { data: beforeCredits, error: beforeError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userData.id)
    .single();

  if (beforeError) {
    console.error('❌ Error fetching before credits:', beforeError);
    return;
  }

  console.log('📊 Full credits record before:');
  console.log(beforeCredits);

  // Update the credits directly with detailed response
  const newTotalCredits = (beforeCredits?.total_credits || 0) + creditsToGrant;

  console.log('🔧 Attempting to update total_credits from', beforeCredits?.total_credits, 'to', newTotalCredits);

  const { data: updateData, error: updateError } = await supabase
    .from('user_credits')
    .update({
      total_credits: newTotalCredits,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userData.id)
    .select();

  if (updateError) {
    console.error('❌ Error updating credits:', updateError);
    return;
  }

  console.log('✅ Update response:', updateData);

  // Check credits after
  const { data: afterCredits, error: afterError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userData.id)
    .single();

  if (afterError) {
    console.error('❌ Error fetching after credits:', afterError);
    return;
  }

  console.log('📊 Full credits record after:');
  console.log(afterCredits);

  const available = (afterCredits?.total_credits || 0) - (afterCredits?.used_credits || 0);
  if (available > 0) {
    console.log('🎉 Credits successfully granted! User now has', available, 'available credits.');
  } else {
    console.log('❌ Something went wrong - credits are still 0');
  }
}

grantCreditsDebug().then(() => process.exit(0));