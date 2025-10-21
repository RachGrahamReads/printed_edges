import { createClient } from '@supabase/supabase-js';

let serviceRoleClient: ReturnType<typeof createClient> | null = null;

export function createServiceRoleClient() {
  if (serviceRoleClient) {
    return serviceRoleClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Missing Supabase environment variables for service role client');
  }

  serviceRoleClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return serviceRoleClient;
}