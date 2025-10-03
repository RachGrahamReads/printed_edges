"use client";

import { SiteFooter } from "@/components/site-footer";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpButtonWrapper } from "@/components/help-button-wrapper";
import { HowToGuideLinkWrapper } from "@/components/how-to-guide-link-wrapper";
import Image from "next/image";
import { useState } from "react";
import { X } from "lucide-react";

export default function GalleryPage() {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  // Gallery images - add your images to public/gallery/
  const galleryImages = [
    { src: "/gallery/example1.jpg", alt: "Custom edge example 1" },
    { src: "/gallery/example2.jpg", alt: "Custom edge example 2" },
    { src: "/gallery/example3.JPG", alt: "Custom edge example 3" },
    { src: "/gallery/example4.jpg", alt: "Custom edge example 4" },
    { src: "/gallery/example5.png", alt: "Custom edge example 5" },
  ];

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
              <Link href="/gallery">
                <Button variant="ghost" size="sm">Gallery</Button>
              </Link>
              <HowToGuideLinkWrapper />
              <HelpButtonWrapper />
              <Link href="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            </div>
          </div>
        </nav>

        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Gallery
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4">
            Examples of custom printed edges from real books
          </p>
          <p className="text-lg text-gray-900 font-medium max-w-2xl mx-auto">
            Send us a photo of your printed edges to receive a free credit for your next design!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {galleryImages.map((image, index) => (
            <div
              key={index}
              className="relative aspect-square overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-shadow bg-white cursor-pointer"
              onClick={() => setSelectedImage(index)}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
          ))}
        </div>

        {/* Lightbox Modal */}
        {selectedImage !== null && (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <button
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-8 w-8" />
            </button>
            <div className="relative max-w-5xl max-h-[90vh] w-full h-full">
              <Image
                src={galleryImages[selectedImage].src}
                alt={galleryImages[selectedImage].alt}
                fill
                className="object-contain"
                sizes="100vw"
              />
            </div>
          </div>
        )}

        <div className="text-center text-sm text-muted-foreground mb-8">
          <p>
            Note: Print quality can vary. See our{" "}
            <Link href="/faq" className="text-blue-600 hover:underline">
              FAQ
            </Link>{" "}
            for more information.
          </p>
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
