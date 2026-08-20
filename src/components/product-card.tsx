import Link from "next/link";
import type { PublicProduct } from "@/lib/catalog";
import { formatPrice } from "@/lib/stripe";

/**
 * Catalog tile. Uses the plate vocabulary: a document number, a mono spec
 * line, and registration marks that light up on hover.
 */
export function ProductCard({
  product,
  owned,
}: {
  product: PublicProduct;
  owned?: boolean;
}) {
  return (
    <Link
      href={`/catalog/${product.slug}`}
      className="panel reg sheen rise group flex flex-col transition-colors duration-300 hover:border-line-bright"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-t-[13px] bg-surface-2">
        {product.coverImageUrl ? (
          /* Covers are plain <img>: they come from the public bucket already
             sized, so the optimizer would add a hop for no gain. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          /* No cover yet — render a plate-like placeholder rather than a gap. */
          <div className="flex h-full flex-col justify-between p-5">
            <div className="flex items-start justify-between">
              <span className="label">Plate Set</span>
              {/*
                The product's own document number, not its position in this
                list. It used to be `index + 1`, which meant the same set was
                "Plate Set 01" on the home page and "Plate Set 06" on the
                catalog — and the detail page, which has always shown
                `No. {sourceDocId}` in this exact slot, disagreed with both.
                A number printed in the plate's own corner reads as the
                plate's number; it has to be one.
              */}
              {product.sourceDocId ? (
                <span className="label label-copper">
                  No. {product.sourceDocId}
                </span>
              ) : null}
            </div>
            <div>
              <div
                aria-hidden
                className="mb-4 h-px w-10 bg-copper transition-all duration-500 group-hover:w-20"
              />
              <p className="font-display text-xl leading-tight font-bold text-text">
                {product.title}
              </p>
            </div>
            <span className="label">
              {product.pageCount ? `${product.pageCount} plates` : "PDF"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-t border-line p-4">
        <h3 className="font-display leading-snug font-medium">{product.title}</h3>
        {product.subtitle ? (
          <p className="line-clamp-2 text-sm text-muted">{product.subtitle}</p>
        ) : null}

        <div className="mt-auto flex items-baseline justify-between pt-3">
          {owned ? (
            <span className="label label-copper">In your library</span>
          ) : (
            <span className="font-display font-semibold text-text">
              {formatPrice(product.priceCents, product.currency)}
            </span>
          )}
          {product.pageCount ? (
            <span className="label">{product.pageCount}p</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
