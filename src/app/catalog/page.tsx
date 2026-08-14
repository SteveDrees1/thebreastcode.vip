import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/auth";
import { ownedProductIds } from "@/lib/entitlements";
import { ProductCard } from "@/components/product-card";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Catalog",
  description: "Every PDF guide available to buy or read with all-access.",
};

export default async function CatalogPage() {
  const session = await auth();
  const owned = await ownedProductIds(session?.user?.id);

  const all = await db
    .select()
    .from(products)
    .where(eq(products.status, "published"))
    .orderBy(desc(products.publishedAt));

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-serif text-3xl">Catalog</h1>
        <p className="mt-3 text-ink-soft">
          {all.length === 0
            ? "Nothing published yet — check back soon."
            : `${all.length} guide${all.length === 1 ? "" : "s"} available.`}
        </p>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {all.map((product) => (
          <ProductCard key={product.id} product={product} owned={owned.has(product.id)} />
        ))}
      </div>
    </div>
  );
}
