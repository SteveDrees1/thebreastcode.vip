import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "./env";

let cached: Stripe | undefined;

export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(env.stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
      appInfo: { name: "thebreastcode.vip", version: "0.1.0" },
    });
  }
  return cached;
}

/**
 * Get (or lazily create) the Stripe customer for a user.
 *
 * Having a stable customer means Stripe Tax can remember the customer's
 * address, the billing portal works, and subscription events map back to a user
 * without guessing from an email address.
 */
export async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe().customers.create({
    email,
    // The webhook reads this to find the user without a database lookup by email.
    metadata: { userId },
  });

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, userId));

  return customer.id;
}

export function formatPrice(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
