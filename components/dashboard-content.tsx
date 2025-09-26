"use client";

import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard, FileImage, History, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpButton } from "@/components/help-button";
import { DeleteDesignModal } from "@/components/delete-design-modal";

interface UserCredits {
  total_credits: number;
  used_credits: number;
}

interface ApiUserData {
  id: string;
  email: string;
  first_name?: string;
  surname?: string;
  name?: string;
  created_at: string;
}

interface EdgeDesign {
  id: string;
  name: string;
  created_at: string;
  side_image_path?: string;
  top_image_path?: string;
  bottom_image_path?: string;
  top_edge_color?: string;
  bottom_edge_color?: string;
  pdf_width?: number;
  pdf_height?: number;
  page_count?: number;
  bleed_type?: string;
  edge_type?: string;
  regeneration_count?: number;
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
  const [apiUserData, setApiUserData] = useState<ApiUserData | null>(null);
  const [edgeDesigns, setEdgeDesigns] = useState<EdgeDesign[]>([]);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [renamingDesignId, setRenamingDesignId] = useState<string | null>(null);
  const [newDesignName, setNewDesignName] = useState<string>("");
  const [edgeImageUrls, setEdgeImageUrls] = useState<Record<string, string>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [designToDelete, setDesignToDelete] = useState<EdgeDesign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadDashboardData();
    handlePaymentSuccess();
  }, []);

  useEffect(() => {
    if (edgeDesigns.length > 0) {
      loadEdgeImageUrls();
    }
  }, [edgeDesigns]);

  const handlePaymentSuccess = async () => {
    // Check for payment success URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');
    const expectedCredits = urlParams.get('credits');

    if (paymentStatus === 'success' && sessionId && expectedCredits) {
      setPaymentProcessing(true);
      setPaymentMessage('Processing your payment and granting credits...');

      try {
        const response = await fetch('/api/payments/confirm-success', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            expectedCredits: parseInt(expectedCredits)
          })
        });

        const data = await response.json();

        if (response.ok) {
          if (data.alreadyProcessed) {
            setPaymentMessage('Payment already processed. Your credits are available!');
          } else {
            setPaymentMessage(`Success! ${data.creditsGranted} credits have been added to your account.`);
          }

          // Refresh dashboard data to show new credits
          setTimeout(() => {
            loadDashboardData();
          }, 1000);

          // Clear URL parameters
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        } else {
          setPaymentMessage(`Payment confirmation failed: ${data.error}`);
        }
      } catch (error) {
        console.error('Error confirming payment:', error);
        setPaymentMessage('Failed to confirm payment. Please contact support if credits are missing.');
      } finally {
        setPaymentProcessing(false);
        // Clear message after 5 seconds
        setTimeout(() => {
          setPaymentMessage(null);
        }, 5000);
      }
    }
  };

  const loadEdgeImageUrls = async () => {
    console.log('Loading edge image URLs for designs:', edgeDesigns);
    const urls: Record<string, string> = {};

    for (const design of edgeDesigns) {
      // Use side image as primary display image, fallback to top or bottom
      const imagePath = design.side_image_path || design.top_image_path || design.bottom_image_path;
      console.log(`Design ${design.id} - ${design.name} has image path:`, imagePath);

      if (imagePath) {
        try {
          console.log(`Creating signed URL for secure access to: ${imagePath}`);

          // Create signed URL using API endpoint that has proper service role access
          const response = await fetch('/api/edge-designs/get-image-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imagePath: imagePath
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.signedUrl) {
              console.log(`Signed URL created for design ${design.id}:`, data.signedUrl);

              // Convert to blob URL to avoid CORS issues with img src
              try {
                const imageResponse = await fetch(data.signedUrl);
                if (imageResponse.ok) {
                  const blob = await imageResponse.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  urls[design.id] = blobUrl;
                  console.log(`✅ Blob URL created for design ${design.id}:`, blobUrl);
                } else {
                  console.error(`Failed to fetch image for design ${design.id}:`, imageResponse.status);
                }
              } catch (blobError) {
                console.error(`Error creating blob URL for design ${design.id}:`, blobError);
                // Fallback to original signed URL
                urls[design.id] = data.signedUrl;
              }
            } else {
              console.error(`No signed URL returned for design ${design.id}`);
            }
          } else {
            console.error(`API error for design ${design.id}: ${response.status} ${response.statusText}`);
            try {
              const errorData = await response.json();
              console.error(`Error details:`, errorData);
            } catch (parseError) {
              console.error(`Could not parse error response`);
            }
          }
        } catch (error) {
          console.error(`Error loading image for design ${design.id}:`, error);
        }
      } else {
        console.log(`Design ${design.id} has no image path`);
      }
    }

    console.log('Final image URLs:', urls);
    setEdgeImageUrls(urls);
  };

  const loadDashboardData = async () => {
    try {
      console.log('Loading dashboard data via API...');

      // Use API endpoint for reliable data fetching
      const response = await fetch('/api/dashboard/user-data');

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Dashboard API error:', errorData);
        throw new Error(errorData.error || 'Failed to load dashboard data');
      }

      const data = await response.json();
      console.log('Dashboard data loaded:', data);

      // Set credits data
      if (data.credits) {
        setCredits(data.credits);
        console.log('Credits set:', data.credits);
      }

      // Set user data from API
      if (data.user) {
        setApiUserData(data.user);
        console.log('User data set:', data.user);
      }

      // Set processing jobs data
      if (data.processingJobs) {
        setProcessingJobs(data.processingJobs);
        console.log('Processing jobs set:', data.processingJobs);
      } else {
        console.warn('No processing jobs data in response');
      }

      // Load edge designs via API
      console.log('Fetching edge designs for user:', user.id);
      try {
        const edgeDesignsResponse = await fetch('/api/edge-designs');
        console.log('Edge designs API response status:', edgeDesignsResponse.status);

        if (edgeDesignsResponse.ok) {
          const edgeDesignsData = await edgeDesignsResponse.json();
          console.log('Raw edge designs response:', edgeDesignsData);
          console.log('Number of edge designs found:', edgeDesignsData.designs?.length || 0);
          console.log('Edge designs:', edgeDesignsData.designs);
          setEdgeDesigns(edgeDesignsData.designs || []);
        } else {
          console.error('Failed to fetch edge designs:', {
            status: edgeDesignsResponse.status,
            statusText: edgeDesignsResponse.statusText
          });

          // Try to get error details
          try {
            const errorData = await edgeDesignsResponse.json();
            console.error('Edge designs API error details:', errorData);
          } catch (parseError) {
            console.error('Could not parse error response');
          }
        }
      } catch (edgeDesignsError) {
        console.error('Error fetching edge designs:', edgeDesignsError);
      }

      // Processing jobs data comes from the dashboard API
      // (fetched via the dashboard API route to bypass RLS issues)

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

  const startRenaming = (design: EdgeDesign) => {
    setRenamingDesignId(design.id);
    setNewDesignName(design.name);
  };

  const cancelRenaming = () => {
    setRenamingDesignId(null);
    setNewDesignName("");
  };

  const saveRename = async (designId: string) => {
    if (!newDesignName.trim()) {
      alert('Please enter a valid design name');
      return;
    }

    try {
      const response = await fetch(`/api/edge-designs/${designId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newName: newDesignName.trim()
        })
      });

      if (response.ok) {
        // Update the local state
        setEdgeDesigns(designs =>
          designs.map(design =>
            design.id === designId
              ? { ...design, name: newDesignName.trim() }
              : design
          )
        );
        setRenamingDesignId(null);
        setNewDesignName("");
        // Reload image URLs for updated design
        loadEdgeImageUrls();
      } else {
        const data = await response.json();
        alert(`Failed to rename design: ${data.error}`);
      }
    } catch (error) {
      console.error('Error renaming design:', error);
      alert('Failed to rename design. Please try again.');
    }
  };

  const handleDeleteClick = (design: EdgeDesign) => {
    setDesignToDelete(design);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!designToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/edge-designs/${designToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove the design from the local state
        setEdgeDesigns(prev => prev.filter(design => design.id !== designToDelete.id));
        console.log(`Design "${designToDelete.name}" deleted successfully`);
      } else {
        const errorData = await response.json();
        alert(`Failed to delete design: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting design:', error);
      alert('Failed to delete design. Please try again.');
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setDesignToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setDesignToDelete(null);
  };

  const availableCredits = credits ? credits.total_credits - credits.used_credits : 0;

  if (loading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Payment Success/Processing Message */}
      {(paymentMessage || paymentProcessing) && (
        <div className={`p-4 rounded-lg border ${
          paymentProcessing
            ? 'bg-blue-50 border-blue-200 text-blue-800'
            : paymentMessage?.includes('Success') || paymentMessage?.includes('available')
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {paymentProcessing && (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            )}
            <span className="font-medium">
              {paymentMessage || 'Processing payment...'}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Hi, {apiUserData?.first_name || user.user_metadata?.first_name || user.email?.split('@')[0]}!</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpButton />
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
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
              <Link href="/create">
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
            <div className="grid md:grid-cols-2 gap-4">
              {edgeDesigns.map((design) => (
                <Card key={design.id} className="p-3">
                  <div className="flex gap-3">
                    {/* Left Side - Edge Design Preview */}
                    <div className="relative w-[90px] h-[200px] bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                      {edgeImageUrls[design.id] ? (
                        <>
                          <img
                            src={edgeImageUrls[design.id]}
                            alt={`${design.name} preview`}
                            className="max-h-full max-w-full object-contain"
                            onLoad={(e) => {
                              console.log(`Image loaded successfully for design ${design.id}:`, edgeImageUrls[design.id]);
                            }}
                            onError={(e) => {
                              console.error(`❌ Image still failed to load for design ${design.id}`);
                              console.error(`URL: ${edgeImageUrls[design.id]}`);

                              // Hide image if it fails to load and show placeholder
                              const img = e.target as HTMLImageElement;
                              img.style.display = 'none';
                              const placeholder = img.parentElement?.querySelector('.image-placeholder');
                              if (placeholder) {
                                (placeholder as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                          {/* Hidden placeholder that shows when image fails */}
                          <div className="image-placeholder absolute inset-0 w-full h-full items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50" style={{display: 'none'}}>
                            <div className="text-center">
                              <FileImage className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                              <p className="text-xs text-gray-500">Preview Unavailable</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
                          <div className="text-center">
                            <FileImage className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                            <p className="text-xs text-gray-500">Edge Design</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Side - Details */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="space-y-2">
                        {renamingDesignId === design.id ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={newDesignName}
                              onChange={(e) => setNewDesignName(e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                              placeholder="Enter new name..."
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  saveRename(design.id);
                                } else if (e.key === 'Escape') {
                                  cancelRenaming();
                                }
                              }}
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => saveRename(design.id)}
                                disabled={!newDesignName.trim()}
                                className="text-xs h-6"
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelRenaming}
                                className="text-xs h-6"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between">
                            <h4 className="font-medium text-sm leading-tight">{design.name}</h4>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startRenaming(design)}
                              className="h-5 w-5 p-0 text-gray-500 hover:text-gray-700 flex-shrink-0"
                            >
                              ✏️
                            </Button>
                          </div>
                        )}

                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            Created {new Date(design.created_at).toLocaleDateString()}
                          </p>
                          {design.regeneration_count !== undefined && design.regeneration_count > 0 && (
                            <p className="text-xs text-blue-600">
                              Regenerated {design.regeneration_count} time{design.regeneration_count !== 1 ? 's' : ''}
                            </p>
                          )}
                          {(() => {
                            const createdDate = new Date(design.created_at);
                            const expiryDate = new Date(createdDate.getTime() + (60 * 24 * 60 * 60 * 1000)); // 60 days from creation
                            const today = new Date();
                            const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

                            if (daysLeft <= 0) {
                              return (
                                <p className="text-xs text-red-600 font-medium">
                                  Expired - requires new credit
                                </p>
                              );
                            } else if (daysLeft <= 7) {
                              return (
                                <p className="text-xs text-orange-600 font-medium">
                                  Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                                </p>
                              );
                            } else {
                              return (
                                <p className="text-xs text-green-600">
                                  Expires in {daysLeft} days
                                </p>
                              );
                            }
                          })()}
                        </div>

                        {/* PDF Information */}
                        {(design.pdf_width || design.pdf_height || design.page_count) && (
                          <div className="bg-gray-50 p-1.5 rounded text-xs space-y-0.5">
                            {design.pdf_width && design.pdf_height && (
                              <div className="text-gray-700 font-medium">
                                {design.pdf_width}" × {design.pdf_height}"
                              </div>
                            )}
                            {design.page_count && (
                              <div className="text-gray-600">
                                {design.page_count} pages
                              </div>
                            )}
                            {design.bleed_type && (
                              <div className="text-gray-600">
                                {design.bleed_type === 'add_bleed' ? 'Add bleed' : 'Has bleed'}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1">
                          {design.top_image_path && (
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              Top
                            </Badge>
                          )}
                          {design.bottom_image_path && (
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              Bottom
                            </Badge>
                          )}
                        </div>

                        <div className="pt-1 space-y-1">
                          <Link href={`/regenerate/${design.id}`}>
                            <Button size="sm" className="w-full h-7 text-xs">
                              Use Design
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteClick(design)}
                            className="w-full h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
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
                      Processing Job #{job.id.slice(-8)}
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

      {/* Delete Confirmation Modal */}
      <DeleteDesignModal
        isOpen={deleteModalOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        designName={designToDelete?.name || ''}
        isDeleting={isDeleting}
      />
    </div>
  );
}