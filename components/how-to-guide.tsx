"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Info, Eye, Download, RefreshCw, ImageIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface HowToGuideProps {
  className?: string;
}

export function HowToGuide({ className }: HowToGuideProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedTip, setExpandedTip] = useState<string | null>(null);

  const steps = [
    {
      number: 1,
      title: "Upload your completed PDF",
      content: "Make sure your book is fully formatted and proofread before uploading.",
      image: "/help/upload_pdf",
      icon: <Download className="h-4 w-4" />
    },
    {
      number: 2,
      title: "If your document already has bleed, select \"My document already has bleed\". Otherwise, leave blank.",
      content: "",
      image: "/help/bleed_button",
      infoTip: "bleed",
      icon: <Info className="h-4 w-4" />
    },
    {
      number: 3,
      title: "Create your side edge image based on the specified size",
      content: "",
      image: "/help/image_size",
      infoTip: "create-image",
      icon: <ImageIcon className="h-4 w-4" />
    },
    {
      number: 4,
      title: "Upload your side edge image",
      content: "",
      image: "/help/upload_image",
      icon: <Download className="h-4 w-4" />
    },
    {
      number: 5,
      title: "Choose top & bottom edge colours (optional)",
      content: "",
      image: "/help/select_colours",
      infoTip: "colors",
      icon: <Eye className="h-4 w-4" />
    },
    {
      number: 6,
      title: "Select your edge image scaling mode",
      content: "",
      image: "/help/edge_scaling",
      infoTip: "scaling",
      icon: <RefreshCw className="h-4 w-4" />
    },
    {
      number: 7,
      title: "Click \"Preview Design\"",
      content: "",
      image: "/help/preview_design",
      icon: <Eye className="h-4 w-4" />
    },
    {
      number: 8,
      title: "Adjust if needed",
      content: "If it doesn't look right, try a different scaling mode and preview again.",
      image: null,
      icon: <RefreshCw className="h-4 w-4" />
    },
    {
      number: 9,
      title: "Process your PDF",
      content: "Click \"Process PDF.\" Larger books may take a few minutes.",
      image: "/help/preview_design",
      icon: <RefreshCw className="h-4 w-4" />
    },
    {
      number: 10,
      title: "Download your finished PDF",
      content: "It's ready to upload to Amazon KDP! Remember to select \"My document has bleed\" when uploading to KDP.",
      image: "/help/download_pdf",
      infoTip: "kdp",
      icon: <Download className="h-4 w-4" />
    },
    {
      number: 11,
      title: "(Optional) Re-generate your design",
      content: "Head to your Dashboard anytime in the next 60 days to regenerate updated PDFs (as long as the number of pages + dimensions haven't changed).",
      image: null,
      icon: <RefreshCw className="h-4 w-4" />
    }
  ];

  const helpTips = {
    bleed: {
      title: "What is bleed?",
      content: "Bleed is a little extra space that makes sure your image prints right to the edge of the page. If you already have images in your book that go right to the edge, you most likely have bleed already included (and should tick the box saying \"My document already has bleed\"). If you don't have any images in your book, it's unlikely that bleed will already be included (and you should leave this box unticked)."
    },
    "create-image": {
      title: "How do I create an image?",
      content: `Upload your PDF, and we will give you the exact size image for your edge design.

We recommend using Canva to design your image. It's free and easy to use. However, you can create your image in any image editing program you like.

If using Canva, you'll need to create a free account (or paid, if you want to use a transparent background – see "Why use a transparent background?")

Create a new design, and select "Custom size". Input the provided dimensions, with the unit as px (pixels), and create the new design.

Keep your image simple: bold lines, simple designs, and block colours will look the best.

Remember that the top and bottom will get trimmed off slightly. You can download the template to see the bleed zone (that will get trimmed off) and buffer/safety zone (that may get trimmed).

Save as an image (jpeg, or png – must be png if using a transparent background) and upload this to the Printed Edge Generator by clicking "Choose file" under the "Side Edge Image" step.`
    },
    transparent: {
      title: "Why use a transparent background?",
      content: `Note: This section is only relevant if you already have images and bleed in your PDF.

If you have white background in your uploaded edge image, these will be printed as white into the bleed and safety buffer zone, which will override your existing images in this area. You will need to use a transparent background, and a PNG file type, if you do not want this to happen.

Examples:
PDF with existing background, showing both transparent and non-transparent backgrounds on edge design images:`,
      images: ["/help/transparent", "/help/nontransparent"],
      imageLabels: ["Transparent background (recommended)", "Non-transparent background (overrides existing images)"]
    },
    colors: {
      title: "Selecting top and bottom edge colours",
      content: "If you would like your top and bottom edges to be coloured, choose or enter your colour from the drop down/colour selector box. You can use the eye dropper to select a colour from your edge image, once you click \"Preview Design.\""
    },
    scaling: {
      title: "Edge image scaling modes",
      content: `If you have sized your image correctly, there should be no need to select an edge image scaling mode, as it will fit perfectly onto your edge.

However, if you are intentionally using an off-size image, you may find the following scaling modes beneficial:

• Fill (Recommended): Scales your image to perfectly fit the required dimensions. May crop parts of the image but ensures optimal coverage.

• Fit: Shows your entire image without cropping, but may leave gaps if proportions don't match.

• None: Uses your image at original size with no scaling - best for images already sized correctly.

• Stretch: Uses your entire image but may distort proportions to fit the exact dimensions needed. Best for abstract patterns or gradients where distortion won't be noticeable.

• Extend Sides: Centres your image and extends the edge pixels to fill any gaps. Good for solid colours or simple gradients.`
    },
    kdp: {
      title: "Printing with bleed on KDP",
      content: `When uploading your document to KDP, you need to select "Bleed (PDF only)" under "Print Options" on the second page (just above where you upload your manuscript). Your trim size remains whatever your original trim size was (e.g. 5 x 8 in).`,
      image: "/help/kdp_bleed"
    }
  };

  const toggleTip = (tipKey: string) => {
    setExpandedTip(expandedTip === tipKey ? null : tipKey);
  };

  const scrollToHelpTip = (tipKey: string) => {
    // First expand the guide if it's not already expanded
    if (!isExpanded) {
      setIsExpanded(true);
      // Wait for the expansion animation to complete
      setTimeout(() => {
        const tipElement = document.querySelector(`[data-help-tip="${tipKey}"]`);
        if (tipElement) {
          tipElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Then expand the specific tip
          setTimeout(() => {
            setExpandedTip(tipKey);
          }, 300);
        }
      }, 300);
    } else {
      // If already expanded, just scroll and expand the tip
      const tipElement = document.querySelector(`[data-help-tip="${tipKey}"]`);
      if (tipElement) {
        tipElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setExpandedTip(tipKey);
      }
    }
  };

  if (!isExpanded) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                How to Create Your Printed Edge PDF
              </CardTitle>
              <CardDescription>
                Step-by-step guide to adding beautiful edges to your book
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-2"
            >
              View Guide
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              How to Create Your Printed Edge PDF
            </CardTitle>
            <CardDescription>
              Follow these simple steps to add beautiful edges to your book
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-2"
          >
            Hide Guide
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-4 p-4 border rounded-lg">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  {step.number}
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <h3 className="font-medium flex items-center gap-2">
                  {step.title}
                  {step.infoTip && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => scrollToHelpTip(step.infoTip!)}
                      className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  )}
                </h3>

                {step.content && (
                  <p className="text-gray-600 text-sm">{step.content}</p>
                )}

                {step.image && (
                  <div className="mt-2">
                    <Image
                      src={step.image}
                      alt={`Step ${step.number}`}
                      width={400}
                      height={200}
                      className="rounded border max-w-full h-auto"
                    />
                  </div>
                )}

                {/* Special case for step 11 */}
                {step.number === 11 && (
                  <div className="text-sm">
                    <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 underline">
                      Dashboard
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Help Tips Section */}
        <div className="border-t pt-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            Help Guides
          </h2>

          <div className="space-y-3">
            {Object.entries(helpTips).map(([key, tip]) => (
              <div key={key} className="border rounded-lg" data-help-tip={key}>
                <Button
                  variant="ghost"
                  onClick={() => toggleTip(key)}
                  className="w-full p-4 text-left justify-between h-auto"
                >
                  <span className="font-medium">{tip.title}</span>
                  {expandedTip === key ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>

                {expandedTip === key && (
                  <div className="px-4 pb-4 border-t bg-gray-50">
                    <div className="pt-3 space-y-3">
                      {tip.content.split('\n\n').map((paragraph, index) => (
                        <p key={index} className="text-sm text-gray-700 whitespace-pre-line">
                          {paragraph}
                        </p>
                      ))}
                      {tip.image && (
                        <div className="mt-3">
                          <Image
                            src={tip.image}
                            alt={tip.title}
                            width={400}
                            height={200}
                            className="rounded border max-w-full h-auto"
                          />
                        </div>
                      )}
                      {tip.images && (
                        <div className="mt-3 space-y-3">
                          {tip.images.map((image, index) => (
                            <div key={index}>
                              {tip.imageLabels && tip.imageLabels[index] && (
                                <p className="text-sm font-medium text-gray-700 mb-2">
                                  {tip.imageLabels[index]}
                                </p>
                              )}
                              <Image
                                src={image}
                                alt={`${tip.title} - ${tip.imageLabels ? tip.imageLabels[index] : `Image ${index + 1}`}`}
                                width={400}
                                height={200}
                                className="rounded border max-w-full h-auto"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pt-6 border-t">
          <Link href="/create">
            <Button size="lg" className="w-full sm:w-auto">
              Get Started Now
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}