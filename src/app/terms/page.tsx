import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { legal, legalValue } from "@/lib/legal";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Terms of sale",
  description: `The terms on which ${brand.name} sells and licenses its PDF guides, including delivery, refunds and the right to cancel.`,
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

/**
 * Terms of sale.
 *
 * Written to cover what a distance sale of digital content to a consumer
 * actually has to cover: who is selling, what the licence permits, price and
 * tax, how delivery happens, the statutory right to cancel *and the waiver
 * that removes it*, subscription renewal and cancellation, and liability.
 *
 * Two things about the cancellation section are load-bearing rather than
 * decorative. Under the EU Consumer Rights Directive and the UK Consumer
 * Contracts Regulations a consumer normally has 14 days to cancel; that right
 * is only lost for digital content if the customer gave **express prior
 * consent** to immediate delivery **and acknowledged** losing it. The checkout
 * session collects exactly that (see api/checkout/route.ts), and the wording
 * here is what it points at. Change one and you must change the other.
 *
 * This is not legal advice and has not been reviewed by a lawyer. See
 * LEGAL.md.
 */
export default function TermsPage() {
  const sections: LegalSection[] = [
    {
      title: "Who you are buying from",
      paragraphs: [
        `These guides are sold by ${legalValue(legal.entityName)} (“we”, “us”), registration ${legalValue(legal.registrationNumber)}, at ${legalValue(legal.address)}. VAT registration: ${legalValue(legal.vatNumber)}.`,
        `${brand.name} is the trading name for the storefront at ${brand.domain}. You can reach us at ${legalValue(legal.contactEmail)}, and we aim to answer within a few working days.`,
        "By placing an order you agree to these terms. Please read the cancellation section before you buy — it affects a right you would otherwise have.",
      ],
    },
    {
      title: "What you are buying, and what you may do with it",
      paragraphs: [
        "Each purchase grants you a personal, non-exclusive, non-transferable licence to download the PDF and use it for your own purposes, including your own commercial work. You may print as many copies as you need for yourself or your business.",
        "You may not redistribute, resell, sublicense, publish or share the files, or make them available on a network where others can download them. You may not strip or alter identifying marks. The copyright in the guides stays with us; you are buying a licence to use them, not ownership of them.",
        "If you need a licence for a team, a classroom or a company, contact us — that is a different licence and we are happy to arrange one.",
      ],
    },
    {
      title: "Price, tax and payment",
      paragraphs: [
        "Prices are shown per item on the catalog. Any VAT, GST or sales tax that applies is calculated at checkout from the billing address you give, and is shown to you before you pay.",
        "Payment is taken by Stripe. We never see or store your full card details. Your receipt comes from Stripe to the email address on your account.",
        "If a price is displayed incorrectly through an obvious error, we may cancel the order and refund you in full rather than supply at the wrong price. We will tell you if that happens.",
      ],
    },
    {
      title: "Delivery and access",
      paragraphs: [
        "Delivery is immediate: as soon as payment succeeds the guide appears in your library and can be downloaded. Download links are generated fresh each time and expire after a few minutes, so use the library rather than saving a link.",
        "Guides bought individually or in a bundle stay in your library indefinitely, subject to these terms. Guides you can read because of an all-access plan are available for as long as that plan is active — if it lapses, access to those guides ends, but anything you bought outright stays.",
        "We may update a guide after you have bought it. Updates to a guide you own are included at no extra cost.",
      ],
    },
    {
      title: "Your right to cancel, and why buying waives it",
      important: true,
      paragraphs: [
        "If you are a consumer in the UK or the EU, you normally have 14 days to cancel a distance purchase and get a refund, without giving a reason.",
        "Digital content delivered immediately is the exception. When you buy, you are asked to agree that we may start delivering straight away, and to acknowledge that by doing so you lose your right to cancel. You have to tick that box for the purchase to complete — we record it, and Stripe records it too.",
        "If you would rather keep the 14-day right, do not complete the purchase; contact us instead and we will arrange delivery after the period ends.",
        "None of this affects your rights if a guide is faulty, not as described, or not what we said it was. Those rights cannot be waived and are dealt with below.",
      ],
    },
    {
      title: "Refunds",
      paragraphs: [
        "If a guide is faulty, corrupted, materially not as described, or you cannot download it and we cannot fix that, you are entitled to a remedy — normally a replacement or a refund. Tell us what went wrong and we will put it right.",
        "Outside that, because the files are delivered immediately and cannot be returned, we handle refund requests case by case. We would rather resolve a problem than argue about it, so ask.",
        "A refunded purchase is removed from your library, and the licence above ends. You must delete any copies you have kept.",
      ],
    },
    {
      title: "Subscriptions",
      paragraphs: [
        "An all-access plan renews automatically at the interval shown when you subscribe, at the price shown, until you cancel. We will take payment on each renewal using the payment method on file.",
        "You can cancel at any time from your account, which takes you to Stripe’s billing portal. Cancelling stops future renewals; it does not refund the period you are in, and you keep access until that period ends.",
        "If we change the price of a plan, we will tell you before it takes effect and you will have the chance to cancel first.",
      ],
    },
    {
      title: "Promotional codes and referrals",
      paragraphs: [
        "Promo codes may be limited by number of uses, by expiry date, or to one use per person, and cannot be exchanged for cash. We may withdraw a code at any time, though we will honour one already redeemed.",
        "Referral rewards are earned when someone signs up through your link and verifies their email. Creating accounts to refer yourself, or using automated means to generate sign-ups, forfeits the rewards and may close the account.",
      ],
    },
    {
      title: "Your account",
      paragraphs: [
        "You sign in with a link sent to your email address, so keeping that mailbox secure keeps your account secure. Tell us promptly if you think someone else has access.",
        "Your library is personal to you. Sharing your account so other people can download guides is the same as redistributing the files, and we may suspend an account we believe is being used that way. We log downloads — with IP addresses stored only as a salted hash — to spot that pattern, and for no other purpose.",
      ],
    },
    {
      title: "Availability",
      paragraphs: [
        "We try to keep the site available but we do not promise uninterrupted service. We may take it down for maintenance, and we may withdraw a guide from sale — if we do, it stays in the library of everyone who already bought it.",
      ],
    },
    {
      title: "Our liability",
      paragraphs: [
        "The guides are reference material. They are prepared with care, but you are responsible for how you apply them, and for checking anything safety-critical against the standards, tools and materials you are actually using.",
        "Nothing in these terms limits our liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be limited — including your statutory rights as a consumer.",
        "Subject to that, our total liability for any claim connected with a purchase is limited to the amount you paid for it.",
      ],
    },
    {
      title: "Changes to these terms",
      paragraphs: [
        `We may update these terms. The version that applies to a purchase is the one published when you made it. The date at the top of this page shows when it last changed; it was last updated on ${legal.lastUpdated}.`,
      ],
    },
    {
      title: "Law and disputes",
      paragraphs: [
        `These terms are governed by ${legalValue(legal.jurisdiction)}.`,
        "If you are a consumer, you keep the benefit of any mandatory protections of the country you live in, and you can bring proceedings in your local courts.",
        `If something has gone wrong, please contact us first at ${legalValue(legal.contactEmail)} — most things are quicker to fix directly.`,
      ],
    },
  ];

  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of sale"
      lastUpdated={legal.lastUpdated}
      intro={
        <>
          The terms on which we sell and license these guides. See also our{" "}
          <Link href="/privacy" className="text-copper underline">
            privacy policy
          </Link>
          , which explains what we do with your data.
        </>
      }
      sections={sections}
    />
  );
}
