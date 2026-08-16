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
import { hit, tooManyRequests } from "@/lib/rate-limit";

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

  const userId = session.user.id;

  // Creating checkout sessions is cheap for us but not free at Stripe, and a
  // loop here would pollute the dashboard with abandoned sessions.
  const limit = hit(`checkout:${userId}`, 12, 60);
  if (!limit.ok) {
    return tooManyRequests(limit, "Too many attempts. Please wait a moment.");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { kind, slug } = parsed.data;

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

    /*
     * Terms acceptance, and the waiver that goes with it.
     *
     * A UK or EU consumer buying at a distance has 14 days to cancel. For
     * digital content delivered immediately that right survives *unless* the
     * customer gave express prior consent to delivery starting and
     * acknowledged losing the right — Consumer Rights Directive art. 16(m),
     * and reg. 37 of the UK Consumer Contracts Regulations.
     *
     * Without this, every download here would remain refundable for fourteen
     * days no matter what the terms page said, because the waiver has to be
     * obtained at the point of sale rather than declared in a document
     * nobody was made to read.
     *
     * `terms_of_service: "required"` makes Checkout show a tickbox linking to
     * the terms and refuse to complete without it, and records the acceptance
     * on the session. The custom text is what makes the consent *express*:
     * it states what is being agreed to instead of relying on the customer
     * opening the terms and finding clause 5.
     *
     * The wording here and the "Your right to cancel" section of /terms are a
     * pair. Changing one without the other breaks the waiver.
     *
     * REQUIRED STRIPE SETTING: `terms_of_service: "required"` needs a Terms of
     * Service URL on the Stripe account (Dashboard → Settings → Business →
     * Public details). Without it Stripe rejects the session and *every*
     * checkout fails, not just the first. This was not verified against the
     * live API — there are no real keys here — so set it before taking
     * payments, and buy something in test mode to confirm. See LEGAL.md.
     */
    consent_collection: { terms_of_service: "required" as const },
    custom_text: {
      terms_of_service_acceptance: {
        message:
          "I agree to the terms of sale, and I ask for my download to be available immediately. " +
          "I understand that once it is, I lose my right to cancel.",
      },
    },
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
