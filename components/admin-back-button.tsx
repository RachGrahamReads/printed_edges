"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function AdminBackButton() {
  return (
    <Link href="/admin">
      <Button variant="outline" size="sm" className="mb-6">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Admin Dashboard
      </Button>
    </Link>
  );
}