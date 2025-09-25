"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    // Basic email validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    try {
      // First check if user exists
      const checkResponse = await fetch('/api/auth/check-user-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        throw new Error(checkData.error || 'Failed to check user');
      }

      if (!checkData.exists) {
        setError('No account found with that email address. Please check your email or sign up for a new account.');
        setIsLoading(false);
        return;
      }

      // User exists, send reset email
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      setEmailSent(true);
      setMessage(`Password reset email sent to ${email}. Please check your inbox and spam folder.`);

    } catch (error: unknown) {
      console.error('Password reset error:', error);
      setError(error instanceof Error ? error.message : "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>
            {emailSent
              ? "Check your email for reset instructions"
              : "Enter your email address and we'll send you a link to reset your password"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!emailSent ? (
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                {error && (
                  <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md border border-green-200">
                    {message}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Mail className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Reset Email
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6 text-green-600" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  We've sent a password reset link to:
                </p>
                <p className="font-medium">{email}</p>
              </div>
              <div className="bg-blue-50 text-blue-700 text-sm p-3 rounded-md border border-blue-200">
                <p className="font-medium mb-1">Didn't receive the email?</p>
                <p>Check your spam folder or wait a few minutes and try again.</p>
              </div>
              <Button
                onClick={() => {
                  setEmailSent(false);
                  setEmail("");
                  setMessage(null);
                  setError(null);
                }}
                variant="outline"
                className="w-full"
              >
                Try Different Email
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-sm">
        <Link
          href="/auth/login"
          className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Login
        </Link>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link href="/auth/signup" className="underline underline-offset-4 hover:text-primary transition-colors">
          Sign up
        </Link>
      </div>
    </div>
  );
}