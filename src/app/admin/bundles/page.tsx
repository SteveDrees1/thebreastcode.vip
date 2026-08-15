import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bundleItems, bundles } from "@/db/schema";
import { requireConsole } from "@/lib/admin";
import { formatPrice } from "@/lib/stripe";
import { createBundleAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bundles" };

export default async function AdminBundlesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireConsole();
  const { error } = await searchParams;

  const all = await db
    .select({
      id: bundles.id,
      title: bundles.title,
      slug: bundles.slug,
      priceCents: bundles.priceCents,
      currency: bundles.currency,
      status: bundles.status,
      items: count(bundleItems.productId),
    })
    .from(bundles)
    .leftJoin(bundleItems, eq(bundleItems.bundleId, bundles.id))
    .groupBy(bundles.id)
    .orderBy(desc(bundles.createdAt));

  return (
    <div className="flex flex-col gap-12">
      <section>
        <p className="label label-copper">Series</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Bundles</h2>

        <hr className="rule mt-5 mb-2" />

        {all.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            No bundles yet. Create one below, then add sets to it.
          </p>
        ) : (
          <ul>
            {all.map((bundle) => (
              <li
                key={bundle.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/bundles/${bundle.id}`}
                    className="font-display font-medium transition hover:text-copper"
                  >
                    {bundle.title}
                  </Link>
                  <p className="label mt-1">
                    {bundle.slug} · {bundle.items} set{bundle.items === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="font-display font-semibold tabular-nums">
                  {formatPrice(bundle.priceCents, bundle.currency)}
                </span>
                <span
                  className={`label ${bundle.status === "published" ? "label-copper" : ""}`}
                >
                  {bundle.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {user.isAdmin ? (
      <section>
        <p className="label label-copper">New bundle</p>
        <hr className="rule mt-4 mb-6" />

        {error ? (
          <p role="alert" className="panel mb-5 border-copper/40 p-3 text-sm text-copper">
            {error}
          </p>
        ) : null}

        <form action={createBundleAction} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Title</span>
              <input name="title" required maxLength={200} className="field mt-2" />
            </label>
            <label className="block">
              <span className="label">Slug</span>
              <input
                name="slug"
                required
                maxLength={120}
                pattern="[a-z0-9\-]+"
                placeholder="complete-woodworking-series"
                className="field mt-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="label">Subtitle</span>
            <input name="subtitle" maxLength={300} className="field mt-2" />
          </label>

          <label className="block">
            <span className="label">Description</span>
            <textarea name="description" rows={4} maxLength={8000} className="field mt-2 font-sans" />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Price (USD)</span>
              <input
                name="price"
                required
                inputMode="decimal"
                placeholder="29.00"
                className="field mt-2 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="label">Status</span>
              <select name="status" defaultValue="draft" className="field mt-2">
                <option value="draft">draft</option>
                <option value="published">published</option>
              </select>
            </label>
          </div>

          <p className="text-xs text-faint">
            Create the bundle first, then add sets to it on the next screen.
          </p>

          <div>
            <button type="submit" className="btn btn-primary">
              Create bundle
            </button>
          </div>
        </form>
      </section>
      ) : null}
    </div>
  );
}
