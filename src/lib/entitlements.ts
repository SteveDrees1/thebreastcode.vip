/**
 * Entitlement resolution — the only module allowed to answer "can this user
 * read this PDF?".
 *
 * Two access paths, unioned:
 *
 *   1. A live row in `entitlements` (purchase, bundle, promo, referral, manual)
 *      that is neither revoked nor expired.
 *   2. An active all-access subscription, when the product opts in via
 *      `products.includedInSubscription`.
 *
 * Path 2 is evaluated live rather than materialised as rows so that a PDF
 * published tomorrow is instantly readable by today's subscribers, and so that
 * access disappears the moment a subscription lapses.
 *
 * Everything that grants access funnels through `grantEntitlement`, which is
 * idempotent on (userId, productId, source, sourceRef). That is what makes
 * Stripe webhook replays safe.
 */
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bundleItems,
  entitlements,
  products,
  subscriptions,
  type Product,
} from "@/db/schema";

/** Stripe statuses that should still unlock content. */
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type AccessVia = "entitlement" | "subscription" | "none";

/** A live (unrevoked, unexpired) entitlement row. */
const liveEntitlement = (userId: string) =>
  and(
    eq(entitlements.userId, userId),
    isNull(entitlements.revokedAt),
    or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, sql`now()`)),
  );

/** Does the user currently hold an all-access subscription? */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Resolve access to one product, returning *how* access was granted so callers
 * can log it. Returns "none" when the user cannot read the product.
 */
export async function resolveAccess(
  userId: string | undefined,
  productId: string,
): Promise<AccessVia> {
  if (!userId) return "none";

  const direct = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(liveEntitlement(userId), eq(entitlements.productId, productId)))
    .limit(1);
  if (direct.length > 0) return "entitlement";

  const [product] = await db
    .select({ includedInSubscription: products.includedInSubscription })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (product?.includedInSubscription && (await hasActiveSubscription(userId))) {
    return "subscription";
  }
  return "none";
}

export async function hasAccess(
  userId: string | undefined,
  productId: string,
): Promise<boolean> {
  return (await resolveAccess(userId, productId)) !== "none";
}

export type LibraryEntry = Product & { via: Exclude<AccessVia, "none"> };

/**
 * Every product the user can read right now, from all sources, de-duplicated.
 * Directly-owned products win over subscription access in the `via` label,
 * because owning a PDF outlives the subscription.
 */
export async function listLibrary(userId: string): Promise<LibraryEntry[]> {
  const owned = await db
    .select({ product: products })
    .from(entitlements)
    .innerJoin(products, eq(products.id, entitlements.productId))
    .where(liveEntitlement(userId));

  const library = new Map<string, LibraryEntry>();
  for (const { product } of owned) {
    library.set(product.id, { ...product, via: "entitlement" });
  }

  if (await hasActiveSubscription(userId)) {
    const included = await db
      .select()
      .from(products)
      .where(and(eq(products.includedInSubscription, true), eq(products.status, "published")));

    for (const product of included) {
      if (!library.has(product.id)) {
        library.set(product.id, { ...product, via: "subscription" });
      }
    }
  }

  return [...library.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** Product ids the user owns outright — used to grey out "buy" buttons. */
export async function ownedProductIds(userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(liveEntitlement(userId));
  return new Set(rows.map((r) => r.productId));
}

// ---------------------------------------------------------------------------
// Granting
// ---------------------------------------------------------------------------

export type GrantSource = "purchase" | "bundle" | "promo" | "referral" | "manual";

export interface GrantInput {
  userId: string;
  productId: string;
  source: GrantSource;
  /** Order id, promo code id, referral id... makes the grant idempotent. */
  sourceRef: string;
  /** Null/undefined = perpetual. */
  expiresAt?: Date | null;
}

/**
 * Grant one product. Safe to call repeatedly with the same input — the unique
 * index on (userId, productId, source, sourceRef) turns a replay into a no-op.
 */
export async function grantEntitlement(input: GrantInput): Promise<void> {
  await db
    .insert(entitlements)
    .values({
      userId: input.userId,
      productId: input.productId,
      source: input.source,
      sourceRef: input.sourceRef,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoNothing({
      target: [
        entitlements.userId,
        entitlements.productId,
        entitlements.source,
        entitlements.sourceRef,
      ],
    });
}

/** Grant every product inside a bundle, as one idempotent batch. */
export async function grantBundle(
  userId: string,
  bundleId: string,
  sourceRef: string,
  source: GrantSource = "bundle",
): Promise<void> {
  const items = await db
    .select({ productId: bundleItems.productId })
    .from(bundleItems)
    .where(eq(bundleItems.bundleId, bundleId));

  if (items.length === 0) return;

  await db
    .insert(entitlements)
    .values(
      items.map((item) => ({
        userId,
        productId: item.productId,
        source,
        sourceRef,
      })),
    )
    .onConflictDoNothing({
      target: [
        entitlements.userId,
        entitlements.productId,
        entitlements.source,
        entitlements.sourceRef,
      ],
    });
}

/** Grant the whole published catalog (launch giveaways, all-access comps). */
export async function grantEntireCatalog(
  userId: string,
  sourceRef: string,
  source: GrantSource = "promo",
  expiresAt?: Date | null,
): Promise<void> {
  const all = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.status, "published"));

  if (all.length === 0) return;

  await db
    .insert(entitlements)
    .values(
      all.map((p) => ({
        userId,
        productId: p.id,
        source,
        sourceRef,
        expiresAt: expiresAt ?? null,
      })),
    )
    .onConflictDoNothing({
      target: [
        entitlements.userId,
        entitlements.productId,
        entitlements.source,
        entitlements.sourceRef,
      ],
    });
}

/**
 * Revoke everything a given order granted. Called on refund/chargeback.
 * Sets `revokedAt` rather than deleting so the history stays auditable.
 */
export async function revokeBySourceRef(sourceRef: string): Promise<void> {
  await db
    .update(entitlements)
    .set({ revokedAt: new Date() })
    .where(and(eq(entitlements.sourceRef, sourceRef), isNull(entitlements.revokedAt)));
}
