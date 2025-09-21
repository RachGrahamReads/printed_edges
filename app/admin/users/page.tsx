import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin";
import { redirect } from "next/navigation";
import { AdminUsersContent } from "@/components/admin-users-content";
import { AdminBackButton } from "@/components/admin-back-button";

export default async function AdminUsersPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect("/auth/login?error=admin-required");
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <AdminBackButton />
      <div className="mb-8">
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage users, credits, and view system information
        </p>
      </div>

      <Suspense fallback={<div>Loading users...</div>}>
        <AdminUsersContent />
      </Suspense>
    </div>
  );
}