import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { requireAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  try {
    // Check admin access
    await requireAdmin();
    console.log('Admin access confirmed for users API');

    // Use service role client for admin operations to bypass RLS
    let supabase;
    try {
      supabase = createServiceRoleClient();
      console.log('Service role client created successfully');
    } catch (serviceError) {
      console.error('Failed to create service role client:', serviceError);
      return NextResponse.json(
        { error: 'Failed to initialize service role client', details: serviceError instanceof Error ? serviceError.message : 'Unknown error' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);

    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    console.log('Query parameters:', { search, page, limit, offset });

    let query = supabase
      .from('admin_user_overview')
      .select('*', { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`email.ilike.%${search}%, name.ilike.%${search}%`);
    }

    // Add pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    console.log('Executing admin_user_overview query...');
    const { data: users, error, count } = await query;

    console.log('Query result:', {
      hasUsers: !!users,
      userCount: users?.length || 0,
      totalCount: count,
      error: error ? {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      } : null
    });

    if (error) {
      console.error('Error fetching users - DETAILED:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        fullError: JSON.stringify(error, null, 2)
      });
      throw error;
    }

    return NextResponse.json({
      users: users || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    console.error('Admin users API error:', error);

    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}