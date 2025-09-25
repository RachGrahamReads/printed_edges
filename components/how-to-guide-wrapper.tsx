"use client";

import { HowToGuide } from "@/components/how-to-guide";

interface HowToGuideWrapperProps {
  className?: string;
}

export function HowToGuideWrapper({ className }: HowToGuideWrapperProps) {
  return <HowToGuide className={className} />;
}