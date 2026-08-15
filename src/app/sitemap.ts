import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bundles, products } from "@/db/schema";
import { env } from "@/lib/env";

// Regenerate hourly rather than per request; search engines do not need the
// sitemap to be live to the second, and this keeps it off the database.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/bundles`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
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
