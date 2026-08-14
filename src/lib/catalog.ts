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
import { bundleItems, bundles, products, type Product } from "@/db/schema";

export const CATALOG_TAG = "catalog";

const ONE_HOUR = 3600;

export const getPublishedProducts = unstable_cache(
  async (options?: { featuredOnly?: boolean; limit?: number }): Promise<Product[]> => {
    const where = options?.featuredOnly
      ? and(eq(products.status, "published"), eq(products.featured, true))
      : eq(products.status, "published");

    const query = db
      .select()
      .from(products)
      .where(where)
      .orderBy(desc(products.publishedAt));

    return options?.limit ? query.limit(options.limit) : query;
  },
  ["published-products"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getProductBySlug = unstable_cache(
  async (slug: string): Promise<Product | undefined> => {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return product;
  },
  ["product-by-slug"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getPublishedBundles = unstable_cache(
  async () =>
    db
      .select()
      .from(bundles)
      .where(eq(bundles.status, "published"))
      .orderBy(desc(bundles.publishedAt)),
  ["published-bundles"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getBundleBySlug = unstable_cache(
  async (slug: string) => {
    const [bundle] = await db
      .select()
      .from(bundles)
      .where(eq(bundles.slug, slug))
      .limit(1);
    return bundle;
  },
  ["bundle-by-slug"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);

export const getBundleContents = unstable_cache(
  async (bundleId: string): Promise<Product[]> => {
    const rows = await db
      .select({ product: products })
      .from(bundleItems)
      .innerJoin(products, eq(products.id, bundleItems.productId))
      .where(eq(bundleItems.bundleId, bundleId))
      .orderBy(asc(bundleItems.position));
    return rows.map((r) => r.product);
  },
  ["bundle-contents"],
  { revalidate: ONE_HOUR, tags: [CATALOG_TAG] },
);
