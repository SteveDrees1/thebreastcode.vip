/**
 * End-to-end check of the entitlement rules against a real database.
 *
 * Run against a scratch database (never production — it writes and deletes
 * users):  npm run verify:entitlements
 *
 * This exists because entitlement resolution is the one piece of logic where a
 * silent bug either gives away paid content or locks out a paying customer.
 */
import "./load-env";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  entitlements,
  products,
  promoCodes,
  referralCredits,
  referrals,
  subscriptions,
  users,
} from "../src/db/schema";
import {
  grantEntitlement,
  hasAccess,
  listLibrary,
  revokeBySourceRef,
} from "../src/lib/entitlements";
import { redeemPromoCode } from "../src/lib/promos";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

async function main() {
  const catalog = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(eq(products.status, "published"));

  if (catalog.length < 2) {
    console.error("Need at least 2 published products. Run `npm run db:seed` first.");
    process.exit(1);
  }
  const [first, second] = catalog;

  const suffix = Date.now();
  const [buyer] = await db
    .insert(users)
    .values({ email: `verify-buyer-${suffix}@example.test` })
    .returning({ id: users.id });
  const [subscriber] = await db
    .insert(users)
    .values({ email: `verify-sub-${suffix}@example.test` })
    .returning({ id: users.id });

  try {
    // --- purchase -------------------------------------------------------
    check("no access before purchase", await hasAccess(buyer.id, first.id), false);

    await grantEntitlement({
      userId: buyer.id,
      productId: first.id,
      source: "purchase",
      sourceRef: "order_verify_1",
    });
    check("access after purchase", await hasAccess(buyer.id, first.id), true);
    check("purchase does not leak to other products", await hasAccess(buyer.id, second.id), false);

    // --- idempotency: the webhook-replay case ---------------------------
    await grantEntitlement({
      userId: buyer.id,
      productId: first.id,
      source: "purchase",
      sourceRef: "order_verify_1",
    });
    const rows = await db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(
        and(eq(entitlements.userId, buyer.id), eq(entitlements.productId, first.id)),
      );
    check("replayed grant writes no duplicate", rows.length, 1);

    // --- expiry ---------------------------------------------------------
    await grantEntitlement({
      userId: buyer.id,
      productId: second.id,
      source: "promo",
      sourceRef: "expired_verify",
      expiresAt: new Date(Date.now() - 60_000),
    });
    check("expired grant denies access", await hasAccess(buyer.id, second.id), false);

    // --- subscription ---------------------------------------------------
    check("no subscription access yet", await hasAccess(subscriber.id, first.id), false);

    await db.insert(subscriptions).values({
      userId: subscriber.id,
      stripeSubscriptionId: `sub_verify_${suffix}`,
      stripeCustomerId: `cus_verify_${suffix}`,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    check("active subscription unlocks catalog", await hasAccess(subscriber.id, first.id), true);

    const subLibrary = await listLibrary(subscriber.id);
    check("subscriber library covers every included product", subLibrary.length, catalog.length);
    check("library labels subscription access", subLibrary[0]?.via, "subscription");

    // A lapsed subscription must revoke access immediately.
    await db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.userId, subscriber.id));
    check("canceled subscription denies access", await hasAccess(subscriber.id, first.id), false);

    // --- owned content survives a lapsed subscription -------------------
    check("purchased content survives", await hasAccess(buyer.id, first.id), true);

    // --- promo ----------------------------------------------------------
    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: `VERIFY${suffix}`,
        kind: "free_product",
        productId: second.id,
        maxRedemptions: 1,
      })
      .returning({ id: promoCodes.id });

    const firstRedeem = await redeemPromoCode(subscriber.id, `VERIFY${suffix}`);
    check("promo redeems", firstRedeem.ok, true);
    check("promo grants access", await hasAccess(subscriber.id, second.id), true);

    const secondRedeem = await redeemPromoCode(subscriber.id, `VERIFY${suffix}`);
    check("same user cannot redeem twice", secondRedeem.ok, false);

    const thirdRedeem = await redeemPromoCode(buyer.id, `VERIFY${suffix}`);
    check("promo respects max redemptions", thirdRedeem.ok, false);

    // --- refund ---------------------------------------------------------
    await revokeBySourceRef("order_verify_1");
    check("refund revokes access", await hasAccess(buyer.id, first.id), false);

    await db.delete(promoCodes).where(eq(promoCodes.id, promo.id));
  } finally {
    // Cascades clear entitlements, subscriptions, redemptions, referrals.
    await db.delete(referralCredits).where(eq(referralCredits.userId, buyer.id));
    await db.delete(referrals).where(eq(referrals.referrerUserId, buyer.id));
    await db.delete(users).where(eq(users.id, buyer.id));
    await db.delete(users).where(eq(users.id, subscriber.id));
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
