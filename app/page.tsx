import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, FileImage, Zap, Shield } from "lucide-react";
import { HelpButtonWrapper } from "@/components/help-button-wrapper";
import { HowToGuideWrapper } from "@/components/how-to-guide-wrapper";
import { HowToGuideLinkWrapper } from "@/components/how-to-guide-link-wrapper";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto p-8">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 mb-8">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Printed Edges</Link>
            </div>
            <div className="flex gap-4 items-center">
              <Link href="/pricing">
                <Button variant="ghost" size="sm">Pricing</Button>
              </Link>
              <HowToGuideLinkWrapper />
              <HelpButtonWrapper />
              {user ? (
                <Link href="/dashboard">
                  <Button size="sm">Dashboard</Button>
                </Link>
              ) : (
                <AuthButton />
              )}
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Create Stunning Custom Edges for Your Books
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Upload your PDF and custom edge designs to create professional print-on-demand books with beautiful decorative edges.
            Perfect for novels, journals, and special publications.
          </p>

          <div className="flex gap-4 justify-center mb-8">
            {user ? (
              <>
                <Link href="/create">
                  <Button size="lg" className="text-lg px-8 py-3">
                    Try it now
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg" className="text-lg px-8 py-3">
                    Login
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/create">
                  <Button size="lg" className="text-lg px-8 py-3">
                    Try It Now
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="outline" size="lg" className="text-lg px-8 py-3">
                    View Pricing
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-1 text-green-600" />
              No subscriptions
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-1 text-green-600" />
              Unlimited regenerations
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-1 text-green-600" />
              High-quality output
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle>Simple Pay-Per-Use</CardTitle>
              <CardDescription>
                No monthly subscriptions. Pay only for the edge designs you create.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  $39 for 1 edge design
                </li>
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  $99 for 3 edge designs
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                <FileImage className="h-6 w-6 text-purple-600" />
              </div>
              <CardTitle>Professional Quality</CardTitle>
              <CardDescription>
                High-resolution output perfect for print-on-demand services.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  285.7 DPI precision
                </li>
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Automatic bleed handling
                </li>
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Mitred corner support
                </li>
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Ready to upload
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Unlimited Regeneration</CardTitle>
              <CardDescription>
                Once you create an edge design, reprint it as many times as needed within 60 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Reprocess updated PDFs
                </li>
                <li className="flex items-center">
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Perfect for reprints
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Demo Video */}
        <div className="mb-16">
          <div className="max-w-4xl mx-auto">
            <img
              src="/printed_edges_interior.png"
              alt="Printed edges interior demonstration"
              className="w-full rounded-lg shadow-2xl border-4 border-white"
            />
          </div>
        </div>

        {/* How It Works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-8">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-blue-600">1</span>
              </div>
              <h3 className="font-medium mb-2">Purchase Credits</h3>
              <p className="text-sm text-muted-foreground">
                Buy edge design credits - no subscriptions required
              </p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-purple-600">2</span>
              </div>
              <h3 className="font-medium mb-2">Upload Edge Image</h3>
              <p className="text-sm text-muted-foreground">
                Create an edge design using 1 credit with your custom image
              </p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-green-600">3</span>
              </div>
              <h3 className="font-medium mb-2">Process PDFs</h3>
              <p className="text-sm text-muted-foreground">
                Apply your edge design to unlimited PDFs
              </p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-orange-600">4</span>
              </div>
              <h3 className="font-medium mb-2">Download & Print</h3>
              <p className="text-sm text-muted-foreground">
                Get print-ready PDFs with stunning custom edges
              </p>
            </div>
          </div>
        </div>

        {/* Before & After Section */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-8">Transform Your Books</h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4">Turn this:</h3>
              <img
                src="/side_image.png"
                alt="Original side view"
                className="rounded-lg shadow-lg border-2 border-gray-200 max-w-sm max-h-[400px] object-contain"
              />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4">Into this:</h3>
              <img
                src="/edge_side.png"
                alt="Enhanced edge side view"
                className="rounded-lg shadow-lg border-2 border-gray-200 max-w-sm max-h-[400px] object-contain"
              />
            </div>
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-blue-600 mb-2">At the click of a button!</p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-green-800 font-medium">
                📸 Send us a photo of your printed edges, and receive a free credit for your next design!
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="text-center mb-16" id="pricing">
          <h2 className="text-3xl font-bold mb-8">Simple, Transparent Pricing</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Single Image</CardTitle>
                <CardDescription>Perfect for trying out our service</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$39</span>
                  <span className="text-muted-foreground"> one-time</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    1 custom edge design
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    Unlimited PDF processing per design
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    High-quality output
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    Download instantly
                  </li>
                </ul>
                <Link href="/pricing">
                  <Button className="w-full">Get Started</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary">
              <CardHeader className="text-center">
                <Badge className="mb-2">Best Value</Badge>
                <CardTitle className="text-2xl">Three Images</CardTitle>
                <CardDescription>Best for multiple book projects</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$99</span>
                  <span className="text-muted-foreground"> one-time</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    3 custom edge designs
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    Unlimited PDF processing per design
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    High-quality output
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-600 mr-2" />
                    Perfect for series or collections
                  </li>
                </ul>
                <Link href="/pricing">
                  <Button className="w-full">Get Started</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mb-8">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-blue-50 to-purple-50 border-2">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4">Ready to Create Stunning Book Edges?</h2>
              <p className="text-muted-foreground mb-6">
                Join authors and publishers who trust Printed Edges for their custom book production needs.
              </p>
              {user ? (
                <div className="flex gap-4 justify-center">
                  <Link href="/create">
                    <Button size="lg">Try it now</Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button variant="outline" size="lg">Login</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex gap-4 justify-center">
                  <Link href="/create">
                    <Button size="lg">Try It Now</Button>
                  </Link>
                  <Link href="/pricing">
                    <Button variant="outline" size="lg">View Pricing</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* How-to Guide Section */}
        <div className="mb-16">
          <HowToGuideWrapper />
        </div>

        {/* Final Demo Video */}
        <div className="mb-16">
          <div className="max-w-3xl mx-auto">
            <video
              className="w-full rounded-lg shadow-2xl border-4 border-black"
              controls
              muted
              loop
              playsInline
            >
              <source src="/pages_flip.MP4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}