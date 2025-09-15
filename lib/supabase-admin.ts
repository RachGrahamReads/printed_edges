import { createClient } from '@supabase/supabase-js'

// For now, let's use the anon key and create a simple upload endpoint instead
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey)