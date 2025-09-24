import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface SignupRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

// POST: Enhanced signup with name collection and validation
export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName, fullName }: SignupRequest = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Create Supabase client
    const supabase = await createClient();

    // Prepare user metadata
    const userMetadata: Record<string, any> = {};

    if (firstName) userMetadata.firstName = firstName.trim();
    if (lastName) userMetadata.lastName = lastName.trim();
    if (fullName) userMetadata.fullName = fullName.trim();

    // Also add combined name variations for compatibility
    if (firstName || lastName) {
      userMetadata.full_name = `${firstName || ''} ${lastName || ''}`.trim();
      userMetadata.name = userMetadata.full_name;
    } else if (fullName) {
      userMetadata.name = fullName.trim();
      userMetadata.full_name = fullName.trim();
    }

    // Attempt to sign up the user
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: userMetadata
      }
    });

    if (error) {
      console.error('Signup error:', error);

      // Handle specific error cases
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return NextResponse.json({
          error: 'An account with this email address already exists.',
          suggestion: 'Try signing in instead, or use "Forgot Password" if you need to reset your password.',
          code: 'EMAIL_EXISTS'
        }, { status: 409 });
      }

      if (error.message.includes('invalid email')) {
        return NextResponse.json({
          error: 'Please enter a valid email address.',
          code: 'INVALID_EMAIL'
        }, { status: 400 });
      }

      if (error.message.includes('weak password') || error.message.includes('password')) {
        return NextResponse.json({
          error: 'Password is too weak. Please choose a stronger password.',
          code: 'WEAK_PASSWORD'
        }, { status: 400 });
      }

      // Generic error
      return NextResponse.json({
        error: error.message || 'Failed to create account',
        code: 'SIGNUP_FAILED'
      }, { status: 400 });
    }

    // Success response
    return NextResponse.json({
      success: true,
      user: data.user,
      message: data.user?.email_confirmed_at
        ? 'Account created successfully! You can now sign in.'
        : 'Account created successfully! Please check your email to verify your account.',
      needsVerification: !data.user?.email_confirmed_at
    });

  } catch (error) {
    console.error('Signup API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}