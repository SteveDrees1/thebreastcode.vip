/**
 * /llms.txt — the llmstxt.org convention.
 *
 * A concise, curated map of the site for language models, in the place they
 * look for it. Generated from the database rather than hand-written so it
 * cannot drift from the catalog the way a static file would: publish a set and
 * it appears here on the next revalidation.
 *
 * Deliberately links only to pages a model may usefully read — public catalog
 * and bundle pages. The customer area is excluded for the same reason it is in
 * robots.txt: those pages are per-person and mean nothing without a session.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bundles, products } from "@/db/schema";
import { env } from "@/lib/env";

// Regenerate hourly. A model reading a slightly stale map is fine; hitting the
// database on every crawl is not.
export const revalidate = 3600;

/** Collapse prose to a single line so each entry stays one bullet. */
function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export async function GET() {
  const base = env.siteUrl;

  let published: Array<{ slug: string; title: string; blurb: string; price: number }> = [];
  let published_bundles: Array<{ slug: string; title: string; blurb: string }> = [];

  try {
    const [productRows, bundleRows] = await Promise.all([
      db
        .select({
          slug: products.slug,
          title: products.title,
          subtitle: products.subtitle,
          description: products.description,
          priceCents: products.priceCents,
        })
        .from(products)
        .where(eq(products.status, "published"))
        .orderBy(desc(products.publishedAt)),
      db
        .select({
          slug: bundles.slug,
          title: bundles.title,
          subtitle: bundles.subtitle,
          description: bundles.description,
        })
        .from(bundles)
        .where(eq(bundles.status, "published"))
        .orderBy(desc(bundles.publishedAt)),
    ]);

    published = productRows.map((p) => ({
      slug: p.slug,
      title: p.title,
      blurb: oneLine(p.subtitle || p.description || ""),
      price: p.priceCents,
    }));
    published_bundles = bundleRows.map((b) => ({
      slug: b.slug,
      title: b.title,
      blurb: oneLine(b.subtitle || b.description || ""),
    }));
  } catch {
    // A map missing its catalog beats a 500 when the database is briefly away.
  }

  const money = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      cents / 100,
    );

  const body = `# The Breast Code

> Print-ready reference plate sets sold as PDFs. Each set is a fixed-layout
> document of dimensioned diagrams, spec tables keyed to real stock, and working
> notes, designed to print full-bleed on US Letter and laminate for shop use.

Sets can be bought individually and kept permanently, grouped into discounted
series bundles, or read in full with an all-access subscription. Prices exclude
tax, which is calculated at checkout from the buyer's location.

## Catalog

${
  published.length > 0
    ? published
        .map(
          (p) =>
            `- [${p.title}](${base}/catalog/${p.slug}) (${money(p.price)}): ${p.blurb || "Reference plate set."}`,
        )
        .join("\n")
    : "- No sets published yet."
}

## Bundles

${
  published_bundles.length > 0
    ? published_bundles
        .map(
          (b) =>
            `- [${b.title}](${base}/bundles/${b.slug}): ${b.blurb || "A series of related plate sets."}`,
        )
        .join("\n")
    : "- No bundles published yet."
}

## Key pages

- [Catalog](${base}/catalog): every published set.
- [Bundles](${base}/bundles): series priced below the sum of their parts.
- [All-access](${base}/pricing): subscription covering the whole library.
- [Terms of sale](${base}/terms): licence, access, refunds and tax.

## Notes

- The PDFs themselves are not public. Downloads are authorised per request and
  served as short-lived signed links, so there is nothing to crawl behind a
  product page.
- Customer pages (library, account, referrals, redeem, sign-in) are excluded
  here and in robots.txt: they are per-person and meaningless without a session.
- Sitemap: ${base}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
