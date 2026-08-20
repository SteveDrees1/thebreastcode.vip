import type { Metadata } from "next";
import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/auth";
import { ownedProductIds } from "@/lib/entitlements";
import { getPublishedProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";

// Rendered per request: the header and buy state depend on the session, so
// this route reads cookies and cannot be prerendered. Data caching lives in
// lib/catalog.ts, which keeps the database out of the hot path.

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const session = await auth();
  const owned = await ownedProductIds(session?.user?.id);

  const [featured, latest, [{ value: total }]] = await Promise.all([
    getPublishedProducts({ featuredOnly: true, limit: 4 }),
    getPublishedProducts({ limit: 8 }),
    db
      .select({ value: count() })
      .from(products)
      .where(eq(products.status, "published")),
  ]);

  // Show featured sets first, then top the row up with the newest ones. Flagging
  // a single product should not leave a lone card in a four-column grid.
  const shelf = [
    ...featured,
    ...latest.filter((p) => !featured.some((f) => f.id === p.id)),
  ].slice(0, 4);

  return (
    <div className="flex flex-col gap-24">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative">
        <p className="label label-copper">Original Reference Series</p>

        <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
          Reference plates
          <br />
          <span className="text-copper">built for the shop.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Dimensioned diagrams, spec tables keyed to real stock, and working notes —
          on print-ready plates designed to laminate and keep at the bench.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/catalog" className="btn btn-primary">
            Browse the catalog
          </Link>
          <Link href="/pricing" className="btn btn-ghost">
            Get all-access
          </Link>
        </div>

        {/* Spec strip — the footer bar from the plates, reused as a stat row. */}
        <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
          {[
            { k: "Sets published", v: total > 0 ? String(total).padStart(2, "0") : "—" },
            { k: "Format", v: "US Letter" },
            { k: "Scale", v: "N.T.S." },
            { k: "Print", v: "Full bleed" },
          ].map((stat) => (
            <div key={stat.k} className="bg-surface px-5 py-4">
              <dt className="label">{stat.k}</dt>
              <dd className="mt-1.5 font-display text-lg font-semibold">{stat.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Shelf ──────────────────────────────────────────────────────── */}
      {shelf.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="label label-copper">
                {featured.length > 0 ? "Featured" : "Latest"}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
                {featured.length > 0 ? "Featured sets" : "Latest sets"}
              </h2>
            </div>

            <Link
              href="/catalog"
              className="label transition hover:text-copper"
              aria-label="View the full catalog"
            >
              View all →
            </Link>
          </div>

          <hr className="rule mt-5 mb-8" />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <section className="panel reg p-12 text-center">
          <p className="font-display text-lg font-semibold">No sets published yet.</p>
          <p className="mt-2 text-sm text-muted">
            Import a PDF and set its status to{" "}
            <code className="font-mono text-copper">published</code> to see it here.
          </p>
        </section>
      )}

      {/* ── Value props ────────────────────────────────────────────────── */}
      <section>
        <p className="label label-copper">Why buy here</p>
        <hr className="rule mt-4 mb-8" />

        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              n: "01",
              title: "Yours to keep",
              body: "A purchased set stays in your library permanently — including revisions to that edition.",
            },
            {
              n: "02",
              title: "Series bundles",
              body: "Related sets are grouped and priced below the sum of their parts.",
            },
            {
              n: "03",
              title: "Refer and earn",
              body: "Share your link. Every few sign-ups earns you a free set of your choice.",
            },
          ].map((item) => (
            <div key={item.n} className="panel reg rise p-6">
              <span className="label label-copper">{item.n}</span>
              <h3 className="mt-3 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
