import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

export async function GET(req: NextRequest) {
  try {
    // Check admin access
    await requireAdmin();

    const supabase = await createClient();

    // Get system-wide statistics
    const { data: systemStats, error: statsError } = await supabase
      .from('admin_system_stats')
      .select('*')
      .single();

    if (statsError) {
      console.error('Error fetching system stats:', statsError);
      throw statsError;
    }

    // Get daily analytics for the last 30 days
    const { data: dailyAnalytics, error: dailyError } = await supabase
      .from('admin_daily_analytics')
      .select('*')
      .order('date', { ascending: false })
      .limit(30);

    if (dailyError) {
      console.error('Error fetching daily analytics:', dailyError);
    }

    // Get recent purchases
    const { data: recentPurchases, error: purchasesError } = await supabase
      .from('admin_recent_purchases')
      .select('*')
      .limit(20);

    if (purchasesError) {
      console.error('Error fetching recent purchases:', purchasesError);
    }

    // Get top performing discount codes
    const { data: topDiscounts, error: discountsError } = await supabase
      .from('discount_codes')
      .select('*')
      .order('times_used', { ascending: false })
      .limit(10);

    if (discountsError) {
      console.error('Error fetching discount codes:', discountsError);
    }

    // Calculate some derived metrics
    const metrics = {
      ...systemStats,
      conversionRate: systemStats.total_users > 0
        ? ((systemStats.total_purchases / systemStats.total_users) * 100).toFixed(2)
        : 0,
      averageOrderValue: systemStats.total_purchases > 0
        ? (systemStats.total_revenue_all_time / systemStats.total_purchases / 100).toFixed(2)
        : 0,
      creditUtilizationRate: systemStats.total_credits_granted > 0
        ? ((systemStats.total_credits_used / systemStats.total_credits_granted) * 100).toFixed(2)
        : 0,
    };

    return NextResponse.json({
      systemStats: metrics,
      dailyAnalytics: dailyAnalytics || [],
      recentPurchases: recentPurchases || [],
      topDiscounts: topDiscounts || [],
    });
  } catch (error: any) {
    console.error('Admin analytics API error:', error);

    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}