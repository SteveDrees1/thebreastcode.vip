import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders, subscriptions } from "@/db/schema";
import { formatPrice } from "@/lib/stripe";
import { PortalButton } from "@/components/portal-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/account");

  const [[subscription], history] = await Promise.all([
    db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, session.user.id),
          inArray(subscriptions.status, ["active", "trialing", "past_due"]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
    db
      .select()
      .from(orders)
      .where(eq(orders.userId, session.user.id))
      .orderBy(desc(orders.createdAt))
      .limit(25),
  ]);

  const active = subscription && ["active", "trialing"].includes(subscription.status);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label label-copper">Your account</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Account</h1>
      <p className="mt-2 font-mono text-sm text-muted">{session.user.email}</p>

      <section className="panel reg mt-9 p-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold">All-access plan</h2>
          {active ? (
            <span
              aria-hidden
              className="live-dot inline-block size-1.5 rounded-full bg-cyan"
            />
          ) : null}
        </div>

        {active ? (
          <>
            <p className="mt-2.5 text-sm text-muted">
              Status: <span className="text-text">{subscription.status}</span>
              {subscription.currentPeriodEnd
                ? subscription.cancelAtPeriodEnd
                  ? ` · ends ${subscription.currentPeriodEnd.toLocaleDateString()}`
                  : ` · renews ${subscription.currentPeriodEnd.toLocaleDateString()}`
                : ""}
            </p>
            <PortalButton className="mt-5" />
          </>
        ) : (
          <>
            <p className="mt-2.5 text-sm text-muted">
              You don&rsquo;t have an active plan.
            </p>
            <Link href="/pricing" className="btn btn-primary mt-5">
              See all-access
            </Link>
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">Purchase history</h2>
        <hr className="rule mt-4 mb-2" />

        {history.length === 0 ? (
          <p className="py-4 text-sm text-muted">No purchases yet.</p>
        ) : (
          <ul>
            {history.map((order) => (
              <li
                key={order.id}
                className="flex items-center gap-4 border-b border-line py-3.5 text-sm"
              >
                <span className="label">
                  {order.createdAt.toLocaleDateString()}
                </span>
                <span className="ml-auto font-display font-semibold">
                  {formatPrice(order.amountTotalCents, order.currency)}
                </span>
                <span
                  className={`label ${
                    order.status === "refunded" ? "" : "label-copper"
                  }`}
                >
                  {order.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
