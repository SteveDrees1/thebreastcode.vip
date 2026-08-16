/**
 * The facts the legal pages depend on, in one place.
 *
 * These are deliberately *not* invented. A terms page naming a company that
 * does not exist, or a privacy policy giving an address nobody can serve
 * notice at, is worse than no page at all — it is a false statement on a
 * document customers are entitled to rely on.
 *
 * So every value a lawyer or a company registration would supply is a marked
 * placeholder. `TODO_LEGAL` makes them greppable, `unfilledLegal()` finds them
 * at runtime, and `scripts/verify-legal.ts` fails if any survive into a
 * production build. Fill them in before taking real payments.
 *
 * Nothing here is legal advice. See LEGAL.md for what still needs review.
 */

/** Marks a value that must be replaced before launch. */
export const TODO_LEGAL = "TODO_LEGAL:" as const;
const todo = (what: string) => `${TODO_LEGAL}${what}`;

export const legal = {
  /**
   * The party that actually sells. Not necessarily the brand name — the brand
   * is "Datum Press"; the seller is whatever entity is registered, and consumer
   * law cares about the latter.
   */
  entityName: todo("registered legal entity name"),
  /** Company/registration number, where one exists. */
  registrationNumber: todo("company registration number, or 'sole trader'"),
  /**
   * A postal address is mandatory for distance selling to EU/UK consumers, and
   * Germany requires a full Impressum. A PO box is usually not sufficient.
   */
  address: todo("registered postal address"),
  /** VAT/GST registration, if registered. Shown on invoices. */
  vatNumber: todo("VAT/GST number, or 'not VAT registered'"),

  /** Where customers reach a human. Must be monitored. */
  contactEmail: todo("contact@your-domain"),
  /** Where privacy requests go. May be the same address. */
  privacyEmail: todo("privacy@your-domain"),

  /** Governing law and the courts that hear disputes. */
  jurisdiction: todo("governing law, e.g. 'the laws of England and Wales'"),

  /**
   * Last substantive change. Shown on both documents so a customer can tell
   * which version they agreed to. Update it when you change the text.
   */
  lastUpdated: "2026-08-16",

  /**
   * Third parties that process customer data. This list is factual — it was
   * read off the code, not guessed — but the *named vendors* depend on how you
   * deploy, so confirm before publishing.
   */
  processors: [
    {
      name: "Stripe",
      purpose: "Payments, subscriptions, tax calculation and payment receipts",
      data: "Name, email, billing address, card details (Stripe never shares card numbers with us)",
    },
    {
      name: todo("database host, e.g. Neon"),
      purpose: "Stores your account, purchases and entitlements",
      data: "Account and purchase records",
    },
    {
      name: todo("object storage provider, e.g. Cloudflare R2"),
      purpose: "Stores the PDF files themselves",
      data: "The files; no customer data",
    },
    {
      name: todo("email provider, e.g. Resend"),
      purpose: "Sends sign-in links",
      data: "Email address",
    },
    {
      name: todo("hosting provider, e.g. Vercel"),
      purpose: "Runs the site",
      data: "Request metadata including IP address, in transit",
    },
  ],
} as const;

/**
 * Placeholders still unfilled, as `key: description` strings.
 *
 * Walks the object rather than listing keys by hand, so a placeholder added
 * later cannot be forgotten here.
 */
export function unfilledLegal(source: unknown = legal, path = ""): string[] {
  if (typeof source === "string") {
    return source.startsWith(TODO_LEGAL)
      ? [`${path}: ${source.slice(TODO_LEGAL.length)}`]
      : [];
  }
  if (Array.isArray(source)) {
    return source.flatMap((item, i) => unfilledLegal(item, `${path}[${i}]`));
  }
  if (source && typeof source === "object") {
    return Object.entries(source).flatMap(([key, value]) =>
      unfilledLegal(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/** True when every placeholder has been replaced. */
export function legalIsComplete(): boolean {
  return unfilledLegal().length === 0;
}

/**
 * What to render where a value is still a placeholder.
 *
 * Shows the requirement rather than silently printing "TODO_LEGAL:…", so an
 * unfinished page reads as unfinished to a human instead of looking broken.
 */
export function legalValue(value: string): string {
  return value.startsWith(TODO_LEGAL)
    ? `[${value.slice(TODO_LEGAL.length)} — not yet provided]`
    : value;
}
