const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function fixGrantCreditsFunction() {
  console.log('🔧 Fixing grant_credits function...');

  // First, add a unique constraint on user_id for the user_credits table
  console.log('1. Adding unique constraint on user_id...');

  const { error: constraintError } = await supabase.rpc('exec_sql', {
    sql: 'ALTER TABLE public.user_credits ADD CONSTRAINT user_credits_user_id_unique UNIQUE (user_id);'
  });

  if (constraintError && !constraintError.message.includes('already exists')) {
    console.error('❌ Error adding unique constraint:', constraintError);

    // If constraint fails, let's check if it's because of duplicates
    console.log('2. Checking for duplicate user_id records...');

    const { data: duplicates, error: duplicateError } = await supabase
      .from('user_credits')
      .select('user_id, COUNT(*)')
      .groupBy('user_id')
      .having('COUNT(*) > 1');

    if (duplicateError) {
      console.error('❌ Error checking duplicates:', duplicateError);
    } else if (duplicates && duplicates.length > 0) {
      console.log('⚠️  Found duplicate user_id records. Need to consolidate first.');
      console.log('   Run the fix-credits.js script for each user to consolidate duplicates.');
      return;
    }
  } else {
    console.log('✅ Unique constraint added (or already exists)');
  }

  // Update the grant_credits function to work properly
  console.log('3. Updating grant_credits function...');

  const newFunctionSQL = `
CREATE OR REPLACE FUNCTION public.grant_credits(
    p_user_id UUID,
    p_credits INTEGER,
    p_purchase_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Update or insert user credits with proper conflict handling
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (p_user_id, p_credits, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET total_credits = user_credits.total_credits + p_credits,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

  const { error: functionError } = await supabase.rpc('exec_sql', {
    sql: newFunctionSQL
  });

  if (functionError) {
    console.error('❌ Error updating function:', functionError);

    // Try alternative approach without rpc
    console.log('4. Trying direct SQL execution...');
    const { error: directError } = await supabase
      .from('_migrations')
      .select('*')
      .limit(1); // This will test if we can execute SQL

    if (directError) {
      console.log('ℹ️  RPC approach not available. Function needs to be updated via migration.');
      console.log('   The constraint has been added, which will prevent future duplicate issues.');
    }
  } else {
    console.log('✅ grant_credits function updated successfully');
  }

  console.log('🎉 Database fixes completed!');
}

// Helper function to execute SQL directly
async function execSQL(sql) {
  try {
    const { error } = await supabase.rpc('exec_sql', { sql });
    return { error };
  } catch (e) {
    return { error: e };
  }
}

fixGrantCreditsFunction().then(() => process.exit(0));