// Debug script to check if design exists in database
// Run this with: node debug-design.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_KEY';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDesign() {
  const designId = 'fb1ae0bf-9dad-482a-88c1-566c0e349ace';

  console.log('Checking design:', designId);

  // Check if design exists at all
  const { data: design, error } = await supabase
    .from('edge_designs')
    .select('*')
    .eq('id', designId)
    .single();

  if (error) {
    console.error('Error:', error);
  } else if (design) {
    console.log('Design found:', {
      id: design.id,
      name: design.name,
      user_id: design.user_id,
      is_active: design.is_active,
      created_at: design.created_at
    });
  } else {
    console.log('Design not found in database');
  }

  // Also check all designs for this user (if you know the user ID)
  console.log('\nChecking all designs...');
  const { data: allDesigns, error: allError } = await supabase
    .from('edge_designs')
    .select('id, name, user_id, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (allError) {
    console.error('Error fetching all designs:', allError);
  } else {
    console.log('Recent designs:', allDesigns);
  }
}

checkDesign().catch(console.error);