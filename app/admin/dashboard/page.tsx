import { Suspense } from "react";
import { getAdminUser } from "@/lib/admin";
import { redirect } from "next/navigation";
import { AdminDashboardContent } from "@/components/admin-dashboard-content";
import { AdminBackButton } from "@/components/admin-back-button";

export default async function AdminDashboardPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect("/auth/login?error=admin-required");
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <AdminBackButton />
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          System analytics, revenue tracking, and discount management
        </p>
      </div>

      <Suspense fallback={<div>Loading dashboard...</div>}>
        <AdminDashboardContent />
      </Suspense>
    </div>
  );
}