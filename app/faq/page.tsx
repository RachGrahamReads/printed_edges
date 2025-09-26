"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

export default function FAQPage() {
  const [openSections, setOpenSections] = useState<number[]>([]);

  const toggleSection = (index: number) => {
    setOpenSections(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const faqs = [
    {
      category: "Getting Started",
      questions: [
        {
          q: "Can I print in colour?",
          a: "Yes! If you want your edges to pop in colour, make sure to choose white paper when printing through Amazon."
        },
        {
          q: "What is \"bleed\"?",
          a: "Bleed is the extra part of the page that gets trimmed during printing. It makes sure your image goes all the way to the edge so there's no unexpected white strip."
        },
        {
          q: "What's the difference between \"Add Bleed\" and \"Has Bleed\"?",
          a: "\"Add Bleed\" is for PDFs that don't have print bleed and need it added. \"Has Bleed\" is for PDFs that already include the proper bleed margins for printing. If you don't already have images that go right to the edges in your file, you likely will need to \"Add Bleed.\""
        }
      ]
    },
    {
      category: "Amazon KDP & Printing",
      questions: [
        {
          q: "Do I need to do anything special when uploading to Amazon?",
          a: "Just a couple of small things: Tick the box that says \"This file has bleed\" when you upload your PDF. If you want colour edges, select colour printing. That's it! Easy peasy."
        },
        {
          q: "Will this cost me extra when printing?",
          a: "The edge itself is included in your normal print cost. If you choose colour edges, Amazon charges a little more for colour printing. You can check their pricing calculator to see the difference."
        },
        {
          q: "Will Amazon always print my edges perfectly?",
          a: "Amazon usually does a great job, but sometimes trimming can be a little uneven. That's why we highly recommend ordering a proof copy first — and get to see your design in real life before going live!"
        },
        {
          q: "What will the printed edges look like?",
          a: "The print-on-demand edges print onto the page itself, so that it's visible from the outside edge when the book is closed. This means that the images extend into the book, and will be seen as lines in the margins of your book (depending on your design). Here's an example:",
          image: "/help/printed_edges_interior.png"
        },
        {
          q: "Do the edge images have to extend so far into the page margins?",
          a: "We have printed into the \"safety zone\" described by Amazon, to make sure that they don't trim off the entire edge image during trimming. We may revisit this and offer narrower margin printing later, with enough proof that Amazon won't cut too far in the printing process, but for now, we're playing it safe with this printed edge margin zone."
        }
      ]
    },
    {
      category: "Design & Files",
      questions: [
        {
          q: "Why can't I print images on the top and bottom edges?",
          a: "Right now, images on the top and bottom edges can get a bit blurry because of the way pages shift in printing. For now, only block colours are available for those edges, but they still look amazing!"
        },
        {
          q: "What types of books work best?",
          a: "Any book can use edge designs! Thicker books have more room for images, but every book gets a fun, special look."
        },
        {
          q: "When should I add the edge design?",
          a: "It's best to add your edge design at the final step, after your book is fully formatted and proofread."
        },
        {
          q: "What file type do I need?",
          a: "We need your book in PDF format. Make sure it's the final, formatted interior, as your edges will be designed to suit this PDF size and number of pages. The edge image should be in JPG or PNG format (PNG if you have a transparent background - see \"Why use a transparent background?\" in the help guide)."
        }
      ]
    },
    {
      category: "File Storage & Privacy",
      questions: [
        {
          q: "What happens to my uploaded files?",
          a: "Your PDFs are processed securely and stored temporarily only as needed for processing. While your edge images are stored for regeneration, your PDFs are not."
        },
        {
          q: "Do I keep all rights to my book and images?",
          a: "Absolutely! You own your book and your designs. We're just here to help make your edges look fabulous."
        }
      ]
    },
    {
      category: "Regeneration & Credits",
      questions: [
        {
          q: "How long can I reuse my edge image?",
          a: "Your edge image sticks around for 60 days! Regenerate your PDF as many times as you like during that time — perfect for tweaking your book before publishing."
        },
        {
          q: "What if I make changes to my book file?",
          a: "No worries! Simply upload your updated PDF and reuse your saved edge image (within 60 days). Your edits won't affect the image you already created. Just make sure that your document remains the same dimensions and number of pages."
        },
        {
          q: "What if I delete my edge image?",
          a: "Once it's deleted, it can't be restored. 😢 You'll need to buy a new credit if you want that same design again."
        },
        {
          q: "Do credits expire?",
          a: "Yes, credits expire two years after purchasing."
        }
      ]
    },
    {
      category: "Payment & Support",
      questions: [
        {
          q: "What payment methods do you accept?",
          a: "We accept all major credit cards and debit cards through our secure Stripe payment processing."
        },
        {
          q: "Can I get a refund?",
          a: "If you're not happy with your order or something didn't turn out right, please get in touch."
        },
        {
          q: "What if something goes wrong?",
          a: "Don't stress — we've got your back. Just send us a quick email at hello@rachgrahamreads.com and we'll help you out."
        }
      ]
    }
  ];

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
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-gray-600 text-lg">Everything you need to know about Printed Edges</p>
        </div>

        {/* FAQ Content */}
        <div className="space-y-8">
          {faqs.map((category, categoryIndex) => (
            <div key={categoryIndex} className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-semibold text-gray-900">{category.category}</h2>
              </div>

              <div className="divide-y divide-gray-200">
                {category.questions.map((faq, faqIndex) => {
                  const globalIndex = categoryIndex * 100 + faqIndex;
                  const isOpen = openSections.includes(globalIndex);

                  return (
                    <div key={faqIndex}>
                      <button
                        className="w-full text-left p-6 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 transition-colors"
                        onClick={() => toggleSection(globalIndex)}
                      >
                        <div className="flex justify-between items-center">
                          <h3 className="text-lg font-medium text-gray-900 pr-4">
                            {faq.q}
                          </h3>
                          {isOpen ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-6 pb-6">
                          <p className="text-gray-700 leading-relaxed">
                            {faq.a}
                          </p>
                          {faq.image && (
                            <div className="mt-4">
                              <img
                                src={faq.image}
                                alt={faq.q}
                                className="rounded border max-w-full h-auto"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Contact Section */}
        <div className="mt-16 text-center">
          <div className="bg-blue-50 rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Still have questions?</h2>
            <p className="text-gray-700 mb-6">
              Can't find the answer you're looking for? We're here to help.
            </p>
            <a
              href="mailto:hello@rachgrahamreads.com"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <Link href="/" className="hover:text-gray-800">Home</Link>
            <Link href="/terms" className="hover:text-gray-800">Terms of Service</Link>
            <Link href="/dashboard" className="hover:text-gray-800">Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}