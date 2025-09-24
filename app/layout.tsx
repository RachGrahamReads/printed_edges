import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Printed Edges - Add Gilded Edges to Your PDFs",
  description: "Transform your PDFs with beautiful gilded edges. Perfect for print-on-demand books, journals, and professional documents. Upload your PDF and choose from stunning edge designs.",
  keywords: ["PDF", "gilded edges", "print on demand", "book design", "PDF processing", "edge effects"],
  authors: [{ name: "Printed Edges" }],
  openGraph: {
    title: "Printed Edges - Add Gilded Edges to Your PDFs",
    description: "Transform your PDFs with beautiful gilded edges. Perfect for print-on-demand books, journals, and professional documents.",
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
    title: "Printed Edges - Add Gilded Edges to Your PDFs",
    description: "Transform your PDFs with beautiful gilded edges. Perfect for print-on-demand books.",
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
