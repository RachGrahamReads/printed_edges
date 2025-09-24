import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "@/components/dashboard-content";
import { SiteFooter } from "@/components/site-footer";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 container mx-auto py-8 px-4">
        <Suspense fallback={<div>Loading dashboard...</div>}>
          <DashboardContent user={user} />
        </Suspense>
      </div>
      <SiteFooter />
    </div>
  );
}