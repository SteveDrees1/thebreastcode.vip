/**
 * Hands the customer to Stripe's billing portal, where they can update their
 * card, download invoices, and cancel. Cheaper and safer than rebuilding that.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import { hit, tooManyRequests } from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  /*
   * The only endpoint in this app that reached a paid API with no ceiling.
   * Every sibling has one — checkout 12/min, downloads 30/5min, redemptions
   * 5/5min, console actions 60/min — and a gap in an otherwise uniform pattern
   * is the one an attacker looks for. A signed-in tab looping here makes a
   * live Stripe API call per request, against the account's quota, for free.
   *
   * Twelve a minute is the same allowance checkout gets, and for the same
   * reason: a person clicking "manage billing" will never approach it.
   */
  const limit = hit(`portal:${session.user.id}`, 12, 60);
  if (!limit.ok) {
    return tooManyRequests(limit, "Too many attempts. Please wait a moment.");
  }

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 404 });
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.siteUrl}/account`,
  });

  return NextResponse.json({ url: portal.url });
}
