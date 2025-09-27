import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16 mt-16">
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
        <Link href="/terms" className="hover:text-foreground/80 transition-colors">
          Terms of Service
        </Link>
        <Link href="/faq" className="hover:text-foreground/80 transition-colors">
          FAQ
        </Link>
        <span className="text-muted-foreground">
          © {new Date().getFullYear()} Printed Edges
        </span>
      </div>
    </footer>
  );
}