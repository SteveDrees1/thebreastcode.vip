/**
 * SEO invariants that are cheap to break and expensive to notice.
 *
 * `metaDescription()` guarantees every page emits *a* description, which is
 * what stops a blank one from reaching search results. But the last-resort
 * fallback is the generic brand line, so a product with no copy of its own
 * still renders "correctly" while being indistinguishable from every other
 * page. That is exactly the kind of degradation nobody sees. This script makes
 * it visible.
 *
 * Run against any database, including a copy of production — it only reads.
 *
 *   npm run verify:seo
 *
 * Exit codes: 1 for a structural fault that will actively hurt (a duplicate
 * slug means two canonicals collide), 0 for thin content, which is a content
 * task rather than a bug and should not fail a build.
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { bundles, products } from "../src/db/schema";
import { brand } from "../src/lib/brand";
import { metaDescription } from "../src/lib/seo";

/** Google shows roughly 60 characters of a title before truncating. */
const TITLE_LIMIT = 60;

let errors = 0;
let warnings = 0;

function error(message: string) {
  errors += 1;
  console.error(`FAIL  ${message}`);
}

function warn(message: string) {
  warnings += 1;
  console.warn(`THIN  ${message}`);
}

async function main() {
  const [publishedProducts, publishedBundles] = await Promise.all([
    db.select().from(products).where(eq(products.status, "published")),
    db.select().from(bundles).where(eq(bundles.status, "published")),
  ]);

  const entries = [
    ...publishedProducts.map((p) => ({
      path: `/catalog/${p.slug}`,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
    })),
    ...publishedBundles.map((b) => ({
      path: `/bundles/${b.slug}`,
      title: b.title,
      subtitle: b.subtitle,
      description: b.description,
    })),
  ];

  if (entries.length === 0) {
    console.error("No published products or bundles. Run `npm run db:seed` first.");
    process.exit(1);
  }

  /*
   * There is deliberately no duplicate-slug check here.
   *
   * Colliding canonicals would be the worst fault this script could find, but
   * `products.slug` and `bundles.slug` both carry a UNIQUE index
   * (products_slug_unique, bundles_slug_unique — verified against the
   * database, not just the Drizzle schema), so the condition cannot arise. A
   * check that can never fire reads like a safeguard while guaranteeing
   * nothing, which is worse than its absence.
   */
  for (const entry of entries) {
    if (!entry.title?.trim()) {
      error(`${entry.path} has no title`);
    } else if (entry.title.length > TITLE_LIMIT) {
      warn(`${entry.path} title is ${entry.title.length} chars (>${TITLE_LIMIT}, will truncate)`);
    }

    // The real check: does this page have anything to say for itself, or is it
    // riding the generic fallback?
    const resolved = metaDescription(entry.subtitle, entry.description);
    if (resolved === brand.description) {
      warn(`${entry.path} has no description of its own — falling back to the brand line`);
    } else if (resolved.length < 50) {
      warn(`${entry.path} description is only ${resolved.length} chars`);
    }
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  console.log(
    `\nChecked ${plural(entries.length, "published page")} ` +
      `(${plural(publishedProducts.length, "product")}, ` +
      `${plural(publishedBundles.length, "bundle")}).`,
  );

  if (errors > 0) {
    console.error(`${plural(errors, "structural problem")}, ${warnings} thin.`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.warn(
      `${plural(warnings, "page")} ${warnings === 1 ? "needs" : "need"} copy. ` +
        "Not a build failure — write the descriptions when you can.",
    );
  } else {
    console.log("Every published page has a title and a description of its own.");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
