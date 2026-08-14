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

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/account");

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, session.user.id),
        inArray(subscriptions.status, ["active", "trialing", "past_due"]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const history = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt))
    .limit(25);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Account</h1>
      <p className="mt-2 text-ink-soft">{session.user.email}</p>

      <section className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-xl">All-access plan</h2>
        {subscription && ["active", "trialing"].includes(subscription.status) ? (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              Status: <span className="font-medium text-ink">{subscription.status}</span>
              {subscription.currentPeriodEnd
                ? subscription.cancelAtPeriodEnd
                  ? ` · ends ${subscription.currentPeriodEnd.toLocaleDateString()}`
                  : ` · renews ${subscription.currentPeriodEnd.toLocaleDateString()}`
                : ""}
            </p>
            <PortalButton className="mt-4" />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              You don&rsquo;t have an active plan.
            </p>
            <Link
              href="/pricing"
              className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-white"
            >
              See all-access
            </Link>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl">Purchase history</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No purchases yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
            {history.map((order) => (
              <li key={order.id} className="flex items-center gap-4 py-3">
                <span className="text-ink-soft">
                  {order.createdAt.toLocaleDateString()}
                </span>
                <span className="ml-auto font-medium">
                  {formatPrice(order.amountTotalCents, order.currency)}
                </span>
                <span
                  className={
                    order.status === "refunded" ? "text-ink-soft" : "text-accent"
                  }
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
