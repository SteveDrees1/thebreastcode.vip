import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements";
import { getProductBySlug } from "@/lib/catalog";
import { env } from "@/lib/env";
import { formatPrice } from "@/lib/stripe";
import { breadcrumbJsonLd, metaDescription, productJsonLd, safeJsonLd } from "@/lib/seo";
import { CheckoutButton } from "@/components/checkout-button";

/**
 * Rendered per request, not prerendered.
 *
 * This page shows either "Buy" or "Download" depending on who is asking, which
 * means reading the session cookie — and a route that reads cookies cannot also
 * be statically generated. Declaring `generateStaticParams` here alongside an
 * `auth()` call is precisely the contradiction that produces DYNAMIC_SERVER_USAGE.
 *
 * Speed comes from caching the expensive half instead: the product lookup goes
 * through `unstable_cache` (see lib/catalog.ts), so a request costs a React
 * render and no database round trip. The HTML is still fully server-rendered,
 * so crawlers see complete markup.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => undefined);
  if (!product) return { title: "Not found" };

  const description = metaDescription(product.subtitle, product.description);
  return {
    title: product.title,
    description,
    alternates: { canonical: `/catalog/${product.slug}` },
    openGraph: {
      type: "article",
      title: product.title,
      description,
      url: `${env.siteUrl}/catalog/${product.slug}`,
      // No `images` here on purpose: setting it would override the generated
      // card in opengraph-image.tsx. The cover is a 3:4 portrait and crops
      // badly to the 1.91:1 social ratio, so the drawn card wins.
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") notFound();

  const session = await auth();
  const via = await resolveAccess(session?.user?.id, product.id);

  // Product structured data drives price and availability in search results.
  // Shared with the bundle page so both stay in step; the description goes
  // through the same helper as the meta tag, which cannot return empty.
  const jsonLd = productJsonLd({
    name: product.title,
    description: metaDescription(product.subtitle, product.description),
    sku: product.sourceDocId ?? product.slug,
    path: `/catalog/${product.slug}`,
    priceCents: product.priceCents,
    currency: product.currency,
    image: product.coverImageUrl,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Catalog", path: "/catalog" },
              { name: product.title, path: `/catalog/${product.slug}` },
            ]),
          ),
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-8">
        <Link href="/catalog" className="label transition hover:text-copper">
          ← Catalog
        </Link>
      </nav>

      <article className="grid gap-12 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ── Cover + buy ─────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel reg overflow-hidden">
            <div className="aspect-[3/4] bg-surface-2">
              {product.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.coverImageUrl}
                  alt={`Cover of ${product.title}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col justify-between p-7">
                  <div className="flex items-start justify-between">
                    <span className="label">Plate Set</span>
                    {product.sourceDocId ? (
                      <span className="label label-copper">
                        No. {product.sourceDocId}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <div aria-hidden className="mb-5 h-px w-14 bg-copper" />
                    <p className="font-display text-3xl leading-tight font-bold">
                      {product.title}
                    </p>
                  </div>
                  <span className="label">
                    {product.pageCount ? `${product.pageCount} plates` : "PDF"}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5">
            {via !== "none" ? (
              <div className="panel p-5">
                <p className="label label-copper">
                  {via === "subscription" ? "Included with all-access" : "You own this"}
                </p>
                <a
                  href={`/api/download/${product.id}`}
                  className="btn btn-primary mt-4 w-full"
                >
                  Download PDF
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-3xl font-bold">
                    {formatPrice(product.priceCents, product.currency)}
                  </span>
                  <span className="label">one-time</span>
                </div>
                <CheckoutButton
                  kind="product"
                  slug={product.slug}
                  label="Buy this set"
                  className="mt-4"
                />
                {product.includedInSubscription ? (
                  <p className="mt-3 text-sm text-muted">
                    Or read it — and everything else — with{" "}
                    <Link href="/pricing" className="text-copper underline">
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
                className="btn btn-ghost mt-3 w-full"
                target="_blank"
                rel="noreferrer"
              >
                Read a free sample
              </a>
            ) : null}
          </div>
        </div>

        {/* ── Detail ──────────────────────────────────────────────────── */}
        <div>
          {product.sourceDocId ? (
            <p className="label label-copper">No. {product.sourceDocId}</p>
          ) : null}

          <h1 className="mt-3 font-display text-4xl leading-[1.1] font-bold tracking-tight">
            {product.title}
          </h1>
          {product.subtitle ? (
            <p className="mt-3 text-lg text-muted">{product.subtitle}</p>
          ) : null}

          {/* Spec bar, styled after the plate footers. */}
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
            {[
              product.pageCount
                ? { k: "Plates", v: String(product.pageCount).padStart(2, "0") }
                : null,
              { k: "Format", v: "PDF · Letter" },
              { k: "Scale", v: "N.T.S." },
              product.fileSizeBytes
                ? { k: "Size", v: `${(product.fileSizeBytes / 1_048_576).toFixed(1)} MB` }
                : null,
            ]
              .filter((x): x is { k: string; v: string } => x !== null)
              .map((spec) => (
                <div key={spec.k} className="bg-surface px-4 py-3.5">
                  <dt className="label">{spec.k}</dt>
                  <dd className="mt-1 font-display font-semibold">{spec.v}</dd>
                </div>
              ))}
          </dl>

          <div className="prose-basic mt-9 max-w-prose text-muted">
            {product.description
              .split("\n\n")
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>
        </div>
      </article>
    </>
  );
}
