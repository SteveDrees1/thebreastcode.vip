import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { products } from "@/db/schema";
import { env } from "@/lib/env";
import { getReferralSummary } from "@/lib/referrals";
import { ownedProductIds } from "@/lib/entitlements";
import { spendCreditAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Refer a friend" };

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/referrals");

  const { error } = await searchParams;
  const summary = await getReferralSummary(session.user.id);
  const owned = await ownedProductIds(session.user.id);

  const catalog = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(eq(products.status, "published"))
    .orderBy(asc(products.title));

  const claimable = catalog.filter((p) => !owned.has(p.id));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Refer a friend</h1>
      <p className="mt-3 text-ink-soft">
        Share your link. Once someone signs up and confirms their email they count as a
        referral, and every {env.referralsPerReward} referrals earn you a free guide of
        your choice.
      </p>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft">Your link</p>
        <p className="mt-1 break-all font-mono text-sm">{summary.shareUrl}</p>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-4 text-center">
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-ink-soft">Referrals</dt>
          <dd className="mt-1 text-2xl font-medium">{summary.qualifiedCount}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-ink-soft">Credits</dt>
          <dd className="mt-1 text-2xl font-medium">{summary.creditsAvailable}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-ink-soft">
            To next credit
          </dt>
          <dd className="mt-1 text-2xl font-medium">
            {summary.referralsUntilNextCredit}
          </dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="font-serif text-xl">Spend a credit</h2>
        {summary.creditsAvailable === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No credits yet — share your link to earn one.
          </p>
        ) : claimable.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            You already own every published guide. Your credits stay banked for whatever
            comes next.
          </p>
        ) : (
          <form action={spendCreditAction} className="mt-4 flex flex-wrap gap-3">
            <select
              name="productId"
              required
              className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
            >
              <option value="">Choose a guide…</option>
              {claimable.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-accent px-5 py-2.5 font-medium text-white"
            >
              Claim it free
            </button>
          </form>
        )}

        {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
      </section>
    </div>
  );
}
