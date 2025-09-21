"use client";

import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard, FileImage, History, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface UserCredits {
  total_credits: number;
  used_credits: number;
}

interface EdgeDesign {
  id: string;
  name: string;
  created_at: string;
  side_image_path?: string;
  top_image_path?: string;
  bottom_image_path?: string;
}

interface ProcessingJob {
  id: string;
  created_at: string;
  status: string;
  edge_design_id: string;
  page_count?: number;
  edge_designs?: {
    name: string;
  };
}

interface DashboardContentProps {
  user: User;
}

export function DashboardContent({ user }: DashboardContentProps) {
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [edgeDesigns, setEdgeDesigns] = useState<EdgeDesign[]>([]);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load user credits
      const { data: creditsData } = await supabase
        .from("user_credits")
        .select("total_credits, used_credits")
        .eq("user_id", user.id)
        .single();

      if (creditsData) {
        setCredits(creditsData);
      }

      // Load edge designs
      const { data: designsData } = await supabase
        .from("edge_designs")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (designsData) {
        setEdgeDesigns(designsData);
      }

      // Load processing jobs
      const { data: jobsData } = await supabase
        .from("processing_jobs")
        .select(`
          *,
          edge_designs (name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (jobsData) {
        setProcessingJobs(jobsData);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const availableCredits = credits ? credits.total_credits - credits.used_credits : 0;

  if (loading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.email}</p>
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Credits Overview */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableCredits}</div>
            <p className="text-xs text-muted-foreground">
              Used {credits?.used_credits || 0} of {credits?.total_credits || 0} total credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Edge Designs</CardTitle>
            <FileImage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{edgeDesigns.length}</div>
            <p className="text-xs text-muted-foreground">
              Active edge designs ready for processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PDFs Processed</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processingJobs.length}</div>
            <p className="text-xs text-muted-foreground">
              Total processing jobs completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Get More Credits</CardTitle>
            <CardDescription>
              Purchase additional edge design credits to create more custom designs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/pricing">
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Buy Credits
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Edge Design</CardTitle>
            <CardDescription>
              Use 1 credit to upload and create a new edge design
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availableCredits > 0 ? (
              <Link href="/create-design">
                <Button className="w-full">
                  <FileImage className="h-4 w-4 mr-2" />
                  Create Design (1 credit)
                </Button>
              </Link>
            ) : (
              <Button className="w-full" disabled>
                No Credits Available
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edge Designs */}
      <Card>
        <CardHeader>
          <CardTitle>Your Edge Designs</CardTitle>
          <CardDescription>
            Manage your custom edge designs and process PDFs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {edgeDesigns.length === 0 ? (
            <div className="text-center py-8">
              <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No edge designs yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first edge design to get started
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {edgeDesigns.map((design) => (
                <Card key={design.id} className="p-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">{design.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(design.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      {design.side_image_path && <Badge variant="secondary">Side</Badge>}
                      {design.top_image_path && <Badge variant="secondary">Top</Badge>}
                      {design.bottom_image_path && <Badge variant="secondary">Bottom</Badge>}
                    </div>
                    <Link href={`/process?design=${design.id}`}>
                      <Button size="sm" className="w-full">
                        Process PDF
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Processing Jobs */}
      {processingJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Processing Jobs</CardTitle>
            <CardDescription>
              Your latest PDF processing activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processingJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">
                      {job.edge_designs?.name || 'Unknown Design'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(job.created_at).toLocaleDateString()} • {job.page_count || 'Unknown'} pages
                    </p>
                  </div>
                  <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}