const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function grantCredits() {
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
  const { data: beforeCredits } = await supabase
    .from('user_credits')
    .select('total_credits, used_credits')
    .eq('user_id', userData.id)
    .single();

  console.log('📊 Credits before:');
  console.log(`   Total: ${beforeCredits?.total_credits || 0}`);
  console.log(`   Used: ${beforeCredits?.used_credits || 0}`);
  console.log(`   Available: ${(beforeCredits?.total_credits || 0) - (beforeCredits?.used_credits || 0)}`);

  // Grant credits using the existing function
  const { error: grantError } = await supabase.rpc('grant_credits', {
    p_user_id: userData.id,
    p_credits: creditsToGrant,
    p_purchase_id: null
  });

  if (grantError) {
    console.error('❌ Error granting credits:', grantError);
    return;
  }

  console.log('✅ Credits granted successfully!');

  // Check credits after
  const { data: afterCredits } = await supabase
    .from('user_credits')
    .select('total_credits, used_credits')
    .eq('user_id', userData.id)
    .single();

  console.log('📊 Credits after:');
  console.log(`   Total: ${afterCredits?.total_credits || 0}`);
  console.log(`   Used: ${afterCredits?.used_credits || 0}`);
  console.log(`   Available: ${(afterCredits?.total_credits || 0) - (afterCredits?.used_credits || 0)}`);

  console.log('🎉 Credits successfully granted! User can now see them in the dashboard.');
}

grantCredits().then(() => process.exit(0));