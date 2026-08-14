/**
 * Stripe webhook — the only place money turns into access.
 *
 * Everything here must be safe to run twice: Stripe retries on any non-2xx and
 * can deliver the same event more than once. Idempotency comes from the unique
 * index on `orders.stripeCheckoutSessionId` and from `grantEntitlement` doing
 * ON CONFLICT DO NOTHING, so a replay writes nothing new.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { orderItems, orders, products, bundles, subscriptions, users } from "@/db/schema";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { grantBundle, grantEntitlement, revokeBySourceRef } from "@/lib/entitlements";

// Stripe signature verification needs the raw body, so this route must never be
// statically optimised or run on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  } catch (error) {
    console.error("[stripe] signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertSubscription(event.data.object);
        break;

      case "charge.refunded":
        await handleRefund(event.data.object);
        break;

      default:
        // Unhandled types are acknowledged so Stripe stops retrying them.
        break;
    }
  } catch (error) {
    // Return 500 so Stripe retries — better a duplicate delivery (which is safe)
    // than a paid customer with no access.
    console.error(`[stripe] handler failed for ${event.type}`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Only grant once money has actually settled. Async payment methods fire this
  // event while still "unpaid"; those arrive later as async_payment_succeeded.
  if (session.payment_status === "unpaid") return;

  const userId = session.metadata?.userId;
  const kind = session.metadata?.kind;
  if (!userId) {
    console.error("[stripe] checkout session without userId", session.id);
    return;
  }

  // Subscriptions get their access from the subscription record, not an order.
  if (kind === "subscription") {
    if (typeof session.subscription === "string") {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await upsertSubscription(sub);
    }
    return;
  }

  const inserted = await db
    .insert(orders)
    .values({
      userId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      amountSubtotalCents: session.amount_subtotal ?? 0,
      amountTaxCents: session.total_details?.amount_tax ?? 0,
      amountTotalCents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      status: "paid",
    })
    .onConflictDoNothing({ target: orders.stripeCheckoutSessionId })
    .returning({ id: orders.id });

  // Already processed — a replay. The original delivery granted access.
  if (inserted.length === 0) return;
  const orderId = inserted[0].id;

  if (kind === "product") {
    const productId = session.metadata?.productId;
    if (!productId) return;

    const [product] = await db
      .select({ title: products.title, priceCents: products.priceCents })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    await db.insert(orderItems).values({
      orderId,
      kind: "product",
      productId,
      titleSnapshot: product?.title ?? "PDF",
      unitAmountCents: session.amount_subtotal ?? product?.priceCents ?? 0,
    });

    await grantEntitlement({ userId, productId, source: "purchase", sourceRef: orderId });
    return;
  }

  if (kind === "bundle") {
    const bundleId = session.metadata?.bundleId;
    if (!bundleId) return;

    const [bundle] = await db
      .select({ title: bundles.title, priceCents: bundles.priceCents })
      .from(bundles)
      .where(eq(bundles.id, bundleId))
      .limit(1);

    await db.insert(orderItems).values({
      orderId,
      kind: "bundle",
      bundleId,
      titleSnapshot: bundle?.title ?? "Bundle",
      unitAmountCents: session.amount_subtotal ?? bundle?.priceCents ?? 0,
    });

    await grantBundle(userId, bundleId, orderId, "bundle");
  }
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Prefer the metadata we set at checkout; fall back to the customer mapping
  // for subscriptions created directly in the Stripe dashboard.
  let userId = sub.metadata?.userId;
  if (!userId) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);
    userId = user?.id;
  }
  if (!userId) {
    console.error("[stripe] subscription with no resolvable user", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const periodEnd = sub.current_period_end ?? null;

  const values = {
    userId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
    stripePriceId: item?.price?.id ?? null,
    status: sub.status as (typeof subscriptions.status.enumValues)[number],
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        status: values.status,
        stripePriceId: values.stripePriceId,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelAtPeriodEnd: values.cancelAtPeriodEnd,
        updatedAt: values.updatedAt,
      },
    });
}

/**
 * Revoke access when a purchase is refunded. Partial refunds are left alone —
 * those are usually goodwill gestures, not a withdrawal of the product.
 */
async function handleRefund(charge: Stripe.Charge) {
  if (charge.amount_refunded < charge.amount) return;

  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!paymentIntentId) return;

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!order) return;

  await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id));
  await revokeBySourceRef(order.id);
}
