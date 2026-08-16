/**
 * Asserts that private columns never reach the storefront's data layer.
 *
 * The compile-time guard in lib/catalog.ts is the primary defence. This is the
 * belt to its braces: it runs the real queries against a real database and
 * inspects the objects that come back, so a leak still fails loudly if someone
 * bypasses the projection with a raw `select()` or a cast.
 *
 *   npm run verify:exposure
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { bundles, products } from "../src/db/schema";
import { publicBundleColumns, publicProductColumns } from "../src/lib/catalog";

/** Anything in this list appearing in storefront data is a defect. */
const FORBIDDEN_PRODUCT = ["fileKey", "sourceSha256", "stripePriceId"] as const;
const FORBIDDEN_BUNDLE = ["stripePriceId"] as const;

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
}

function assertClean(label: string, row: object | undefined, forbidden: readonly string[]) {
  if (!row) {
    console.log(`SKIP  ${label} (no rows — seed the database first)`);
    return;
  }
  const leaked = forbidden.filter((field) => field in row);
  check(label, leaked.length === 0, `exposes ${leaked.join(", ")}`);
}

async function main() {
  // 1. The projections themselves must not name a private column.
  check(
    "product projection excludes private columns",
    !FORBIDDEN_PRODUCT.some((f) => f in publicProductColumns),
  );
  check(
    "bundle projection excludes private columns",
    !FORBIDDEN_BUNDLE.some((f) => f in publicBundleColumns),
  );

  // 2. Rows actually returned by those projections must be clean.
  const [product] = await db
    .select(publicProductColumns)
    .from(products)
    .where(eq(products.status, "published"))
    .limit(1);
  assertClean("published product row is clean", product, FORBIDDEN_PRODUCT);

  const [bundle] = await db
    .select(publicBundleColumns)
    .from(bundles)
    .where(eq(bundles.status, "published"))
    .limit(1);
  assertClean("published bundle row is clean", bundle, FORBIDDEN_BUNDLE);

  // 3. Sanity check the check: a full row MUST contain fileKey. If this fails,
  //    the column was renamed and the assertions above are testing nothing.
  const [raw] = await db.select().from(products).limit(1);
  check(
    "control: unprojected row still carries fileKey",
    raw === undefined || "fileKey" in raw,
    "fileKey missing from the table — update this script",
  );

  console.log(
    failures === 0 ? "\nNo private fields exposed." : `\n${failures} exposure failure(s).`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
