import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { legal, legalValue } from "@/lib/legal";
import { DOWNLOAD_LOG_RETENTION_DAYS } from "@/lib/retention";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${brand.name} collects, why, who it is shared with, how long it is kept, and the rights you have over it.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/**
 * Privacy policy.
 *
 * Every claim about what is stored was read off `src/db/schema.ts` rather than
 * copied from a template — a policy that describes data you do not hold, or
 * omits data you do, is the failure mode that matters. The specific things
 * this app stores that a generic policy would miss:
 *
 *   - `download_logs.ip_hash` and `admin_audit_log.ip_hash` are SHA-256 salted
 *     with AUTH_SECRET, never raw addresses (see src/lib/audit.ts)
 *   - `users.referral_code`, and `referrals` linking one account to another
 *   - `admin_audit_log.actor_email`, snapshotted rather than referenced
 *   - no password is ever stored: sign-in is an emailed link
 *
 * Not legal advice, not reviewed by a lawyer. See LEGAL.md.
 */
export default function PrivacyPage() {
  const sections: LegalSection[] = [
    {
      title: "Who is responsible for your data",
      paragraphs: [
        `${legalValue(legal.entityName)}, registration ${legalValue(legal.registrationNumber)}, of ${legalValue(legal.address)}, is the controller of the personal data described here.`,
        `For anything about your data, including the requests described below, write to ${legalValue(legal.privacyEmail)}.`,
      ],
    },
    {
      title: "What we collect",
      paragraphs: [
        "Your email address, because it is how you sign in and how we send receipts and download links. We never store a password — there isn’t one. Signing in sends a single-use link to your inbox.",
        "A display name and avatar URL, only if a sign-in method provides them. Both may be empty.",
        "Your purchases and entitlements: which guides you bought or were given, when, through what route (purchase, bundle, promo code, referral reward or a manual grant), and whether access has expired or been revoked.",
        "Subscription status, if you have an all-access plan, and the Stripe customer identifier that links your account to your billing records.",
        "A referral code for your account, and — if you were referred, or you referred somebody — a record connecting the two accounts so rewards can be counted.",
        "A log of downloads: which guide, when, how you were entitled to it, your browser’s user-agent string, and your IP address stored only as a salted SHA-256 hash. We do not keep raw IP addresses in that log.",
        "If you are an administrator, an audit record of changes you make in the console, including your email address at the time and a hashed IP address.",
      ],
    },
    {
      title: "What we do not collect",
      paragraphs: [
        "We do not store card numbers. Card details go straight to Stripe and never touch our servers.",
        "There is no analytics, no advertising, and no third-party tracking script on this site. We do not build a profile of you, we do not sell data, and nothing here is used for automated decision-making.",
      ],
    },
    {
      title: "Why we are allowed to use it",
      paragraphs: [
        "To perform our contract with you: your account, your purchases, your entitlements and the delivery of the files you paid for. Without this data we cannot sell you anything or let you download it.",
        "To comply with a legal obligation: keeping records of sales and tax for the period the law requires.",
        "For our legitimate interests: keeping the service secure and preventing abuse. The download log exists so that one account being shared with hundreds of people is detectable — that is why the IP address is hashed rather than stored, since we need to recognise a repeat, not identify a person.",
        "Where we rely on legitimate interests, you can object; see your rights below.",
      ],
    },
    {
      title: "Cookies",
      paragraphs: [
        "We set one cookie: a session cookie that keeps you signed in after you click a sign-in link. It is strictly necessary for the site to work, so it does not require consent and there is no cookie banner.",
        "We set no analytics, advertising or tracking cookies. Stripe may set its own cookies on Stripe’s checkout pages, which are governed by Stripe’s privacy policy rather than this one.",
      ],
    },
    {
      title: "Who else processes it",
      paragraphs: [
        "We use a small number of service providers, each of which processes data only on our instructions:",
        ...legal.processors.map(
          (p) => `${legalValue(p.name)} — ${p.purpose}. Data involved: ${p.data}.`,
        ),
        "Some of these providers operate outside the UK and EEA. Where data is transferred, it is done under the safeguards the provider offers, typically Standard Contractual Clauses. Confirm the current position with each provider before relying on this.",
      ],
    },
    {
      title: "How long we keep it",
      paragraphs: [
        "Account and purchase records are kept for as long as you have an account, and afterwards for as long as tax and accounting law requires us to keep records of a sale — commonly six years, depending on where we are established.",
        `Download logs are operational security data. They are kept for ${DOWNLOAD_LOG_RETENTION_DAYS} days and then deleted, not kept indefinitely.`,
        "Administrator audit records are kept for as long as the account they concern, because their point is being able to reconstruct who changed what.",
        "When a retention period ends, records are deleted or irreversibly anonymised.",
      ],
    },
    {
      title: "Your rights",
      paragraphs: [
        "You can ask for a copy of the personal data we hold about you, and for it in a portable form.",
        "You can ask us to correct anything inaccurate — you can change your name yourself from your account.",
        "You can ask us to delete your account and personal data. We will do that, except where we are required to keep a record of a sale for tax purposes; in that case we keep the minimum and delete the rest. Deleting your account ends access to your library, including guides you bought.",
        "You can object to processing based on legitimate interests, and ask us to restrict processing while a disagreement is resolved.",
        `Write to ${legalValue(legal.privacyEmail)}. We will respond within one month. If you are not satisfied, you can complain to your local data protection authority — in the UK, the Information Commissioner’s Office.`,
      ],
    },
    {
      title: "Security",
      paragraphs: [
        "The PDFs sit in a private bucket that is never publicly readable. A download is served as a signed link that expires within minutes, issued only after we check you are entitled to the file.",
        "Traffic is encrypted in transit. Administrative access is restricted, separated into read-only and read-write roles, and every change is recorded.",
        "No system is perfectly secure. If we ever suffer a breach that is likely to put your rights at risk, we will tell you and the relevant authority within the time the law requires.",
      ],
    },
    {
      title: "Children",
      paragraphs: [
        "This is a shop for reference material and is not directed at children. We do not knowingly collect data from anyone under 16. If you believe we have, tell us and we will delete it.",
      ],
    },
    {
      title: "Changes to this policy",
      paragraphs: [
        `We will update this page when what we do changes, and the date at the top will tell you when. It was last updated on ${legal.lastUpdated}. If a change materially affects you, we will tell you by email rather than relying on you noticing.`,
      ],
    },
  ];

  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy policy"
      lastUpdated={legal.lastUpdated}
      intro={
        <>
          What we collect, why, and what you can ask us to do about it. See also our{" "}
          <Link href="/terms" className="text-copper underline">
            terms of sale
          </Link>
          .
        </>
      }
      sections={sections}
    />
  );
}
