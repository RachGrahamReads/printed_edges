"use client";

import { HowToGuide } from "@/components/how-to-guide";
import { useEffect, useRef } from "react";

interface HowToGuideWrapperProps {
  className?: string;
}

export function HowToGuideWrapper({ className }: HowToGuideWrapperProps) {
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if there's a hash in the URL for a specific help tip
    const hash = window.location.hash;
    if (hash === '#help-transparent') {
      // Scroll to the guide wrapper first
      guideRef.current?.scrollIntoView({ behavior: 'smooth' });
      // Then trigger the expansion and scroll to specific tip
      setTimeout(() => {
        const event = new CustomEvent('expandHelpTip', { detail: 'transparent' });
        window.dispatchEvent(event);
      }, 500);
    }
  }, []);

  return (
    <div ref={guideRef} id="how-to-guide" data-guide="how-to">
      <HowToGuide className={className} />
    </div>
  );
}