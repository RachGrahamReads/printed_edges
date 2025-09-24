"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, CreditCard, ShoppingCart, FileImage, Calendar, DollarSign } from "lucide-react";
import { formatDistance } from "date-fns";

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
  total_credits: number;
  used_credits: number;
  available_credits: number;
  completed_purchases: number;
  total_spent?: number;
  total_jobs: number;
}

interface Purchase {
  id: string;
  amount: number;
  currency: string;
  purchase_type: string;
  credits_granted: number;
  status: string;
  created_at: string;
  completed_at?: string;
  stripe_payment_intent_id?: string;
}

interface ProcessingJob {
  id: string;
  status: string;
  page_count?: number;
  page_type?: string;
  edge_type?: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  edge_designs?: {
    name: string;
  };
}

interface EdgeDesign {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  side_image_path?: string;
  top_image_path?: string;
  bottom_image_path?: string;
  top_edge_color?: string;
  bottom_edge_color?: string;
}

interface UserDetails {
  user: AdminUser;
  purchases: Purchase[];
  jobs: ProcessingJob[];
  edgeDesigns: EdgeDesign[];
}

interface UserDetailsModalProps {
  user: AdminUser;
  open: boolean;
  onClose: () => void;
}

export function UserDetailsModal({ user, open, onClose }: UserDetailsModalProps) {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      fetchUserDetails();
    }
  }, [open, user]);

  const fetchUserDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch user details`);
      }
      const data = await response.json();
      setDetails(data);
    } catch (error: any) {
      console.error('Error fetching user details:', error);
      setError(error.message || 'Failed to load user details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency = 'usd') => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  const formatRelativeDate = (dateString: string) => {
    return formatDistance(new Date(dateString), new Date(), { addSuffix: true });
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      processing: 'bg-blue-100 text-blue-800',
    };

    return (
      <Badge className={statusColors[status] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details: {user.email}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-pulse">Loading user details...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8 space-y-4">
            <div className="text-red-600">{error}</div>
            <button
              onClick={fetchUserDetails}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : details ? (
          <div className="space-y-6">
            {/* User Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="font-medium">{details.user.email}</div>
                  </div>
                  {details.user.name && (
                    <div>
                      <div className="text-sm text-muted-foreground">Name</div>
                      <div className="font-medium">{details.user.name}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-muted-foreground">Joined</div>
                    <div className="font-medium">{formatRelativeDate(details.user.created_at)}</div>
                  </div>
                  {details.user.last_login && (
                    <div>
                      <div className="text-sm text-muted-foreground">Last Login</div>
                      <div className="font-medium">{formatRelativeDate(details.user.last_login)}</div>
                    </div>
                  )}
                  {details.user.is_admin && (
                    <Badge variant="secondary">Admin User</Badge>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Credits
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Available</div>
                    <div className="font-medium text-lg">{details.user.available_credits}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Purchased</div>
                    <div className="font-medium">{details.user.total_credits}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Used</div>
                    <div className="font-medium">{details.user.used_credits}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Purchases</div>
                    <div className="font-medium">{details.user.completed_purchases}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Spent</div>
                    <div className="font-medium">{formatCurrency(details.user.total_spent || 0)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Processing Jobs</div>
                    <div className="font-medium">{details.user.total_jobs}</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Information Tabs */}
            <Tabs defaultValue="purchases" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="purchases">Purchases ({details.purchases.length})</TabsTrigger>
                <TabsTrigger value="jobs">Jobs ({details.jobs.length})</TabsTrigger>
                <TabsTrigger value="designs">Designs ({details.edgeDesigns.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="purchases" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Purchase History</CardTitle>
                    <CardDescription>All payment transactions for this user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {details.purchases.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <CreditCard className="h-12 w-12 text-muted-foreground mx-auto" />
                        <div className="text-muted-foreground">
                          <div className="font-medium">No purchases yet</div>
                          <div className="text-sm">This user hasn't made any credit purchases</div>
                        </div>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Credits</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.purchases.map((purchase) => (
                            <TableRow key={purchase.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="text-sm">{formatDate(purchase.created_at)}</div>
                                  {purchase.completed_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Completed: {formatDate(purchase.completed_at)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {purchase.purchase_type.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatCurrency(purchase.amount, purchase.currency)}</TableCell>
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

              <TabsContent value="jobs" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Processing Jobs</CardTitle>
                    <CardDescription>PDF processing history for this user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {details.jobs.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <FileImage className="h-12 w-12 text-muted-foreground mx-auto" />
                        <div className="text-muted-foreground">
                          <div className="font-medium">No processing jobs yet</div>
                          <div className="text-sm">This user hasn't processed any PDFs with edge designs</div>
                        </div>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Design</TableHead>
                            <TableHead>Pages</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.jobs.map((job) => (
                            <TableRow key={job.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="text-sm">{formatDate(job.created_at)}</div>
                                  {job.completed_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Completed: {formatDate(job.completed_at)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {job.edge_designs?.name || 'Unknown'}
                              </TableCell>
                              <TableCell>{job.page_count || 'N/A'}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {job.page_type && (
                                    <div className="text-sm">{job.page_type}</div>
                                  )}
                                  {job.edge_type && (
                                    <div className="text-xs text-muted-foreground">{job.edge_type}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {getStatusBadge(job.status)}
                                  {job.error_message && (
                                    <div className="text-xs text-red-600 max-w-32 truncate">
                                      {job.error_message}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="designs" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Edge Designs</CardTitle>
                    <CardDescription>Custom edge designs created by this user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {details.edgeDesigns.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <User className="h-12 w-12 text-muted-foreground mx-auto" />
                        <div className="text-muted-foreground">
                          <div className="font-medium">No edge designs created</div>
                          <div className="text-sm">This user hasn't uploaded any custom edge designs</div>
                        </div>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Images</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.edgeDesigns.map((design) => (
                            <TableRow key={design.id}>
                              <TableCell className="font-medium">{design.name}</TableCell>
                              <TableCell>{formatDate(design.created_at)}</TableCell>
                              <TableCell>
                                <div className="text-sm space-y-1">
                                  {design.side_image_path && <div>✓ Side</div>}
                                  {design.top_image_path && <div>✓ Top</div>}
                                  {design.bottom_image_path && <div>✓ Bottom</div>}
                                </div>
                              </TableCell>
                              <TableCell>
                                {design.is_active ? (
                                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                                ) : (
                                  <Badge variant="outline">Inactive</Badge>
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
          </div>
        ) : (
          <div className="text-center py-8 space-y-4">
            <div className="text-muted-foreground">No user details available</div>
            <button
              onClick={fetchUserDetails}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Reload
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}