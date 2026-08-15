import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { redeemCodeAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Redeem a code", robots: { index: false } };

export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/redeem");

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <p className="label label-copper">Promotions</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
        Redeem a code
      </h1>
      <p className="mt-3 text-muted">
        Got a code from a promotion, a giveaway, or a friend? Enter it here and the sets
        it unlocks are added to your library.
      </p>

      <form action={redeemCodeAction} className="panel reg mt-8 p-6">
        <label htmlFor="code" className="label">
          Your code
        </label>
        <input
          id="code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="LAUNCH2026"
          aria-describedby={error ? "redeem-error" : undefined}
          className="field mt-2.5 tracking-[0.2em] uppercase"
        />
        <button type="submit" className="btn btn-primary mt-4 w-full">
          Redeem
        </button>
      </form>

      {error ? (
        <p id="redeem-error" role="alert" className="panel mt-4 p-4 text-sm text-copper">
          {error}
        </p>
      ) : null}
    </div>
  );
}
