"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Gift, Percent, DollarSign } from "lucide-react";

interface CreateDiscountModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateDiscountModal({ open, onClose, onSuccess }: CreateDiscountModalProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'fixed_amount',
    discountValue: '',
    usageLimit: '',
    expiresAt: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.code || !formData.name || !formData.discountValue) {
      setError('Please fill in all required fields');
      return;
    }

    const discountValue = parseInt(formData.discountValue);
    if (isNaN(discountValue) || discountValue <= 0) {
      setError('Discount value must be a positive number');
      return;
    }

    if (formData.discountType === 'percentage' && discountValue > 100) {
      setError('Percentage discount cannot exceed 100%');
      return;
    }

    if (formData.usageLimit && (isNaN(parseInt(formData.usageLimit)) || parseInt(formData.usageLimit) <= 0)) {
      setError('Usage limit must be a positive number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/discount-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: formData.code.toUpperCase(),
          name: formData.name,
          description: formData.description || undefined,
          discountType: formData.discountType,
          discountValue: formData.discountType === 'fixed_amount'
            ? discountValue * 100 // Convert to cents
            : discountValue,
          usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : undefined,
          expiresAt: formData.expiresAt || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create discount code');
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating discount code:', error);
      setError(error.message || 'Failed to create discount code');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      discountType: 'percentage',
      discountValue: '',
      usageLimit: '',
      expiresAt: '',
    });
    setError('');
    onClose();
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, code: result }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-blue-600" />
            Create Discount Code
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code */}
          <div className="space-y-2">
            <Label htmlFor="code">Discount Code *</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="e.g., SAVE20"
                className="font-mono"
                required
              />
              <Button type="button" variant="outline" onClick={generateCode}>
                Generate
              </Button>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Display Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., 20% Off Credits"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description for internal use"
              rows={2}
            />
          </div>

          {/* Discount Type & Value */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Discount Type *</Label>
              <Select
                value={formData.discountType}
                onValueChange={(value: 'percentage' | 'fixed_amount') =>
                  setFormData(prev => ({ ...prev, discountType: value, discountValue: '' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">
                    <div className="flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Percentage
                    </div>
                  </SelectItem>
                  <SelectItem value="fixed_amount">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fixed Amount
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discountValue">
                {formData.discountType === 'percentage' ? 'Percentage (%)' : 'Amount ($)'} *
              </Label>
              <Input
                id="discountValue"
                type="number"
                value={formData.discountValue}
                onChange={(e) => setFormData(prev => ({ ...prev, discountValue: e.target.value }))}
                placeholder={formData.discountType === 'percentage' ? '20' : '5.00'}
                min="1"
                max={formData.discountType === 'percentage' ? '100' : undefined}
                step={formData.discountType === 'fixed_amount' ? '0.01' : '1'}
                required
              />
            </div>
          </div>

          {/* Usage Limit */}
          <div className="space-y-2">
            <Label htmlFor="usageLimit">Usage Limit</Label>
            <Input
              id="usageLimit"
              type="number"
              value={formData.usageLimit}
              onChange={(e) => setFormData(prev => ({ ...prev, usageLimit: e.target.value }))}
              placeholder="Leave empty for unlimited"
              min="1"
            />
          </div>

          {/* Expiration Date */}
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expiration Date</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>

          {/* Preview */}
          {formData.code && formData.discountValue && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="text-sm font-medium mb-2">Preview:</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">{formData.code}</Badge>
                  <span className="text-sm">
                    {formData.discountType === 'percentage'
                      ? `${formData.discountValue}% off`
                      : `$${formData.discountValue} off`
                    }
                  </span>
                </div>
                {formData.usageLimit && (
                  <div className="text-xs text-muted-foreground">
                    Limited to {formData.usageLimit} uses
                  </div>
                )}
                {formData.expiresAt && (
                  <div className="text-xs text-muted-foreground">
                    Expires: {new Date(formData.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Discount Code'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}