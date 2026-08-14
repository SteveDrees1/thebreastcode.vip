/**
 * Promo code redemption — the "free promos" path (launch giveaways, friends
 * and family, newsletter codes).
 *
 * A promo grants content outright rather than discounting a purchase, so it
 * writes entitlement rows directly and never touches Stripe. Discount-style
 * promotions belong in Stripe's own promotion codes instead, where they can be
 * applied at checkout; this module is for "here, have it free".
 */
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes, promoRedemptions } from "@/db/schema";
import { grantBundle, grantEntireCatalog, grantEntitlement } from "./entitlements";

export type RedeemResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };

export async function redeemPromoCode(
  userId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "Enter a code." };

  const [promo] = await db
    .select()
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.code, code),
        eq(promoCodes.active, true),
        sql`${promoCodes.startsAt} <= now()`,
        or(isNull(promoCodes.expiresAt), gt(promoCodes.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);

  if (!promo) return { ok: false, reason: "That code is not valid or has expired." };

  if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) {
    return { ok: false, reason: "That code has been fully claimed." };
  }

  // Claim a redemption slot first. The unique index on (promoCodeId, userId)
  // rejects a second attempt by the same person, and the conditional increment
  // below is what actually enforces the global cap under concurrency.
  const claimed = await db
    .insert(promoRedemptions)
    .values({ promoCodeId: promo.id, userId })
    .onConflictDoNothing({
      target: [promoRedemptions.promoCodeId, promoRedemptions.userId],
    })
    .returning({ id: promoRedemptions.id });

  if (claimed.length === 0) {
    return { ok: false, reason: "You have already used that code." };
  }

  // Increment only while still under the cap; if this matches no rows another
  // request took the last slot, so give the redemption back.
  const incremented = await db
    .update(promoCodes)
    .set({ redemptionCount: sql`${promoCodes.redemptionCount} + 1` })
    .where(
      and(
        eq(promoCodes.id, promo.id),
        promo.maxRedemptions === null
          ? sql`true`
          : sql`${promoCodes.redemptionCount} < ${promo.maxRedemptions}`,
      ),
    )
    .returning({ id: promoCodes.id });

  if (incremented.length === 0) {
    await db.delete(promoRedemptions).where(eq(promoRedemptions.id, claimed[0].id));
    return { ok: false, reason: "That code has been fully claimed." };
  }

  const expiresAt = promo.grantDurationDays
    ? new Date(Date.now() + promo.grantDurationDays * 86_400_000)
    : null;

  switch (promo.kind) {
    case "free_product": {
      if (!promo.productId) return { ok: false, reason: "This code is misconfigured." };
      await grantEntitlement({
        userId,
        productId: promo.productId,
        source: "promo",
        sourceRef: promo.id,
        expiresAt,
      });
      return { ok: true, message: "Added to your library." };
    }
    case "free_bundle": {
      if (!promo.bundleId) return { ok: false, reason: "This code is misconfigured." };
      await grantBundle(userId, promo.bundleId, promo.id, "promo");
      return { ok: true, message: "Bundle added to your library." };
    }
    case "free_catalog": {
      await grantEntireCatalog(userId, promo.id, "promo", expiresAt);
      return { ok: true, message: "The full catalog is now in your library." };
    }
  }
}
