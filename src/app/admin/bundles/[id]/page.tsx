import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray, not } from "drizzle-orm";
import { db } from "@/db";
import { bundleItems, bundles, products } from "@/db/schema";
import { centsToInput, requireAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/stripe";
import {
  addBundleItemAction,
  removeBundleItemAction,
  saveBundleAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminBundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string; error?: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const { saved, created, error } = await searchParams;

  const [bundle] = await db.select().from(bundles).where(eq(bundles.id, id)).limit(1);
  if (!bundle) notFound();

  const contents = await db
    .select({
      id: products.id,
      title: products.title,
      priceCents: products.priceCents,
      currency: products.currency,
      status: products.status,
    })
    .from(bundleItems)
    .innerJoin(products, eq(products.id, bundleItems.productId))
    .where(eq(bundleItems.bundleId, bundle.id))
    .orderBy(asc(bundleItems.position));

  const containedIds = contents.map((c) => c.id);
  const available = await db
    .select({ id: products.id, title: products.title, status: products.status })
    .from(products)
    .where(
      containedIds.length > 0 ? not(inArray(products.id, containedIds)) : undefined,
    )
    .orderBy(asc(products.title));

  const fullPrice = contents.reduce((sum, c) => sum + c.priceCents, 0);
  const saving = fullPrice - bundle.priceCents;

  return (
    <div className="flex flex-col gap-12">
      <div>
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link href="/admin/bundles" className="label transition hover:text-copper">
            ← Bundles
          </Link>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="label label-copper">Edit bundle</p>
            <h2 className="mt-2 truncate font-display text-2xl font-bold tracking-tight">
              {bundle.title}
            </h2>
          </div>
          <Link
            href={`/bundles/${bundle.slug}`}
            className="label transition hover:text-copper"
          >
            View on site →
          </Link>
        </div>

        {created ? (
          <p role="status" className="panel mt-5 border-copper/40 p-3 text-sm text-copper">
            Bundle created. Add sets to it below.
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="panel mt-5 border-copper/40 p-3 text-sm text-copper">
            Saved.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="panel mt-5 border-copper/40 p-3 text-sm text-copper">
            {error}
          </p>
        ) : null}
      </div>

      {/* ── Contents ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="label label-copper">Contents</p>
          {contents.length > 0 ? (
            <p className="text-sm text-muted tabular-nums">
              {formatPrice(fullPrice, bundle.currency)} separately ·{" "}
              <span className={saving > 0 ? "text-copper" : "text-muted"}>
                {saving > 0
                  ? `saves ${formatPrice(saving, bundle.currency)}`
                  : "no saving at this price"}
              </span>
            </p>
          ) : null}
        </div>

        <hr className="rule mt-4 mb-2" />

        {contents.length === 0 ? (
          <p className="py-5 text-sm text-muted">
            Empty. A bundle with no sets will show as empty on the storefront.
          </p>
        ) : (
          <ul>
            {contents.map((item, i) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3"
              >
                <span className="label label-copper w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                {item.status !== "published" ? (
                  <span className="label">{item.status}</span>
                ) : null}
                <span className="font-display text-sm font-semibold tabular-nums">
                  {formatPrice(item.priceCents, item.currency)}
                </span>
                <form action={removeBundleItemAction}>
                  <input type="hidden" name="bundleId" value={bundle.id} />
                  <input type="hidden" name="productId" value={item.id} />
                  <button
                    type="submit"
                    className="label transition hover:text-copper"
                    aria-label={`Remove ${item.title} from this bundle`}
                  >
                    remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 ? (
          <form action={addBundleItemAction} className="mt-5 flex flex-wrap gap-3">
            <input type="hidden" name="bundleId" value={bundle.id} />
            <label htmlFor="add-product" className="sr-only">
              Add a set
            </label>
            <select id="add-product" name="productId" required className="field flex-1">
              <option value="">Add a set…</option>
              {available.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                  {product.status !== "published" ? ` (${product.status})` : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-ghost">
              Add
            </button>
          </form>
        ) : null}
      </section>

      {/* ── Details ───────────────────────────────────────────────────── */}
      <section>
        <p className="label label-copper">Details</p>
        <hr className="rule mt-4 mb-6" />

        <form action={saveBundleAction} className="flex flex-col gap-5">
          <input type="hidden" name="id" value={bundle.id} />

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Title</span>
              <input
                name="title"
                defaultValue={bundle.title}
                required
                maxLength={200}
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="label">Slug</span>
              <input
                name="slug"
                defaultValue={bundle.slug}
                required
                maxLength={120}
                pattern="[a-z0-9\-]+"
                className="field mt-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="label">Subtitle</span>
            <input
              name="subtitle"
              defaultValue={bundle.subtitle ?? ""}
              maxLength={300}
              className="field mt-2"
            />
          </label>

          <label className="block">
            <span className="label">Description</span>
            <textarea
              name="description"
              defaultValue={bundle.description}
              rows={5}
              maxLength={8000}
              className="field mt-2 font-sans leading-relaxed"
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Price (USD)</span>
              <input
                name="price"
                defaultValue={centsToInput(bundle.priceCents)}
                required
                inputMode="decimal"
                className="field mt-2 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="label">Status</span>
              <select name="status" defaultValue={bundle.status} className="field mt-2">
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <Link href="/admin/bundles" className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
