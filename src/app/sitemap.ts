import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { bundles, products } from "@/db/schema";
import { CATALOG_TAG } from "@/lib/catalog";
import { env } from "@/lib/env";

/*
 * The sitemap is cached under CATALOG_TAG, the same tag every other catalog
 * read uses, so publishing a product refreshes it in the same breath as the
 * pages themselves.
 *
 * It previously had only `export const revalidate = 3600` and no tag. That put
 * it outside the invalidation the admin console performs on publish
 * (`revalidateTag(CATALOG_TAG)` in admin/actions.ts), so a newly published set
 * stayed missing from the sitemap until the hour happened to roll over. The
 * drift was not theoretical — with six published products the served sitemap
 * listed three, while /catalog listed all six.
 *
 * The hourly window is kept as a backstop for rows changed outside the console
 * (the import script, a manual SQL fix), which never call revalidateTag.
 */
const getSitemapEntries = unstable_cache(
  async () => {
    const [publishedProducts, publishedBundles] = await Promise.all([
      db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(eq(products.status, "published")),
      db
        .select({ slug: bundles.slug, createdAt: bundles.createdAt })
        .from(bundles)
        .where(eq(bundles.status, "published")),
    ]);
    return { publishedProducts, publishedBundles };
  },
  ["sitemap-entries"],
  { revalidate: 3600, tags: [CATALOG_TAG] },
);

// Must stay a literal: Next statically analyses route segment config, and a
// reference to a const makes it unrecognisable ("can't recognize the exported
// `config` field in route /sitemap.xml/route").
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/bundles`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const { publishedProducts, publishedBundles } = await getSitemapEntries();

    return [
      ...staticRoutes,
      ...publishedProducts.map((p) => ({
        url: `${base}/catalog/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...publishedBundles.map((b) => ({
        url: `${base}/bundles/${b.slug}`,
        lastModified: b.createdAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // A sitemap missing its product URLs beats a build that fails because the
    // database was briefly unreachable.
    return staticRoutes;
  }
}
