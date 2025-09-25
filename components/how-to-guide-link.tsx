"use client";

import { Button } from "@/components/ui/button";

interface HowToGuideLinkProps {
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "lg";
}

export function HowToGuideLink({ variant = "ghost", size = "sm" }: HowToGuideLinkProps) {
  const scrollToGuide = () => {
    const guideElement = document.querySelector('[data-guide="how-to"]');
    if (guideElement) {
      guideElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Button variant={variant} size={size} onClick={scrollToGuide}>
      How-To Guide
    </Button>
  );
}