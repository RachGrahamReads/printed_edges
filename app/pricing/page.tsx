"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Tag, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

const pricingPlans = [
  {
    id: "single_image",
    name: "Single Image",
    price: 39,
    credits: 1,
    description: "Perfect for trying out our edge design service",
    features: [
      "1 custom edge design",
      "Unlimited PDF processing per design",
      "High-quality edge effects",
      "Download processed PDFs instantly",
    ],
    popular: false,
  },
  {
    id: "three_images",
    name: "Three Images",
    price: 99,
    credits: 3,
    description: "Best value for multiple book projects",
    features: [
      "3 custom edge designs",
      "Unlimited PDF processing per design",
      "High-quality edge effects",
      "Download processed PDFs instantly",
    ],
    popular: true,
  },
];

interface DiscountInfo {
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  isValid: boolean;
  couponId?: string;
}

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const validateDiscountCode = async (code: string) => {
    if (!code.trim()) {
      setDiscountError('');
      setDiscountInfo(null);
      return;
    }

    setDiscountLoading(true);
    setDiscountError('');

    try {
      const response = await fetch('/api/discount-codes/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid discount code');
      }

      setDiscountInfo({
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        isValid: true,
        couponId: data.couponId,
      });
    } catch (error: any) {
      setDiscountError(error.message);
      setDiscountInfo(null);
    } finally {
      setDiscountLoading(false);
    }
  };

  const removeDiscount = () => {
    setDiscountCode('');
    setDiscountInfo(null);
    setDiscountError('');
  };

  const calculateDiscountedPrice = (originalPrice: number) => {
    if (!discountInfo?.isValid) return originalPrice;

    if (discountInfo.discountType === 'percentage') {
      return Math.round(originalPrice * (1 - discountInfo.discountValue / 100));
    } else {
      return Math.max(0, originalPrice - discountInfo.discountValue);
    }
  };

  const handlePurchase = async (planId: string) => {
    setLoading(planId);

    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Create checkout session
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseType: planId,
          discountCode: discountInfo?.code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error("Error creating checkout session:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Purchase edge design credits to create PDFs with your custom edge designs
        </p>
      </div>

      {/* Discount Code Section */}
      <div className="max-w-md mx-auto mb-8">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Have a discount code?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Enter discount code"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      validateDiscountCode(discountCode);
                    }
                  }}
                />
              </div>
              <Button
                onClick={() => validateDiscountCode(discountCode)}
                disabled={discountLoading || !discountCode.trim()}
                variant="outline"
              >
                {discountLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Apply'
                )}
              </Button>
            </div>

            {discountError && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {discountError}
              </div>
            )}

            {discountInfo?.isValid && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-green-700 border-green-300">
                      {discountInfo.code}
                    </Badge>
                    <span className="text-sm text-green-700">
                      {discountInfo.discountType === 'percentage'
                        ? `${discountInfo.discountValue}% off`
                        : `$${(discountInfo.discountValue / 100).toFixed(2)} off`
                      }
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={removeDiscount}
                    className="h-8 w-8 p-0 text-green-700 hover:text-green-800"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {pricingPlans.map((plan) => (
          <Card key={plan.id} className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''}`}>
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                Best Value
              </Badge>
            )}

            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription className="text-base">{plan.description}</CardDescription>
              <div className="mt-4">
                {discountInfo?.isValid ? (
                  <div className="space-y-1">
                    <div className="text-lg line-through text-muted-foreground">
                      ${plan.price}
                    </div>
                    <div>
                      <span className="text-4xl font-bold text-green-600">
                        ${calculateDiscountedPrice(plan.price)}
                      </span>
                      <span className="text-muted-foreground"> one-time</span>
                    </div>
                    <div className="text-sm text-green-600 font-medium">
                      Save ${plan.price - calculateDiscountedPrice(plan.price)}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground"> one-time</span>
                  </div>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {plan.credits} edge design credit{plan.credits > 1 ? 's' : ''}
              </div>
            </CardHeader>

            <CardContent>
              <ul className="space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="flex-col space-y-3">
              <p className="text-xs text-center text-muted-foreground">
                By purchasing, you agree to our{" "}
                <Link href="/terms" className="underline hover:text-foreground">
                  Terms of Service
                </Link>
              </p>
              <Button
                className="w-full"
                onClick={() => handlePurchase(plan.id)}
                disabled={loading !== null}
                variant={plan.popular ? "default" : "outline"}
              >
                {loading === plan.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Get ${plan.credits} Credit${plan.credits > 1 ? 's' : ''}`
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Bulk Pricing Contact */}
      <div className="mt-12 max-w-2xl mx-auto">
        <Card className="border-2 border-dashed border-gray-300">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Large Backlist? Publisher?</CardTitle>
            <CardDescription>Contact us for bulk pricing!</CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-0">
            <Button variant="outline" className="w-full" asChild>
              <a href="mailto:hello@rachgrahamreads.com?subject=Bulk Pricing Inquiry">
                Contact Us for Bulk Pricing
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground max-w-2xl mx-auto">
        <h3 className="font-medium mb-2">How it works:</h3>
        <p>
          Purchase edge design credits, then upload your custom edge images to create designs.
          Once created, you can process unlimited PDFs with each design within 60 days - perfect for reprinting
          updated versions of your books!
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}