import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// POST: Check if email is already registered
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Normalize email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Use service role client to check auth.users
    const serviceSupabase = createServiceRoleClient();

    // Check if email exists in auth.users
    const { data: authUser, error: authError } = await serviceSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1
    });

    if (authError) {
      console.error('Error checking auth users:', authError);
      return NextResponse.json(
        { error: 'Failed to check email availability' },
        { status: 500 }
      );
    }

    // Search through auth users for matching email
    const existingUser = authUser.users.find(user =>
      user.email?.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      return NextResponse.json({
        exists: true,
        message: 'An account with this email address already exists.',
        suggestion: 'If you forgot your password, please use the "Forgot Password" option.'
      });
    }

    return NextResponse.json({
      exists: false,
      message: 'Email is available for registration.'
    });

  } catch (error) {
    console.error('Email check API error:', error);
    return NextResponse.json(
      { error: 'Failed to check email availability' },
      { status: 500 }
    );
  }
}