import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { redeemCodeAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Redeem a code" };

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
      <h1 className="font-serif text-3xl">Redeem a code</h1>
      <p className="mt-3 text-ink-soft">
        Got a code from a promotion, a giveaway, or a friend? Enter it here and the
        guides it unlocks are added to your library.
      </p>

      <form action={redeemCodeAction} className="mt-6">
        <label htmlFor="code" className="block text-sm font-medium">
          Your code
        </label>
        <input
          id="code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="LAUNCH2026"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-2.5 uppercase tracking-wide outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-full bg-accent px-5 py-2.5 font-medium text-white"
        >
          Redeem
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-lg border border-line bg-accent-soft p-3 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
