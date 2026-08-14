import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/auth";
import { hasActiveSubscription } from "@/lib/entitlements";
import { CheckoutButton } from "@/components/checkout-button";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "All-access",
  description: "Read every guide in the catalog, including everything published next.",
};

export default async function PricingPage() {
  const session = await auth();
  const subscribed = session?.user?.id
    ? await hasActiveSubscription(session.user.id)
    : false;

  const [{ value: includedCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(
      and(eq(products.status, "published"), eq(products.includedInSubscription, true)),
    );

  return (
    <div className="mx-auto max-w-3xl">
      <header className="text-center">
        <h1 className="font-serif text-3xl">Two ways to read</h1>
        <p className="mt-3 text-ink-soft">
          Buy the guides you want and keep them forever, or subscribe and read the whole
          library.
        </p>
      </header>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="font-serif text-xl">Per guide</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Pay once for the guide you need. It stays in your library permanently, even
            if you never subscribe.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-ink-soft">
            <li>· Yours to keep, no expiry</li>
            <li>· Free revisions within the same edition</li>
            <li>· Bundles available for related sets</li>
          </ul>
          <Link
            href="/catalog"
            className="mt-6 block rounded-full border border-line px-5 py-2.5 text-center font-medium"
          >
            Browse the catalog
          </Link>
        </section>

        <section className="rounded-xl border-2 border-accent bg-surface p-6">
          <h2 className="font-serif text-xl">All-access</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Every guide in the catalog — currently {includedCount} — plus everything
            published while your plan is active.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-ink-soft">
            <li>· Read the entire library</li>
            <li>· New guides unlock automatically</li>
            <li>· Cancel any time from your account</li>
          </ul>

          <div className="mt-6">
            {subscribed ? (
              <Link
                href="/account"
                className="block rounded-full border border-line px-5 py-2.5 text-center font-medium"
              >
                Manage your plan
              </Link>
            ) : (
              <CheckoutButton kind="subscription" label="Start all-access" />
            )}
          </div>
        </section>
      </div>

      <p className="mt-8 text-center text-sm text-ink-soft">
        Prices exclude tax, which is calculated at checkout based on your location.
      </p>
    </div>
  );
}
