"use client";

import { HowToGuideLink } from "@/components/how-to-guide-link";

interface HowToGuideLinkWrapperProps {
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "lg";
}

export function HowToGuideLinkWrapper({ variant = "ghost", size = "sm" }: HowToGuideLinkWrapperProps) {
  return <HowToGuideLink variant={variant} size={size} />;
}