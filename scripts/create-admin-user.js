const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function createAdminUser() {
  const email = 'rachgrahamreads@gmail.com';
  const password = 'testpassword123'; // You can change this
  const name = 'Rachel Graham';

  console.log('Creating admin user:', email);

  // Create user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    return;
  }

  console.log('✓ Auth user created:', authData.user.id);

  // Create user in public.users table with admin privileges
  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      name,
      is_admin: true,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (userError) {
    console.error('Error creating public user:', userError);
    return;
  }

  console.log('✓ Public user created with admin privileges');

  // Create initial credits record
  const { error: creditsError } = await supabase
    .from('user_credits')
    .insert({
      user_id: authData.user.id,
      total_credits: 10, // Starting with 10 credits
      used_credits: 0,
    });

  if (creditsError) {
    console.error('Error creating credits:', creditsError);
  } else {
    console.log('✓ Initial credits (10) granted');
  }

  console.log('\n✅ Admin user created successfully!');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Admin Status: Yes');
  console.log('Credits: 10');
  console.log('\nYou can now login at http://localhost:3005/auth/login');
  console.log('Admin dashboard: http://localhost:3005/admin/users');
}

createAdminUser().then(() => process.exit(0));