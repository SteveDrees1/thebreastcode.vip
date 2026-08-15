import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { auth } from "@/auth";
import { hasActiveSubscription } from "@/lib/entitlements";
import { CheckoutButton } from "@/components/checkout-button";

// Rendered per request: the header and buy state depend on the session, so
// this route reads cookies and cannot be prerendered. Data caching lives in
// lib/catalog.ts, which keeps the database out of the hot path.

export const metadata: Metadata = {
  title: "All-access",
  description:
    "Read every plate set in the catalog, including everything published next.",
  alternates: { canonical: "/pricing" },
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
        <p className="label label-copper">Pricing</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
          Two ways to read
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Buy the sets you want and keep them forever, or subscribe and read the whole
          library.
        </p>
      </header>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <section className="panel reg flex flex-col p-7">
          <p className="label">Option 01</p>
          <h2 className="mt-3 font-display text-2xl font-bold">Per set</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pay once for the set you need. It stays in your library permanently, even if
            you never subscribe.
          </p>
          <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
            {[
              "Yours to keep, no expiry",
              "Free revisions within the same edition",
              "Bundles available for related series",
            ].map((line) => (
              <li key={line} className="flex items-baseline gap-3">
                <span aria-hidden className="h-px w-3 shrink-0 bg-copper" />
                {line}
              </li>
            ))}
          </ul>
          <Link href="/catalog" className="btn btn-ghost mt-7 w-full">
            Browse the catalog
          </Link>
        </section>

        <section className="panel reg relative flex flex-col border-copper/50 p-7">
          <div className="absolute -top-px right-6 rounded-b bg-copper px-2.5 py-1 text-[0.625rem] font-semibold tracking-widest text-[#1a1206] uppercase">
            Best value
          </div>

          <p className="label label-copper">Option 02</p>
          <h2 className="mt-3 font-display text-2xl font-bold">All-access</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Every set in the catalog — currently {includedCount} — plus everything
            published while your plan is active.
          </p>
          <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
            {[
              "Read the entire library",
              "New sets unlock automatically",
              "Cancel any time from your account",
            ].map((line) => (
              <li key={line} className="flex items-baseline gap-3">
                <span aria-hidden className="h-px w-3 shrink-0 bg-copper" />
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-7">
            {subscribed ? (
              <Link href="/account" className="btn btn-ghost w-full">
                Manage your plan
              </Link>
            ) : (
              <CheckoutButton kind="subscription" label="Start all-access" />
            )}
          </div>
        </section>
      </div>

      <p className="mt-8 text-center text-sm text-faint">
        Prices exclude tax, which is calculated at checkout based on your location.
      </p>
    </div>
  );
}
