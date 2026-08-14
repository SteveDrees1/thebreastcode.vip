import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bundleItems, bundles, products } from "@/db/schema";
import { auth } from "@/auth";
import { ownedProductIds } from "@/lib/entitlements";
import { formatPrice } from "@/lib/stripe";
import { CheckoutButton } from "@/components/checkout-button";

export const revalidate = 3600;

async function getBundle(slug: string) {
  const [bundle] = await db.select().from(bundles).where(eq(bundles.slug, slug)).limit(1);
  return bundle;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getBundle(slug).catch(() => undefined);
  return bundle ? { title: bundle.title } : { title: "Not found" };
}

export default async function BundlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = await getBundle(slug);
  if (!bundle || bundle.status !== "published") notFound();

  const contents = await db
    .select({ product: products })
    .from(bundleItems)
    .innerJoin(products, eq(products.id, bundleItems.productId))
    .where(eq(bundleItems.bundleId, bundle.id))
    .orderBy(asc(bundleItems.position));

  const session = await auth();
  const owned = await ownedProductIds(session?.user?.id);
  const ownsAll =
    contents.length > 0 && contents.every(({ product }) => owned.has(product.id));

  const fullPrice = contents.reduce((sum, { product }) => sum + product.priceCents, 0);
  const saving = fullPrice - bundle.priceCents;

  return (
    <article className="grid gap-10 lg:grid-cols-[1fr_minmax(0,320px)]">
      <div>
        <h1 className="font-serif text-3xl">{bundle.title}</h1>
        {bundle.subtitle ? (
          <p className="mt-2 text-lg text-ink-soft">{bundle.subtitle}</p>
        ) : null}

        {bundle.description ? (
          <div className="prose-basic mt-5 max-w-prose text-ink-soft">
            {bundle.description.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : null}

        <h2 className="mt-10 font-serif text-xl">What&rsquo;s included</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {contents.map(({ product }) => (
            <li key={product.id} className="flex items-baseline gap-4 py-3">
              <Link href={`/catalog/${product.slug}`} className="font-medium hover:underline">
                {product.title}
              </Link>
              <span className="ml-auto text-sm text-ink-soft">
                {owned.has(product.id)
                  ? "owned"
                  : formatPrice(product.priceCents, product.currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <aside className="h-fit rounded-xl border border-line bg-surface p-6">
        <p className="text-2xl font-medium">
          {formatPrice(bundle.priceCents, bundle.currency)}
        </p>
        {saving > 0 ? (
          <p className="mt-1 text-sm text-ink-soft">
            {formatPrice(fullPrice, bundle.currency)} bought separately — you save{" "}
            {formatPrice(saving, bundle.currency)}.
          </p>
        ) : null}

        <div className="mt-5">
          {ownsAll ? (
            <p className="text-sm text-ink-soft">
              You already own every guide in this bundle.{" "}
              <Link href="/library" className="text-accent underline">
                Go to your library
              </Link>
              .
            </p>
          ) : (
            <CheckoutButton kind="bundle" slug={bundle.slug} label="Buy this bundle" />
          )}
        </div>

        {!ownsAll && owned.size > 0 ? (
          <p className="mt-3 text-xs text-ink-soft">
            Guides you already own stay in your library; buying the bundle simply adds
            the rest.
          </p>
        ) : null}
      </aside>
    </article>
  );
}
