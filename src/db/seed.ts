/**
 * Development seed: one bundle, three products, and a launch promo code.
 *
 * Run with `npm run db:seed` after `npm run db:push`. Safe to re-run — every
 * insert is upserted on its natural key.
 *
 * `fileKey` values point at objects in the private bucket. Until you upload
 * real PDFs under those keys, downloads will 404 at the storage layer even
 * though the entitlement check passes.
 */
import "../../scripts/load-env";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { bundleItems, bundles, products, promoCodes } from "./schema";

async function main() {
  const seedProducts = [
    {
      slug: "workshop-storage-guide",
      title: "Workshop Storage Guide",
      subtitle: "A fixed-layout installation guide for pegboard and zone storage.",
      description:
        "A complete, print-ready installation guide for laying out a workshop wall.\n\nCovers zone planning, pegboard hook selection, tool inventory, and a warranty log you can fill in. Designed for US Letter and built to stay legible at any zoom.",
      fileKey: "pdfs/workshop-storage-guide-v1.pdf",
      pageCount: 48,
      priceCents: 2400,
      featured: true,
    },
    {
      slug: "tool-inventory-workbook",
      title: "Tool Inventory Workbook",
      subtitle: "Track every tool, serial number, and warranty date in one place.",
      description:
        "A structured workbook for cataloguing your tools.\n\nIncludes warranty registration fields, purchase records, and printable inserts sized for a standard binder.",
      fileKey: "pdfs/tool-inventory-workbook-v1.pdf",
      pageCount: 24,
      priceCents: 1200,
      featured: false,
    },
    {
      slug: "pegboard-layout-templates",
      title: "Pegboard Layout Templates",
      subtitle: "Full-size cut-and-place templates for common hook patterns.",
      description:
        "Print at 100% scale, tape to the wall, and drill through the marks.\n\nCovers the eight most common hook types and three board sizes.",
      fileKey: "pdfs/pegboard-layout-templates-v1.pdf",
      pageCount: 16,
      priceCents: 900,
      featured: false,
    },
  ];

  const productIds: Record<string, string> = {};

  for (const product of seedProducts) {
    const [row] = await db
      .insert(products)
      .values({ ...product, status: "published", publishedAt: new Date() })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          priceCents: product.priceCents,
          pageCount: product.pageCount,
          featured: product.featured,
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id });
    productIds[product.slug] = row.id;
    console.log(`product: ${product.slug}`);
  }

  const total = seedProducts.reduce((sum, p) => sum + p.priceCents, 0);
  const [bundle] = await db
    .insert(bundles)
    .values({
      slug: "complete-workshop-set",
      title: "The Complete Workshop Set",
      subtitle: "All three guides, priced as one.",
      description:
        "Everything needed to plan, build, and document a workshop wall — the full guide, the inventory workbook, and the layout templates.",
      priceCents: Math.round(total * 0.75),
      status: "published",
      publishedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: bundles.slug,
      set: { priceCents: Math.round(total * 0.75) },
    })
    .returning({ id: bundles.id });

  await db.delete(bundleItems).where(eq(bundleItems.bundleId, bundle.id));
  await db.insert(bundleItems).values(
    seedProducts.map((product, index) => ({
      bundleId: bundle.id,
      productId: productIds[product.slug],
      position: index,
    })),
  );
  console.log("bundle: complete-workshop-set");

  await db
    .insert(promoCodes)
    .values({
      code: "LAUNCH2026",
      kind: "free_product",
      productId: productIds["pegboard-layout-templates"],
      maxRedemptions: 500,
      note: "Launch giveaway — free templates for the first 500 signups.",
    })
    .onConflictDoNothing({ target: promoCodes.code });
  console.log("promo: LAUNCH2026");

  console.log("\nSeed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
