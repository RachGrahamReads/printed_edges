"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, CreditCard } from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  total_credits: number;
  used_credits: number;
  available_credits: number;
}

interface CreditManagementModalProps {
  user: AdminUser;
  action: 'grant' | 'revoke';
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreditManagementModal({
  user,
  action,
  open,
  onClose,
  onSuccess,
}: CreditManagementModalProps) {
  const [credits, setCredits] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (credits <= 0) {
      setError("Please enter a positive number of credits");
      return;
    }

    if (action === 'revoke' && credits > user.available_credits) {
      setError(`Cannot revoke ${credits} credits. User only has ${user.available_credits} available.`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/credits/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          credits,
          reason: reason.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} credits`);
      }

      onSuccess();
      onClose();
      setCredits(1);
      setReason("");
    } catch (error: any) {
      console.error(`Error ${action}ing credits:`, error);
      setError(error.message || `Failed to ${action} credits`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCredits(1);
    setReason("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === 'grant' ? (
              <Plus className="h-5 w-5 text-green-600" />
            ) : (
              <Minus className="h-5 w-5 text-red-600" />
            )}
            {action === 'grant' ? 'Grant Credits' : 'Revoke Credits'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User Info */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">User:</span>
              <span>{user.email}</span>
            </div>
            {user.name && (
              <div className="flex items-center justify-between">
                <span className="font-medium">Name:</span>
                <span>{user.name}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-medium">Current Credits:</span>
              <Badge variant="outline" className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                {user.available_credits} available
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Total: {user.total_credits}, Used: {user.used_credits}
            </div>
          </div>

          {/* Credits Input */}
          <div className="space-y-2">
            <Label htmlFor="credits">
              Credits to {action} {action === 'revoke' && `(max: ${user.available_credits})`}
            </Label>
            <Input
              id="credits"
              type="number"
              min="1"
              max={action === 'revoke' ? user.available_credits : undefined}
              value={credits}
              onChange={(e) => setCredits(parseInt(e.target.value) || 0)}
              required
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder={`Reason for ${action === 'grant' ? 'granting' : 'revoking'} credits...`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Preview */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="text-sm font-medium mb-2">Preview:</div>
            <div className="text-sm space-y-1">
              <div>
                Current available: {user.available_credits} credits
              </div>
              <div>
                After {action}: {
                  action === 'grant'
                    ? user.available_credits + credits
                    : Math.max(0, user.available_credits - credits)
                } credits
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || credits <= 0}
              variant={action === 'grant' ? 'default' : 'destructive'}
            >
              {loading ? 'Processing...' : `${action === 'grant' ? 'Grant' : 'Revoke'} ${credits} Credits`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}