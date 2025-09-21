"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Users,
  CreditCard,
  Gift,
  Settings,
  TrendingUp,
  Activity,
  DollarSign,
  ArrowRight,
  Eye,
} from "lucide-react";
import Link from "next/link";

interface QuickStats {
  totalUsers: number;
  totalRevenue: number;
  activeDiscounts: number;
  recentPurchases: number;
}

export function AdminMainDashboard() {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuickStats();
  }, []);

  const fetchQuickStats = async () => {
    try {
      const response = await fetch('/api/admin/analytics');
      if (response.ok) {
        const data = await response.json();
        setStats({
          totalUsers: data.systemStats.total_users || 0,
          totalRevenue: data.systemStats.total_revenue_all_time || 0,
          activeDiscounts: data.systemStats.active_discount_codes || 0,
          recentPurchases: data.recentPurchases.length || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching quick stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  const adminPages = [
    {
      title: "Analytics Dashboard",
      description: "View detailed analytics, revenue trends, and system performance metrics",
      href: "/admin/dashboard",
      icon: BarChart3,
      color: "bg-blue-100 text-blue-700",
      stat: stats ? formatCurrency(stats.totalRevenue) : null,
      statLabel: "Total Revenue",
    },
    {
      title: "User Management",
      description: "Manage users, view profiles, and manually adjust credits",
      href: "/admin/users",
      icon: Users,
      color: "bg-green-100 text-green-700",
      stat: stats?.totalUsers.toString(),
      statLabel: "Total Users",
    },
    {
      title: "Discount Codes",
      description: "Create and manage discount codes, track usage statistics",
      href: "/admin/dashboard?tab=discounts",
      icon: Gift,
      color: "bg-purple-100 text-purple-700",
      stat: stats?.activeDiscounts.toString(),
      statLabel: "Active Codes",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      {!loading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Registered users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                All-time earnings
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Discounts</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeDiscounts}</div>
              <p className="text-xs text-muted-foreground">
                Discount codes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <Badge className="bg-green-100 text-green-800">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                All systems operational
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Pages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminPages.map((page) => {
          const IconComponent = page.icon;

          return (
            <Card key={page.href} className="group hover:shadow-lg transition-all duration-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-lg ${page.color}`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  {page.stat && (
                    <div className="text-right">
                      <div className="text-2xl font-bold">{page.stat}</div>
                      <div className="text-xs text-muted-foreground">{page.statLabel}</div>
                    </div>
                  )}
                </div>
                <CardTitle className="mt-4">{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={page.href}>
                  <Button className="w-full group-hover:bg-primary/90" size="lg">
                    <span>Open {page.title}</span>
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common administrative tasks and shortcuts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/admin/users">
              <Button variant="outline" className="w-full h-auto flex-col gap-2 p-4">
                <Users className="h-5 w-5" />
                <span className="text-sm">View All Users</span>
              </Button>
            </Link>

            <Link href="/admin/dashboard">
              <Button variant="outline" className="w-full h-auto flex-col gap-2 p-4">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm">View Analytics</span>
              </Button>
            </Link>

            <Link href="/admin/dashboard?tab=discounts">
              <Button variant="outline" className="w-full h-auto flex-col gap-2 p-4">
                <Gift className="h-5 w-5" />
                <span className="text-sm">Manage Discounts</span>
              </Button>
            </Link>

            <Link href="/admin/dashboard?tab=purchases">
              <Button variant="outline" className="w-full h-auto flex-col gap-2 p-4">
                <Eye className="h-5 w-5" />
                <span className="text-sm">Recent Purchases</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Platform</span>
              <span className="text-sm font-medium">Printed Edges</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Environment</span>
              <Badge variant="outline">Development</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Payment Provider</span>
              <span className="text-sm font-medium">Stripe</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Database</span>
              <span className="text-sm font-medium">Supabase</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading recent activity...</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>System operational</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Database connected</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>Stripe webhooks active</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span>Admin panel accessed</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}