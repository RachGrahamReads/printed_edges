import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const defaultUrl = process.env.NODE_ENV === 'production'
  ? "https://printed-edges.rachgrahamreads.com"
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Printed Edges - Create Stunning Custom Edges for Your Books",
  description: "Upload your PDF and custom edge designs to create professional print-on-demand books with beautiful decorative edges. Perfect for novels, journals, and special publications.",
  keywords: ["PDF", "custom edges", "print on demand", "book design", "PDF processing", "edge effects", "decorative edges"],
  authors: [{ name: "Printed Edges" }],
  openGraph: {
    title: "Printed Edges - Create Stunning Custom Edges for Your Books",
    description: "Upload your PDF and custom edge designs to create professional print-on-demand books with beautiful decorative edges.",
    url: defaultUrl,
    siteName: "Printed Edges",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Printed Edges - PDF Edge Processing"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Printed Edges - Create Stunning Custom Edges for Your Books",
    description: "Upload your PDF and custom edge designs to create professional print-on-demand books with beautiful decorative edges.",
    images: ["/opengraph-image.png"]
  }
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
