import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of sale",
  alternates: { canonical: "/terms" },
};

/**
 * Placeholder terms. Replace with text reviewed for your jurisdiction before
 * taking real payments — in particular the refund and EU/UK digital-goods
 * withdrawal-right wording.
 */
export default function TermsPage() {
  const sections = [
    {
      n: "01",
      title: "What you are buying",
      body: "Each purchase grants you a personal, non-transferable licence to download and use the PDF for your own use. You may print copies for yourself. You may not redistribute, resell, or publish the files.",
    },
    {
      n: "02",
      title: "Access",
      body: "Sets bought individually or in a bundle remain in your library indefinitely. Sets available through an all-access plan remain readable for as long as that plan is active.",
    },
    {
      n: "03",
      title: "Refunds",
      body: "Because these are digital downloads, refunds are handled case by case. Contact us and describe the problem. A refunded purchase is removed from your library.",
    },
    {
      n: "04",
      title: "Tax",
      body: "Prices are shown excluding tax. Any VAT or sales tax due is calculated at checkout based on your billing location and shown before you pay.",
    },
  ];

  return (
    <div className="mx-auto max-w-prose">
      <p className="label label-copper">Legal</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
        Terms of sale
      </h1>

      <hr className="rule mt-6 mb-2" />

      {sections.map((section) => (
        <section key={section.n} className="border-b border-line py-7">
          <span className="label label-copper">{section.n}</span>
          <h2 className="mt-2.5 font-display text-xl font-semibold">{section.title}</h2>
          <p className="mt-2.5 leading-relaxed text-muted">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
