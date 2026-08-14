import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bundleItems, bundles, products } from "@/db/schema";
import { formatPrice } from "@/lib/stripe";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Bundles",
  description: "Related guides grouped together and priced below the sum of their parts.",
};

export default async function BundlesPage() {
  const published = await db
    .select()
    .from(bundles)
    .where(eq(bundles.status, "published"))
    .orderBy(desc(bundles.publishedAt));

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
      <header className="max-w-2xl">
        <h1 className="font-serif text-3xl">Bundles</h1>
        <p className="mt-3 text-ink-soft">
          Buy a set together and pay less than you would for the guides individually.
        </p>
      </header>

      {published.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line p-10 text-center text-ink-soft">
          No bundles published yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {published.map((bundle) => {
            const contents = byBundle.get(bundle.id) ?? [];
            const fullPrice = contents.reduce((sum, i) => sum + i.priceCents, 0);
            const saving = fullPrice - bundle.priceCents;

            return (
              <Link
                key={bundle.id}
                href={`/bundles/${bundle.slug}`}
                className="flex flex-col rounded-xl border border-line bg-surface p-6 transition hover:border-accent"
              >
                <h2 className="font-serif text-xl">{bundle.title}</h2>
                {bundle.subtitle ? (
                  <p className="mt-1 text-sm text-ink-soft">{bundle.subtitle}</p>
                ) : null}

                <ul className="mt-4 flex-1 space-y-1 text-sm text-ink-soft">
                  {contents.map((item) => (
                    <li key={item.title}>· {item.title}</li>
                  ))}
                </ul>

                <p className="mt-5 text-lg font-medium">
                  {formatPrice(bundle.priceCents, bundle.currency)}
                  {saving > 0 ? (
                    <span className="ml-2 text-sm font-normal text-ink-soft">
                      save {formatPrice(saving, bundle.currency)}
                    </span>
                  ) : null}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
