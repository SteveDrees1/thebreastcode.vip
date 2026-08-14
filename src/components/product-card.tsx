import Link from "next/link";
import type { Product } from "@/db/schema";
import { formatPrice } from "@/lib/stripe";

export function ProductCard({ product, owned }: { product: Product; owned?: boolean }) {
  return (
    <Link
      href={`/catalog/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:border-accent"
    >
      <div className="aspect-[3/4] overflow-hidden bg-accent-soft">
        {product.coverImageUrl ? (
          // Covers come from the public bucket; plain <img> keeps this a
          // server component with no image-optimisation round trip.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center font-serif text-lg text-accent">
            {product.title}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-medium leading-snug">{product.title}</h3>
        {product.subtitle ? (
          <p className="text-sm text-ink-soft">{product.subtitle}</p>
        ) : null}
        <div className="mt-auto pt-3 text-sm">
          {owned ? (
            <span className="font-medium text-accent">In your library</span>
          ) : (
            <span className="font-medium">
              {formatPrice(product.priceCents, product.currency)}
            </span>
          )}
          {product.pageCount ? (
            <span className="text-ink-soft"> · {product.pageCount} pages</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
