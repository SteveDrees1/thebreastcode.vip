/**
 * Cached catalog reads.
 *
 * The storefront renders per request (the header shows who is signed in), so
 * without this every visitor would cost a database round trip for a product
 * list that changes a few times a month. `unstable_cache` keeps the rows in the
 * data cache and shares them across requests and users.
 *
 * Only anonymous, non-personalised data belongs here. Anything that depends on
 * the viewer — entitlements, orders, referral counts — must stay uncached, or a
 * cache hit would serve one customer's data to another.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import {
  bundleItems,
  bundles,
  products,
  type Bundle,
  type Product,
} from "@/db/schema";

export const CATALOG_TAG = "catalog";

const ONE_HOUR = 3600;

/**
 * Fields the storefront must never receive.
 *
 * `fileKey` is the private object key in the PDF bucket — publishing it is the
 * one mistake in this file that actually costs money. The rest are excluded
 * because the storefront has no use for them, and anything sent is something
 * that can leak.
 */
type PrivateProductField =
  | "fileKey"
  | "sourceSha256"
  | "stripePriceId"
  | "createdAt"
  | "updatedAt";

/** A product as the storefront may see it: never carries a private field. */
export type PublicProduct = Omit<Product, PrivateProductField>;

/**
 * The only product columns the storefront is allowed to read.
 *
 * `SELECT *` would pull `fileKey` into every product object the view layer
 * touches. Nothing serialises it today, because React does not send
 * server-component props to the browser — but that safety is one refactor
 * deep. Adding "use client" to a component that takes a product, or passing
 * one into an existing client component, would publish every storage key into
 * the RSC payload with no error and no visible symptom.
 *
 * Selecting explicitly means the dangerous fields are never in the object to
 * begin with.
 *
 * The `satisfies` clause is the guard, and it is load-bearing: it makes this
 * an object literal checked for *excess* properties, so adding `fileKey` back
 * here fails to compile. Plain assignability would not catch it — a query
 * result carrying extra columns is still assignable to `PublicProduct`, which
 * is exactly how this kind of leak normally ships unnoticed. It also fails if
 * a public field is missing, keeping the projection and the type in step.
 *
 * Code that genuinely needs a private column — the download route needs
 * `fileKey`, checkout needs `stripePriceId` — selects it explicitly and never
 * passes the row onward.
 */
export const publicProductColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  subtitle: products.subtitle,
  description: products.description,
  coverImageUrl: products.coverImageUrl,
  samplePdfUrl: products.samplePdfUrl,
  pageCount: products.pageCount,
  fileSizeBytes: products.fileSizeBytes,
  priceCents: products.priceCents,
  currency: products.currency,
  includedInSubscription: products.includedInSubscription,
  status: products.status,
  featured: products.featured,
  publishedAt: products.publishedAt,
  sourceDocId: products.sourceDocId,
} satisfies Record<keyof PublicProduct, unknown>;

/** Same treatment for bundles: the Stripe price id is not the browser's business. */
type PrivateBundleField = "stripePriceId" | "createdAt";

export type PublicBundle = Omit<Bundle, PrivateBundleField>;

export const publicBundleColumns = {
  id: bundles.id,
  slug: bundles.slug,
  title: bundles.title,
  subtitle: bundles.subtitle,
  description: bundles.description,
  coverImageUrl: bundles.coverImageUrl,
  priceCents: bundles.priceCents,
  currency: bundles.currency,
  status: bundles.status,
  publishedAt: bundles.publishedAt,
} satisfies Record<keyof PublicBundle, unknown>;

export const getPublishedProducts = unstable_cache(
  async (options?: {
    featuredOnly?: boolean;
    limit?: number;
  }): Promise<PublicProduct[]> => {
    const where = options?.featuredOnly
      ? and(eq(products.status, "published"), eq(products.featured, true))
      : eq(products.status, "published");

    const query = db
      .select(publicProductColumns)
      .from(products)
      .where(where)
      .orderBy(desc(products.publishedAt));

    return options?.limit ? query.limit(options.limit) : query;
  },
  ["published-products"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getProductBySlug = unstable_cache(
  async (slug: string): Promise<PublicProduct | undefined> => {
    const [product] = await db
      .select(publicProductColumns)
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return product;
  },
  ["product-by-slug"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getPublishedBundles = unstable_cache(
  async (): Promise<PublicBundle[]> =>
    db
      .select(publicBundleColumns)
      .from(bundles)
      .where(eq(bundles.status, "published"))
      .orderBy(desc(bundles.publishedAt)),
  ["published-bundles"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getBundleBySlug = unstable_cache(
  async (slug: string): Promise<PublicBundle | undefined> => {
    const [bundle] = await db
      .select(publicBundleColumns)
      .from(bundles)
      .where(eq(bundles.slug, slug))
      .limit(1);
    return bundle;
  },
  ["bundle-by-slug"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getBundleContents = unstable_cache(
  async (bundleId: string): Promise<PublicProduct[]> =>
    db
      .select(publicProductColumns)
      .from(bundleItems)
      .innerJoin(products, eq(products.id, bundleItems.productId))
      .where(eq(bundleItems.bundleId, bundleId))
      .orderBy(asc(bundleItems.position)),
  ["bundle-contents"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);
