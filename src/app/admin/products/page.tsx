import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/stripe";
import { toggleProductFeaturedAction, toggleProductStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sets" };

const STATUS_TONE: Record<string, string> = {
  published: "text-copper",
  draft: "text-muted",
  archived: "text-faint",
};

export default async function AdminProductsPage() {
  await requireAdmin();

  const all = await db.select().from(products).orderBy(desc(products.createdAt));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label label-copper">Catalog</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Sets</h2>
        </div>
        <p className="text-sm text-muted">
          {all.length} total · add new ones with{" "}
          <code className="font-mono text-xs text-copper">npm run import:product</code>
        </p>
      </div>

      <hr className="rule mt-5 mb-2" />

      {all.length === 0 ? (
        <p className="py-8 text-sm text-muted">
          No sets yet. Import a PDF to get started.
        </p>
      ) : (
        <ul>
          {all.map((product) => (
            <li
              key={product.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/products/${product.id}`}
                  className="font-display font-medium transition hover:text-copper"
                >
                  {product.title}
                </Link>
                <p className="label mt-1 truncate">
                  {product.slug}
                  {product.sourceDocId ? ` · ${product.sourceDocId}` : ""}
                  {product.pageCount ? ` · ${product.pageCount}p` : ""}
                  {product.coverImageUrl ? " · cover" : " · no cover"}
                </p>
              </div>

              <span className="font-display font-semibold tabular-nums">
                {formatPrice(product.priceCents, product.currency)}
              </span>

              {/* Quick toggles: the common edits should not need a form page. */}
              <form action={toggleProductFeaturedAction}>
                <input type="hidden" name="id" value={product.id} />
                <button
                  type="submit"
                  className={`label transition hover:text-copper ${
                    product.featured ? "label-copper" : ""
                  }`}
                  aria-label={`${product.featured ? "Unfeature" : "Feature"} ${product.title}`}
                >
                  {product.featured ? "★ featured" : "☆ feature"}
                </button>
              </form>

              <form action={toggleProductStatusAction}>
                <input type="hidden" name="id" value={product.id} />
                <button
                  type="submit"
                  className={`label transition hover:text-copper ${
                    STATUS_TONE[product.status] ?? ""
                  }`}
                  aria-label={`Set ${product.title} to ${
                    product.status === "published" ? "draft" : "published"
                  }`}
                >
                  {product.status}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
