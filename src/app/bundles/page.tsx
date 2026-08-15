import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bundleItems, products } from "@/db/schema";
import { getPublishedBundles } from "@/lib/catalog";
import { formatPrice } from "@/lib/stripe";

// Rendered per request: the header and buy state depend on the session, so
// this route reads cookies and cannot be prerendered. Data caching lives in
// lib/catalog.ts, which keeps the database out of the hot path.

export const metadata: Metadata = {
  title: "Bundles",
  description:
    "Related plate sets grouped into a series and priced below the sum of their parts.",
  alternates: { canonical: "/bundles" },
};

export default async function BundlesPage() {
  const published = await getPublishedBundles();

  // One round trip for the contents of every bundle on the page.
  const items =
    published.length > 0
      ? await db
          .select({
            bundleId: bundleItems.bundleId,
            title: products.title,
            priceCents: products.priceCents,
          })
          .from(bundleItems)
          .innerJoin(products, eq(products.id, bundleItems.productId))
          .where(
            inArray(
              bundleItems.bundleId,
              published.map((b) => b.id),
            ),
          )
      : [];

  const byBundle = new Map<string, typeof items>();
  for (const item of items) {
    const list = byBundle.get(item.bundleId) ?? [];
    list.push(item);
    byBundle.set(item.bundleId, list);
  }

  return (
    <div>
      <header>
        <p className="label label-copper">Series</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Bundles</h1>
        <p className="mt-3 max-w-xl text-muted">
          Buy a series together and pay less than you would for the sets individually.
        </p>
      </header>

      <hr className="rule mt-6 mb-9" />

      {published.length === 0 ? (
        <p className="panel reg p-12 text-center text-muted">
          No bundles published yet.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {published.map((bundle, i) => {
            const contents = byBundle.get(bundle.id) ?? [];
            const fullPrice = contents.reduce((sum, item) => sum + item.priceCents, 0);
            const saving = fullPrice - bundle.priceCents;

            return (
              <Link
                key={bundle.id}
                href={`/bundles/${bundle.slug}`}
                className="panel reg sheen rise flex flex-col p-6 transition-colors duration-300 hover:border-line-bright"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="label label-copper">
                    Series {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="label">{contents.length} sets</span>
                </div>

                <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">
                  {bundle.title}
                </h2>
                {bundle.subtitle ? (
                  <p className="mt-1.5 text-sm text-muted">{bundle.subtitle}</p>
                ) : null}

                <ul className="mt-5 flex-1 space-y-2">
                  {contents.map((item) => (
                    <li
                      key={item.title}
                      className="flex items-baseline gap-3 text-sm text-muted"
                    >
                      <span aria-hidden className="h-px w-3 bg-copper" />
                      {item.title}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex items-baseline gap-3 border-t border-line pt-4">
                  <span className="font-display text-2xl font-bold">
                    {formatPrice(bundle.priceCents, bundle.currency)}
                  </span>
                  {saving > 0 ? (
                    <span className="label label-copper">
                      save {formatPrice(saving, bundle.currency)}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
