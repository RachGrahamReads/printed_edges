"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  Users,
  CreditCard,
  DollarSign,
  ShoppingCart,
  Target,
  Gift,
  Calendar,
  Eye,
  Plus,
} from "lucide-react";
import { formatDistance } from "date-fns";
import { CreateDiscountModal } from "@/components/create-discount-modal";

interface SystemStats {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  total_credits_granted: number;
  total_credits_used: number;
  total_credits_available: number;
  total_revenue_all_time: number;
  revenue_30d: number;
  revenue_7d: number;
  revenue_today: number;
  total_purchases: number;
  purchases_30d: number;
  failed_purchases: number;
  active_discount_codes: number;
  total_discounts_given: number;
  conversionRate: string;
  averageOrderValue: string;
  creditUtilizationRate: string;
}

interface DailyAnalytics {
  date: string;
  total_purchases: number;
  completed_purchases: number;
  failed_purchases: number;
  total_revenue: number;
  credits_sold: number;
  total_discounts: number;
  unique_customers: number;
}

interface RecentPurchase {
  id: string;
  created_at: string;
  completed_at?: string;
  amount: number;
  original_amount?: number;
  discount_amount?: number;
  discount_code?: string;
  credits_granted: number;
  status: string;
  purchase_type: string;
  user_email: string;
  user_name?: string;
}

interface DiscountCode {
  id: string;
  code: string;
  name: string;
  description?: string;
  discount_type: string;
  discount_value: number;
  status: string;
  usage_limit?: number;
  times_used: number;
  expires_at?: string;
  created_at: string;
}

interface AnalyticsData {
  systemStats: SystemStats;
  dailyAnalytics: DailyAnalytics[];
  recentPurchases: RecentPurchase[];
  topDiscounts: DiscountCode[];
}

export function AdminDashboardContent() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDiscount, setShowCreateDiscount] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/analytics');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch analytics');
      }
      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      setError(error.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const formatCurrency = (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatRelativeDate = (dateString: string) => {
    return formatDistance(new Date(dateString), new Date(), { addSuffix: true });
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      expired: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={statusColors[status] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    );
  };

  const handleDiscountCreated = () => {
    fetchAnalytics(); // Refresh data
    setShowCreateDiscount(false);
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-pulse">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="text-red-600">{error}</div>
        <Button onClick={fetchAnalytics}>Try Again</Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <div className="text-muted-foreground">No analytics data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.systemStats.total_revenue_all_time)}
            </div>
            <p className="text-xs text-muted-foreground">
              +{formatCurrency(data.systemStats.revenue_30d)} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.systemStats.total_users}</div>
            <p className="text-xs text-muted-foreground">
              +{data.systemStats.new_users_30d} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Sold</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.systemStats.total_credits_granted.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.systemStats.creditUtilizationRate}% utilized
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.systemStats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Avg order: {formatCurrency(parseFloat(data.systemStats.averageOrderValue) * 100)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="purchases">Recent Purchases</TabsTrigger>
          <TabsTrigger value="discounts">Discount Codes</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>Last 30 days performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Today</span>
                    <span className="font-medium">
                      {formatCurrency(data.systemStats.revenue_today)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Last 7 days</span>
                    <span className="font-medium">
                      {formatCurrency(data.systemStats.revenue_7d)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Last 30 days</span>
                    <span className="font-medium">
                      {formatCurrency(data.systemStats.revenue_30d)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Credit Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Credit Usage</CardTitle>
                <CardDescription>Credit distribution and usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Granted</span>
                    <span className="font-medium">
                      {data.systemStats.total_credits_granted.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Used</span>
                    <span className="font-medium text-red-600">
                      {data.systemStats.total_credits_used.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Available</span>
                    <span className="font-medium text-green-600">
                      {data.systemStats.total_credits_available.toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Analytics Table */}
          {data.dailyAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Performance</CardTitle>
                <CardDescription>Last 30 days breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Purchases</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Customers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.dailyAnalytics.slice(0, 10).map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>{formatDate(day.date)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{day.completed_purchases} completed</div>
                            {day.failed_purchases > 0 && (
                              <div className="text-xs text-red-600">
                                {day.failed_purchases} failed
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(day.total_revenue || 0)}</TableCell>
                        <TableCell>{day.credits_sold}</TableCell>
                        <TableCell>{day.unique_customers}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recent Purchases</span>
                <div className="text-sm text-muted-foreground">
                  {data.systemStats.total_purchases} total purchases
                </div>
              </CardTitle>
              <CardDescription>Latest payment transactions across all users</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentPurchases.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div className="text-muted-foreground">
                    <div className="font-medium">No purchases yet</div>
                    <div className="text-sm">Purchases will appear here as users buy credits</div>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{purchase.user_email}</div>
                            {purchase.user_name && (
                              <div className="text-sm text-muted-foreground">
                                {purchase.user_name}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm">{formatDate(purchase.created_at)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatRelativeDate(purchase.created_at)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{formatCurrency(purchase.amount)}</div>
                            {purchase.discount_amount && purchase.discount_amount > 0 && (
                              <div className="text-xs text-green-600">
                                -{formatCurrency(purchase.discount_amount)}
                                {purchase.discount_code && ` (${purchase.discount_code})`}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{purchase.credits_granted}</TableCell>
                        <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discounts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Discount Codes</span>
                <Button onClick={() => setShowCreateDiscount(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Code
                </Button>
              </CardTitle>
              <CardDescription>
                Manage discount codes and track their usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.topDiscounts.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Gift className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div className="text-muted-foreground">
                    <div className="font-medium">No discount codes created</div>
                    <div className="text-sm">Create your first discount code to boost sales</div>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topDiscounts.map((discount) => (
                      <TableRow key={discount.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium font-mono">{discount.code}</div>
                            <div className="text-sm text-muted-foreground">
                              {discount.name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {discount.discount_type === 'percentage' ? 'Percentage' : 'Fixed Amount'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {discount.discount_type === 'percentage'
                            ? `${discount.discount_value}%`
                            : formatCurrency(discount.discount_value)
                          }
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{discount.times_used} used</div>
                            {discount.usage_limit && (
                              <div className="text-xs text-muted-foreground">
                                / {discount.usage_limit} limit
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(discount.status)}</TableCell>
                        <TableCell>
                          {discount.expires_at ? (
                            <div className="space-y-1">
                              <div className="text-sm">{formatDate(discount.expires_at)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatRelativeDate(discount.expires_at)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Discount Modal */}
      <CreateDiscountModal
        open={showCreateDiscount}
        onClose={() => setShowCreateDiscount(false)}
        onSuccess={handleDiscountCreated}
      />
    </div>
  );
}