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
import { CopyField } from "@/components/copy-field";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Refer a friend", robots: { index: false } };

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/referrals");

  const { error } = await searchParams;
  const [summary, owned, catalog] = await Promise.all([
    getReferralSummary(session.user.id),
    ownedProductIds(session.user.id),
    db
      .select({ id: products.id, title: products.title })
      .from(products)
      .where(eq(products.status, "published"))
      .orderBy(asc(products.title)),
  ]);

  const claimable = catalog.filter((p) => !owned.has(p.id));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label label-copper">Referrals</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
        Refer a friend
      </h1>
      <p className="mt-3 text-muted">
        Share your link. Once someone signs up and confirms their email they count as a
        referral, and every {env.referralsPerReward} referrals earn you a free set of
        your choice.
      </p>

      <CopyField value={summary.shareUrl} label="Your link" className="mt-8" />

      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line">
        {[
          { k: "Referrals", v: summary.qualifiedCount },
          { k: "Credits", v: summary.creditsAvailable },
          { k: "To next", v: summary.referralsUntilNextCredit },
        ].map((stat) => (
          <div key={stat.k} className="bg-surface px-5 py-4 text-center">
            <dt className="label">{stat.k}</dt>
            <dd className="mt-1.5 font-display text-3xl font-bold text-copper">
              {String(stat.v).padStart(2, "0")}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">Spend a credit</h2>
        <hr className="rule mt-4 mb-5" />

        {summary.creditsAvailable === 0 ? (
          <p className="text-sm text-muted">
            No credits yet — share your link to earn one.
          </p>
        ) : claimable.length === 0 ? (
          <p className="text-sm text-muted">
            You already own every published set. Your credits stay banked for whatever
            comes next.
          </p>
        ) : (
          <form action={spendCreditAction} className="flex flex-wrap gap-3">
            <label htmlFor="productId" className="sr-only">
              Choose a set
            </label>
            <select id="productId" name="productId" required className="field flex-1">
              <option value="">Choose a set…</option>
              {claimable.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Claim it free
            </button>
          </form>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-copper">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
