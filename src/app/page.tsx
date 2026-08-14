import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/auth";
import { ownedProductIds } from "@/lib/entitlements";
import { ProductCard } from "@/components/product-card";

// The storefront is mostly static; revalidate hourly so a newly published PDF
// appears without a redeploy.
export const revalidate = 3600;

export default async function HomePage() {
  const session = await auth();
  const owned = await ownedProductIds(session?.user?.id);

  const featured = await db
    .select()
    .from(products)
    .where(and(eq(products.status, "published"), eq(products.featured, true)))
    .orderBy(desc(products.publishedAt))
    .limit(4);

  const latest = await db
    .select()
    .from(products)
    .where(eq(products.status, "published"))
    .orderBy(desc(products.publishedAt))
    .limit(8);

  const shelf = featured.length > 0 ? featured : latest;

  return (
    <div className="flex flex-col gap-16">
      <section className="max-w-2xl">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
          Practical guides, delivered as PDFs you keep.
        </h1>
        <p className="mt-5 text-lg text-ink-soft">
          Every guide is a fixed-layout PDF built for printing and for reading on a
          screen. Buy one, save with a bundle, or read the whole library with
          all-access.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/catalog"
            className="rounded-full bg-accent px-6 py-2.5 font-medium text-white"
          >
            Browse the catalog
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-line px-6 py-2.5 font-medium"
          >
            See all-access
          </Link>
        </div>
      </section>

      {shelf.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">
            {featured.length > 0 ? "Featured guides" : "Latest guides"}
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {shelf.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                owned={owned.has(product.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-10 text-center text-ink-soft">
          <p className="font-medium text-ink">No guides published yet.</p>
          <p className="mt-2 text-sm">
            Add products to the database and set their status to{" "}
            <code className="rounded bg-accent-soft px-1.5 py-0.5">published</code> to
            see them here.
          </p>
        </section>
      )}

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            title: "Yours to keep",
            body: "A purchased guide stays in your library permanently, including future revisions of that edition.",
          },
          {
            title: "Bundles that save",
            body: "Related guides are grouped into bundles priced below the sum of their parts.",
          },
          {
            title: "Refer and earn",
            body: "Share your link. Every few friends who sign up earns you a free guide of your choice.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-line bg-surface p-6">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-2 text-sm text-ink-soft">{item.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
