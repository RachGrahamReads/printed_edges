const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function checkUsers() {
  console.log('Checking users in local Supabase...\n');

  // Check auth.users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('Error fetching auth users:', authError);
  } else {
    console.log(`Found ${authUsers.users.length} users in auth.users:`);
    authUsers.users.forEach(user => {
      console.log(`  - ${user.email} (ID: ${user.id}, Created: ${user.created_at})`);
    });
  }

  console.log('\n---');

  // Check public.users table
  const { data: publicUsers, error: publicError } = await supabase
    .from('users')
    .select('*');

  if (publicError) {
    console.error('Error fetching public users:', publicError);
  } else {
    console.log(`Found ${publicUsers?.length || 0} users in public.users:`);
    publicUsers?.forEach(user => {
      console.log(`  - ${user.email} (ID: ${user.id}, Admin: ${user.is_admin})`);
    });
  }

  console.log('\n---');

  // Check user_credits
  const { data: credits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*');

  if (creditsError) {
    console.error('Error fetching user credits:', creditsError);
  } else {
    console.log(`Found ${credits?.length || 0} credit records:`);
    credits?.forEach(credit => {
      console.log(`  - User ${credit.user_id}: ${credit.total_credits} total, ${credit.used_credits} used`);
    });
  }
}

checkUsers().then(() => process.exit(0));