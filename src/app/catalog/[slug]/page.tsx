import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements";
import { formatPrice } from "@/lib/stripe";
import { CheckoutButton } from "@/components/checkout-button";

export const revalidate = 3600;

/** Pre-render every published product at build time for fast, indexable pages. */
export async function generateStaticParams() {
  try {
    const rows = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.status, "published"));
    return rows.map((r) => ({ slug: r.slug }));
  } catch {
    // No database at build time (e.g. a preview build without secrets) — fall
    // back to rendering on demand.
    return [];
  }
}

async function getProduct(slug: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  return product;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug).catch(() => undefined);
  if (!product) return { title: "Not found" };

  return {
    title: product.title,
    description: product.subtitle ?? product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.subtitle ?? undefined,
      images: product.coverImageUrl ? [product.coverImageUrl] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || product.status !== "published") notFound();

  const session = await auth();
  const via = await resolveAccess(session?.user?.id, product.id);

  return (
    <article className="grid gap-10 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div>
        <div className="overflow-hidden rounded-xl border border-line bg-accent-soft">
          {product.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.coverImageUrl} alt="" className="w-full object-cover" />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center p-8 text-center font-serif text-2xl text-accent">
              {product.title}
            </div>
          )}
        </div>

        <div className="mt-5">
          {via !== "none" ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm text-ink-soft">
                {via === "subscription"
                  ? "Included with your all-access plan."
                  : "You own this guide."}
              </p>
              <a
                href={`/api/download/${product.id}`}
                className="mt-3 block rounded-full bg-accent px-5 py-2.5 text-center font-medium text-white"
              >
                Download PDF
              </a>
            </div>
          ) : (
            <>
              <p className="mb-3 text-2xl font-medium">
                {formatPrice(product.priceCents, product.currency)}
              </p>
              <CheckoutButton kind="product" slug={product.slug} label="Buy this guide" />
              {product.includedInSubscription ? (
                <p className="mt-3 text-sm text-ink-soft">
                  Or read it — and everything else — with{" "}
                  <Link href="/pricing" className="text-accent underline">
                    all-access
                  </Link>
                  .
                </p>
              ) : null}
            </>
          )}

          {product.samplePdfUrl ? (
            <a
              href={product.samplePdfUrl}
              className="mt-3 block rounded-full border border-line px-5 py-2.5 text-center font-medium"
              target="_blank"
              rel="noreferrer"
            >
              Read a free sample
            </a>
          ) : null}
        </div>
      </div>

      <div>
        <h1 className="font-serif text-3xl leading-tight">{product.title}</h1>
        {product.subtitle ? (
          <p className="mt-2 text-lg text-ink-soft">{product.subtitle}</p>
        ) : null}

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-y border-line py-4 text-sm">
          {product.pageCount ? (
            <div>
              <dt className="text-ink-soft">Pages</dt>
              <dd className="font-medium">{product.pageCount}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-ink-soft">Format</dt>
            <dd className="font-medium">PDF</dd>
          </div>
          {product.fileSizeBytes ? (
            <div>
              <dt className="text-ink-soft">Size</dt>
              <dd className="font-medium">
                {(product.fileSizeBytes / 1_048_576).toFixed(1)} MB
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="prose-basic mt-6 max-w-prose text-ink-soft">
          {product.description.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
    </article>
  );
}
