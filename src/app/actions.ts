"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { redeemPromoCode } from "@/lib/promos";
import { spendReferralCredit } from "@/lib/referrals";
import { hit } from "@/lib/rate-limit";

/**
 * Redeem a promo code. The result is passed back through the query string so
 * these pages stay plain server components with no client-side state.
 */
export async function redeemCodeAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/redeem");

  // Promo codes are guessable by construction, so this is the one place where
  // an attacker gains from volume. Sign-in is already required, which caps the
  // parallelism; this caps the serial rate.
  const limit = hit(`redeem:${session.user.id}`, 5, 300);
  if (!limit.ok) {
    redirect(
      `/redeem?error=${encodeURIComponent(
        `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).`,
      )}`,
    );
  }

  const code = String(formData.get("code") ?? "");
  const result = await redeemPromoCode(session.user.id, code);

  if (!result.ok) {
    redirect(`/redeem?error=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath("/library");
  redirect(`/library?redeemed=${encodeURIComponent(result.message)}`);
}

/** Spend one banked referral credit on a chosen guide. */
export async function spendCreditAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/referrals");

  const productId = String(formData.get("productId") ?? "");
  if (!productId) redirect("/referrals?error=Choose+a+guide+first.");

  const spent = await spendReferralCredit(session.user.id, productId);
  if (!spent) {
    redirect("/referrals?error=You+have+no+credits+available.");
  }

  revalidatePath("/library");
  redirect("/library?redeemed=Guide+added+with+your+referral+credit.");
}
