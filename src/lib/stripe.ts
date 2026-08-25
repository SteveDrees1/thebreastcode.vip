import Stripe from "stripe";
import packageJson from "../../package.json" with { type: "json" };
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { brand } from "./brand";
import { env } from "./env";

/*
 * Read from package.json rather than repeated. `with { type: "json" }` is the
 * import-attributes syntax Node and the bundler both accept; a plain import of
 * a JSON file is not portable across them.
 */
const APP_VERSION: string = packageJson.version;

let cached: Stripe | undefined;

export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(env.stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
      /*
       * appInfo is what Stripe shows in the dashboard's request logs and in
       * the app registry. It had the domain and the version typed out here,
       * which broke the rule that brand strings live in one module and left
       * the version to go stale the moment package.json moved. It never
       * would have been noticed: nothing renders this, and Stripe accepts
       * whatever it is told.
       */
      appInfo: { name: brand.domain, version: APP_VERSION },
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
