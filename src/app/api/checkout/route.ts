/**
 * Creates a Stripe Checkout session for a single product, a bundle, or the
 * all-access subscription.
 *
 * Prices are always read from OUR database (or an existing Stripe Price), never
 * from the request body — otherwise a caller could post their own amount.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { bundles, products } from "@/db/schema";
import { env } from "@/lib/env";
import { getOrCreateCustomer, stripe } from "@/lib/stripe";
import { hasAccess, hasActiveSubscription } from "@/lib/entitlements";

const bodySchema = z.object({
  kind: z.enum(["product", "bundle", "subscription"]),
  /** Slug of the product/bundle. Omitted for subscriptions. */
  slug: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { kind, slug } = parsed.data;
  const userId = session.user.id;

  const customerId = await getOrCreateCustomer(userId, session.user.email);
  const successUrl = `${env.siteUrl}/library?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${env.siteUrl}/catalog?checkout=cancelled`;

  // Shared config. Stripe Tax computes VAT/sales tax; `customer_update` lets it
  // save the address it collects, which is required for tax to work on repeat
  // purchases.
  const common = {
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    automatic_tax: { enabled: true },
    customer_update: { address: "auto" as const, name: "auto" as const },
    billing_address_collection: "auto" as const,
    allow_promotion_codes: true,
  };

  try {
    if (kind === "subscription") {
      if (await hasActiveSubscription(userId)) {
        return NextResponse.json(
          { error: "You already have an active subscription." },
          { status: 409 },
        );
      }
      const checkout = await stripe().checkout.sessions.create({
        ...common,
        mode: "subscription",
        line_items: [{ price: env.stripeSubscriptionPriceId, quantity: 1 }],
        subscription_data: { metadata: { userId } },
        metadata: { userId, kind: "subscription" },
      });
      return NextResponse.json({ url: checkout.url });
    }

    if (!slug) {
      return NextResponse.json({ error: "Missing item." }, { status: 400 });
    }

    if (kind === "product") {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1);

      if (!product || product.status !== "published") {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (await hasAccess(userId, product.id)) {
        return NextResponse.json({ error: "You already own this." }, { status: 409 });
      }

      const checkout = await stripe().checkout.sessions.create({
        ...common,
        mode: "payment",
        line_items: [
          product.stripePriceId
            ? { price: product.stripePriceId, quantity: 1 }
            : {
                quantity: 1,
                price_data: {
                  currency: product.currency,
                  unit_amount: product.priceCents,
                  // Digital goods tax category, so Stripe Tax rates correctly.
                  tax_behavior: "exclusive" as const,
                  product_data: {
                    name: product.title,
                    description: product.subtitle ?? undefined,
                  },
                },
              },
        ],
        metadata: { userId, kind: "product", productId: product.id },
      });
      return NextResponse.json({ url: checkout.url });
    }

    // kind === "bundle"
    const [bundle] = await db.select().from(bundles).where(eq(bundles.slug, slug)).limit(1);
    if (!bundle || bundle.status !== "published") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const checkout = await stripe().checkout.sessions.create({
      ...common,
      mode: "payment",
      line_items: [
        bundle.stripePriceId
          ? { price: bundle.stripePriceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: bundle.currency,
                unit_amount: bundle.priceCents,
                tax_behavior: "exclusive" as const,
                product_data: {
                  name: bundle.title,
                  description: bundle.subtitle ?? undefined,
                },
              },
            },
      ],
      metadata: { userId, kind: "bundle", bundleId: bundle.id },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("[checkout] failed", error);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
