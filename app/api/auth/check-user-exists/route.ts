import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Use service role client to check auth.users table
    const supabase = createServiceRoleClient();

    // First check in auth.users table (this is the primary source of truth)
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error checking auth users:', authError);
      return NextResponse.json(
        { error: 'Failed to check user existence' },
        { status: 500 }
      );
    }

    // Check if user exists in auth.users
    const userExists = authUsers.users.some(user =>
      user.email?.toLowerCase() === email.toLowerCase() &&
      user.email_confirmed_at // Only count confirmed users
    );

    if (userExists) {
      return NextResponse.json({ exists: true });
    }

    // Also check public.users as a fallback (in case of sync issues)
    const { data: publicUser, error: publicError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (publicError && publicError.code !== 'PGRST116') {
      console.error('Error checking public users:', publicError);
      // Don't fail the request, just use auth.users result
    }

    // User exists if found in either table
    const exists = userExists || !!publicUser;

    return NextResponse.json({ exists });

  } catch (error) {
    console.error('Check user exists API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}