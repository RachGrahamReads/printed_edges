"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, Send, X, CheckCircle, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface HelpButtonProps {
  className?: string;
}

export function HelpButton({ className }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [issue, setIssue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState("");

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !issue.trim()) {
      setSubmitStatus('error');
      setSubmitMessage('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      // Get current user if logged in
      const { data: { user } } = await supabase.auth.getUser();

      const response = await fetch('/api/help/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          issue: issue.trim(),
          userId: user?.id || null,
          userEmail: user?.email || null,
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setSubmitMessage('Thank you! Your report has been sent successfully.');
        setName("");
        setEmail("");
        setIssue("");
        setTimeout(() => {
          setIsOpen(false);
          setSubmitStatus('idle');
          setSubmitMessage("");
        }, 3000);
      } else {
        const data = await response.json();
        setSubmitStatus('error');
        setSubmitMessage(data.error || 'Failed to send report. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting help report:', error);
      setSubmitStatus('error');
      setSubmitMessage('Failed to send report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={className}
      >
        <HelpCircle className="h-4 w-4 mr-2" />
        Need Help?
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="absolute right-2 top-2 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Report an Issue
              </CardTitle>
              <CardDescription>
                Having trouble? Let us know what's happening and we'll get back to you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your name"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your email"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Describe the Issue
                  </label>
                  <textarea
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Please describe what's happening, what you expected to happen, and any error messages you're seeing..."
                    disabled={isSubmitting}
                  />
                </div>

                {submitStatus !== 'idle' && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    submitStatus === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {submitStatus === 'success' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span className="text-sm">{submitMessage}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || !name.trim() || !email.trim() || !issue.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Report
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}