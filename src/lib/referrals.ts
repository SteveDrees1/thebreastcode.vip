/**
 * Referral programme.
 *
 * Flow: someone visits /r/<code> -> the code is stored in a short-lived cookie
 * -> when they finish signing up (which requires clicking a magic link, so the
 * email is proven) the referral is recorded as qualified -> every N qualified
 * referrals mints one credit -> the referrer spends a credit on any product,
 * which writes an ordinary entitlement row.
 *
 * Self-referral and double-crediting are both blocked below; the unique index
 * on `referrals.referredUserId` means a person can only ever be counted once,
 * no matter how many codes they cycle through.
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { referralCredits, referrals, users } from "@/db/schema";
import { env } from "./env";
import { grantEntitlement } from "./entitlements";

export const REFERRAL_COOKIE = "tbc_ref";
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function rememberReferralCode(code: string): Promise<void> {
  const jar = await cookies();
  jar.set(REFERRAL_COOKIE, code.toUpperCase(), {
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

/**
 * Called once, when a user record is first created. Reads the stashed code,
 * records the referral as qualified, and mints a credit if the referrer just
 * hit a milestone.
 */
export async function qualifyReferral(newUserId: string): Promise<void> {
  const jar = await cookies();
  const code = jar.get(REFERRAL_COOKIE)?.value;
  if (!code) return;

  const [referrer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referralCode, code))
    .limit(1);

  // No such code, or someone trying to refer themselves.
  if (!referrer || referrer.id === newUserId) return;

  await db
    .insert(referrals)
    .values({
      referrerUserId: referrer.id,
      referredUserId: newUserId,
      status: "qualified",
      qualifiedAt: new Date(),
    })
    .onConflictDoNothing({ target: referrals.referredUserId });

  jar.delete(REFERRAL_COOKIE);
  await maybeAwardCredit(referrer.id);
}

/**
 * Mint credits for whole milestones the referrer has reached but not yet been
 * paid for. Computing from totals (rather than incrementing) means a missed or
 * duplicated call can never drift the balance.
 */
async function maybeAwardCredit(referrerUserId: string): Promise<void> {
  const perReward = Math.max(1, env.referralsPerReward);

  const [{ value: qualified }] = await db
    .select({ value: count() })
    .from(referrals)
    .where(
      and(eq(referrals.referrerUserId, referrerUserId), eq(referrals.status, "qualified")),
    );

  const [{ value: alreadyAwarded }] = await db
    .select({ value: count() })
    .from(referralCredits)
    .where(eq(referralCredits.userId, referrerUserId));

  const earned = Math.floor(qualified / perReward);
  const owed = earned - alreadyAwarded;
  if (owed <= 0) return;

  await db.insert(referralCredits).values(
    Array.from({ length: owed }, () => ({
      userId: referrerUserId,
      reason: `referral_milestone_${perReward}`,
    })),
  );
}

export interface ReferralSummary {
  code: string;
  shareUrl: string;
  qualifiedCount: number;
  creditsAvailable: number;
  creditsSpent: number;
  referralsUntilNextCredit: number;
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const perReward = Math.max(1, env.referralsPerReward);

  const [user] = await db
    .select({ referralCode: users.referralCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [{ value: qualifiedCount }] = await db
    .select({ value: count() })
    .from(referrals)
    .where(and(eq(referrals.referrerUserId, userId), eq(referrals.status, "qualified")));

  const [{ value: creditsAvailable }] = await db
    .select({ value: count() })
    .from(referralCredits)
    .where(and(eq(referralCredits.userId, userId), isNull(referralCredits.spentAt)));

  const [{ value: totalCredits }] = await db
    .select({ value: count() })
    .from(referralCredits)
    .where(eq(referralCredits.userId, userId));

  const code = user?.referralCode ?? "";
  return {
    code,
    shareUrl: `${env.siteUrl}/r/${code}`,
    qualifiedCount,
    creditsAvailable,
    creditsSpent: totalCredits - creditsAvailable,
    referralsUntilNextCredit: perReward - (qualifiedCount % perReward),
  };
}

/**
 * Spend one credit on a product. Returns false when the user has no unspent
 * credit; the update is conditional on `spentAt IS NULL` so two concurrent
 * requests cannot spend the same credit twice.
 */
export async function spendReferralCredit(
  userId: string,
  productId: string,
): Promise<boolean> {
  const [credit] = await db
    .select({ id: referralCredits.id })
    .from(referralCredits)
    .where(and(eq(referralCredits.userId, userId), isNull(referralCredits.spentAt)))
    .limit(1);

  if (!credit) return false;

  const claimed = await db
    .update(referralCredits)
    .set({ spentOnProductId: productId, spentAt: new Date() })
    .where(and(eq(referralCredits.id, credit.id), isNull(referralCredits.spentAt)))
    .returning({ id: referralCredits.id });

  if (claimed.length === 0) return false;

  await grantEntitlement({
    userId,
    productId,
    source: "referral",
    sourceRef: credit.id,
  });
  return true;
}
