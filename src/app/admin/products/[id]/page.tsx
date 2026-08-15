import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { centsToInput, requireConsole } from "@/lib/admin";
import { saveProductAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireConsole();

  const { id } = await params;
  const { saved, error } = await searchParams;

  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) notFound();

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-6">
        <Link href="/admin/products" className="label transition hover:text-copper">
          ← Sets
        </Link>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label label-copper">Edit set</p>
          <h2 className="mt-2 truncate font-display text-2xl font-bold tracking-tight">
            {product.title}
          </h2>
        </div>
        <Link href={`/catalog/${product.slug}`} className="label transition hover:text-copper">
          View on site →
        </Link>
      </div>

      {saved ? (
        <p role="status" className="panel mt-5 border-copper/40 p-3 text-sm text-copper">
          Saved. The catalog cache has been refreshed.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="panel mt-5 border-copper/40 p-3 text-sm text-copper">
          {error}
        </p>
      ) : null}

      <fieldset
        disabled={!user.isAdmin}
        className="contents"
        aria-label={user.isAdmin ? undefined : "Read-only: you cannot change these"}
      >
      <form action={saveProductAction} className="mt-7 flex flex-col gap-6">
        <input type="hidden" name="id" value={product.id} />

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Title</span>
            <input
              name="title"
              defaultValue={product.title}
              required
              maxLength={200}
              className="field mt-2"
            />
          </label>

          <label className="block">
            <span className="label">Price (USD)</span>
            <input
              name="price"
              defaultValue={centsToInput(product.priceCents)}
              required
              inputMode="decimal"
              className="field mt-2 tabular-nums"
            />
          </label>
        </div>

        <label className="block">
          <span className="label">Subtitle</span>
          <input
            name="subtitle"
            defaultValue={product.subtitle ?? ""}
            maxLength={300}
            className="field mt-2"
          />
        </label>

        <label className="block">
          <span className="label">Description</span>
          <span className="mt-1 block text-xs text-faint">
            Blank line between paragraphs.
          </span>
          <textarea
            name="description"
            defaultValue={product.description}
            rows={10}
            maxLength={8000}
            className="field mt-2 font-sans leading-relaxed"
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Status</span>
            <select name="status" defaultValue={product.status} className="field mt-2">
              <option value="draft">draft — hidden from the catalog</option>
              <option value="published">published — live</option>
              <option value="archived">archived — retired</option>
            </select>
          </label>

          <fieldset className="flex flex-col justify-center gap-3">
            <legend className="label mb-1">Flags</legend>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={product.featured}
                className="size-4 accent-copper"
              />
              Featured on the home page
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="includedInSubscription"
                defaultChecked={product.includedInSubscription}
                className="size-4 accent-copper"
              />
              Included with all-access
            </label>
          </fieldset>
        </div>

        {/* Read-only facts that come from the import pipeline, shown so the
            operator can confirm what is actually wired up. */}
        <div className="panel p-5">
          <p className="label label-copper">From the file</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[
              { k: "Slug", v: product.slug },
              { k: "Plates", v: product.pageCount ? String(product.pageCount) : "—" },
              {
                k: "Size",
                v: product.fileSizeBytes
                  ? `${(product.fileSizeBytes / 1_048_576).toFixed(1)} MB`
                  : "—",
              },
              { k: "Doc id", v: product.sourceDocId ?? "—" },
            ].map((row) => (
              <div key={row.k}>
                <dt className="label">{row.k}</dt>
                <dd className="mt-0.5 truncate font-mono text-xs">{row.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-faint">
            These come from the PDF itself. Re-run{" "}
            <code className="font-mono text-copper">npm run import:product</code> to
            change them, or{" "}
            <code className="font-mono text-copper">npm run make:cover</code> to
            regenerate the cover.
          </p>
        </div>

        {user.isAdmin ? (
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
            <Link href="/admin/products" className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        ) : null}
      </form>
      </fieldset>
    </div>
  );
}
