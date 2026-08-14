import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

/**
 * Placeholder terms. Replace with text reviewed for your jurisdiction before
 * taking real payments — in particular the refund and EU/UK digital-goods
 * withdrawal-right wording.
 */
export default function TermsPage() {
  return (
    <div className="prose-basic mx-auto max-w-prose">
      <h1 className="font-serif text-3xl">Terms of sale</h1>

      <h2 className="mt-8 font-serif text-xl">What you are buying</h2>
      <p className="text-ink-soft">
        Each purchase grants you a personal, non-transferable licence to download and
        use the PDF for your own use. You may print copies for yourself. You may not
        redistribute, resell, or publish the files.
      </p>

      <h2 className="mt-6 font-serif text-xl">Access</h2>
      <p className="text-ink-soft">
        Guides bought individually or in a bundle remain in your library indefinitely.
        Guides available through an all-access plan remain readable for as long as that
        plan is active.
      </p>

      <h2 className="mt-6 font-serif text-xl">Refunds</h2>
      <p className="text-ink-soft">
        Because these are digital downloads, refunds are handled case by case. Contact
        us and describe the problem. A refunded purchase is removed from your library.
      </p>

      <h2 className="mt-6 font-serif text-xl">Tax</h2>
      <p className="text-ink-soft">
        Prices are shown excluding tax. Any VAT or sales tax due is calculated at
        checkout based on your billing location and shown before you pay.
      </p>
    </div>
  );
}
