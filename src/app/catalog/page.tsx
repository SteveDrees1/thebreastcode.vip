import type { Metadata } from "next";
import { auth } from "@/auth";
import { ownedProductIds } from "@/lib/entitlements";
import { getPublishedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

// Rendered per request: the header and buy state depend on the session, so
// this route reads cookies and cannot be prerendered. Data caching lives in
// lib/catalog.ts, which keeps the database out of the hot path.

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Every reference plate set available to buy individually or read with all-access.",
  alternates: { canonical: "/catalog" },
};

export default async function CatalogPage() {
  const session = await auth();
  const [owned, all] = await Promise.all([
    ownedProductIds(session?.user?.id),
    getPublishedProducts(),
  ]);

  return (
    <div>
      <header>
        <p className="label label-copper">Index</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Catalog</h1>
        <p className="mt-3 max-w-xl text-muted">
          {all.length === 0
            ? "Nothing published yet — check back soon."
            : `${all.length} set${all.length === 1 ? "" : "s"} available. Every plate prints full-bleed on US Letter.`}
        </p>
      </header>

      <hr className="rule mt-6 mb-9" />

      {all.length === 0 ? (
        <p className="panel reg p-12 text-center text-muted">
          No sets published yet.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* The cards carry h3 headings; without this the page would jump
              straight from h1 to h3 and break the heading outline. */}
          <h2 className="sr-only">All plate sets</h2>
          {all.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              owned={owned.has(product.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
