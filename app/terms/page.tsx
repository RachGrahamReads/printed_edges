import Link from "next/link";

export const metadata = {
  title: "Terms of Service - Printed Edges",
  description: "Terms of Service and conditions for using Printed Edges PDF processing service",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto py-16 px-8">
        {/* Navigation */}
        <nav className="mb-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Home
          </Link>
        </nav>

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
          <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Content */}
        <div className="prose prose-lg max-w-none">
          <div className="mb-8">
            <p className="mb-4">
              Welcome to the Printed Edge Generator, owned and operated by Rachel Graham (sole trader), based in New Zealand.
              By using this service, you agree to the terms below. Please read them carefully.
            </p>
          </div>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. What this service does</h2>
            <p className="mb-4">The Printed Edge Generator lets you:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Upload your PDF (usually your book file) and an image.</li>
              <li>Generate a new PDF with your image placed on the page edges, so that when printed by Amazon KDP, the design shows on the trimmed book edges.</li>
            </ul>
            <p className="mb-4">
              You must have an account and be logged in to use the service. Processing requires a purchased credit.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Credits and access</h2>
            <ul className="list-disc pl-6 mb-4">
              <li>Each edge design (your uploaded image) requires one credit to create.</li>
              <li>Once you've created an edge design, you can reuse it to process as many PDFs as you like for 60 days, to allow for edits to your book file.</li>
              <li>If you delete your edge image before the 60 days are up, it cannot be restored. You will need to purchase a new credit.</li>
              <li>Your PDFs are not stored. You'll receive a download link at the time of processing.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Using the service properly</h2>
            <ul className="list-disc pl-6 mb-4">
              <li>You may only use this service for its intended purpose: creating printed edge designs for your own book projects.</li>
              <li>You must own the rights to any content (PDFs and images) you upload.</li>
              <li>Don't upload anything illegal, offensive, or infringing on others' rights.</li>
              <li>We recommend selecting "This file has bleed" when uploading to Amazon KDP.</li>
              <li>We strongly suggest ordering a proof copy of your book before publishing to make sure the edge looks the way you want.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Refunds and support</h2>
            <p className="mb-4">
              If you're not happy with your purchase, please contact us at{" "}
              <a href="mailto:hello@rachgrahamreads.com" className="text-blue-600 hover:text-blue-800">
                hello@rachgrahamreads.com
              </a>. Refunds are handled on a case-by-case basis.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Liability</h2>
            <p className="mb-4">
              We do our best to provide a reliable service, but we can't guarantee acceptance by Amazon KDP or that the final print will exactly match your expectations.
            </p>
            <p className="mb-4">
              Our total liability to you is limited to the cost of the credit you purchased for the affected edge design. We're not responsible for indirect losses such as lost profits, sales, or opportunities.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Ending or suspending accounts</h2>
            <p className="mb-4">
              We may suspend or close your account if you misuse the service or break these terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Governing law and disputes</h2>
            <p className="mb-4">
              These terms are governed by the laws of New Zealand. If there's ever a disagreement, we'll try to resolve it informally first.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Privacy Policy</h2>
            <p className="mb-4">
              We respect your privacy and are committed to protecting your personal information.
            </p>
          </section>

          <section className="mb-8">
            <h3 className="text-xl font-semibold mb-4">1. Information we collect</h3>
            <ul className="list-disc pl-6 mb-4">
              <li><strong>Account details:</strong> your name, email address, and login information.</li>
              <li><strong>Payments:</strong> handled securely by Stripe — we don't see or store your card details.</li>
              <li><strong>Uploads:</strong>
                <ul className="list-disc pl-6 mt-2">
                  <li>Images: stored for up to 60 days (unless you delete them sooner).</li>
                  <li>PDFs: not stored — you download them immediately after processing.</li>
                </ul>
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h3 className="text-xl font-semibold mb-4">2. How we use your information</h3>
            <ul className="list-disc pl-6 mb-4">
              <li>To let you create and manage your edge designs.</li>
              <li>To process payments and deliver your files.</li>
              <li>To communicate with you about your account or support requests.</li>
              <li>To improve and maintain the service.</li>
            </ul>
            <p className="mb-4">We don't sell your information to anyone.</p>
          </section>

          <section className="mb-8">
            <h3 className="text-xl font-semibold mb-4">3. Cookies and analytics</h3>
            <p className="mb-4">
              The website may use cookies and analytics tools to help us understand usage and improve the service.
            </p>
          </section>

          <section className="mb-8">
            <h3 className="text-xl font-semibold mb-4">4. Your rights</h3>
            <p className="mb-4">Under New Zealand privacy law, you can:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Request a copy of the personal information we hold about you.</li>
              <li>Ask us to correct or delete your information.</li>
            </ul>
            <p className="mb-4">
              Contact us at{" "}
              <a href="mailto:hello@rachgrahamreads.com" className="text-blue-600 hover:text-blue-800">
                hello@rachgrahamreads.com
              </a>{" "}
              for any privacy requests.
            </p>
          </section>

          <section className="mb-8">
            <h3 className="text-xl font-semibold mb-4">5. Data storage</h3>
            <p className="mb-4">
              We take reasonable steps to keep your data safe. Your information may be stored or processed on servers outside New Zealand, but always with providers who meet privacy and security standards.
            </p>
          </section>

          <section className="mb-8">
            <h3 className="text-xl font-semibold mb-4">6. Changes to this policy</h3>
            <p className="mb-4">
              We may update these terms and policies from time to time. If we make significant changes, we'll let you know via the website or email.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Questions?</h2>
            <p className="mb-4">
              Please contact us at{" "}
              <a href="mailto:hello@rachgrahamreads.com" className="text-blue-600 hover:text-blue-800">
                hello@rachgrahamreads.com
              </a>.
            </p>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <Link href="/" className="hover:text-gray-800">Home</Link>
            <Link href="/faq" className="hover:text-gray-800">FAQ</Link>
            <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}