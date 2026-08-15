import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ownedProductIds } from "@/lib/entitlements";
import { getBundleBySlug, getBundleContents } from "@/lib/catalog";
import { formatPrice } from "@/lib/stripe";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { CheckoutButton } from "@/components/checkout-button";

// Rendered per request: the header and buy state depend on the session, so
// this route reads cookies and cannot be prerendered. Data caching lives in
// lib/catalog.ts, which keeps the database out of the hot path.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getBundleBySlug(slug).catch(() => undefined);
  return bundle
    ? {
        title: bundle.title,
        description: bundle.subtitle ?? undefined,
        alternates: { canonical: `/bundles/${bundle.slug}` },
      }
    : { title: "Not found" };
}

export default async function BundlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = await getBundleBySlug(slug);
  if (!bundle || bundle.status !== "published") notFound();

  const [contents, session] = await Promise.all([
    getBundleContents(bundle.id),
    auth(),
  ]);
  const owned = await ownedProductIds(session?.user?.id);

  const ownsAll = contents.length > 0 && contents.every((p) => owned.has(p.id));
  const fullPrice = contents.reduce((sum, p) => sum + p.priceCents, 0);
  const saving = fullPrice - bundle.priceCents;

  const bundleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: bundle.title,
    description: bundle.subtitle ?? bundle.description.slice(0, 300),
    sku: bundle.slug,
    brand: { "@type": "Brand", name: brand.name },
    offers: {
      "@type": "Offer",
      price: (bundle.priceCents / 100).toFixed(2),
      priceCurrency: bundle.currency.toUpperCase(),
      availability: "https://schema.org/InStock",
      url: `${env.siteUrl}/bundles/${bundle.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(bundleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Bundles", path: "/bundles" },
              { name: bundle.title, path: `/bundles/${bundle.slug}` },
            ]),
          ),
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-8">
        <Link href="/bundles" className="label transition hover:text-copper">
          ← Bundles
        </Link>
      </nav>

      <article className="grid gap-12 lg:grid-cols-[1fr_minmax(0,320px)]">
        <div>
          <p className="label label-copper">Series bundle</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.1] font-bold tracking-tight">
            {bundle.title}
          </h1>
          {bundle.subtitle ? (
            <p className="mt-3 text-lg text-muted">{bundle.subtitle}</p>
          ) : null}

          {bundle.description ? (
            <div className="prose-basic mt-6 max-w-prose text-muted">
              {bundle.description
                .split("\n\n")
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </div>
          ) : null}

          <h2 className="mt-12 font-display text-xl font-semibold">
            What&rsquo;s included
          </h2>
          <hr className="rule mt-4 mb-2" />

          <ul>
            {contents.map((product, i) => (
              <li
                key={product.id}
                className="flex items-baseline gap-4 border-b border-line py-4"
              >
                <span className="label label-copper w-7 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/catalog/${product.slug}`}
                  className="font-display font-medium transition hover:text-copper"
                >
                  {product.title}
                </Link>
                <span className="ml-auto shrink-0 text-sm text-muted">
                  {owned.has(product.id)
                    ? "owned"
                    : formatPrice(product.priceCents, product.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="panel reg h-fit p-6 lg:sticky lg:top-24">
          <span className="font-display text-3xl font-bold">
            {formatPrice(bundle.priceCents, bundle.currency)}
          </span>
          {saving > 0 ? (
            <p className="mt-2 text-sm text-muted">
              {formatPrice(fullPrice, bundle.currency)} bought separately — you save{" "}
              <span className="text-copper">{formatPrice(saving, bundle.currency)}</span>.
            </p>
          ) : null}

          <div className="mt-5">
            {ownsAll ? (
              <p className="text-sm text-muted">
                You already own every set in this bundle.{" "}
                <Link href="/library" className="text-copper underline">
                  Go to your library
                </Link>
                .
              </p>
            ) : (
              <CheckoutButton kind="bundle" slug={bundle.slug} label="Buy this bundle" />
            )}
          </div>

          {!ownsAll && owned.size > 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-faint">
              Sets you already own stay in your library; buying the bundle simply adds
              the rest.
            </p>
          ) : null}
        </aside>
      </article>
    </>
  );
}
