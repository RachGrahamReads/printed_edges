import { Suspense } from "react";
import { getAdminUser } from "@/lib/admin";
import { redirect } from "next/navigation";
import { AdminMainDashboard } from "@/components/admin-main-dashboard";

export default async function AdminMainPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect("/auth/login?error=admin-required");
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Control Panel</h1>
        <p className="text-muted-foreground mt-2">
          Manage your platform, users, and business metrics
        </p>
      </div>

      <Suspense fallback={<div>Loading admin dashboard...</div>}>
        <AdminMainDashboard />
      </Suspense>
    </div>
  );
}