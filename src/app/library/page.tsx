import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listLibrary } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your library", robots: { index: false } };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; redeemed?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/library");

  const { checkout, redeemed } = await searchParams;
  const library = await listLibrary(session.user.id);

  return (
    <div>
      {redeemed ? (
        <div role="status" className="panel mb-8 border-copper/40 p-4">
          <p className="font-display font-semibold text-copper">{redeemed}</p>
        </div>
      ) : null}

      {checkout === "success" ? (
        <div role="status" className="panel mb-8 border-copper/40 p-5">
          <p className="font-display font-semibold text-copper">
            Thank you — your purchase is complete.
          </p>
          <p className="mt-1.5 text-sm text-muted">
            If a set is not listed yet, refresh in a moment: payment confirmation can
            take a few seconds to arrive.
          </p>
        </div>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label label-copper">Your account</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Library</h1>
        </div>
        <Link href="/redeem" className="label transition hover:text-copper">
          Redeem a code →
        </Link>
      </header>

      <hr className="rule mt-6 mb-9" />

      {library.length === 0 ? (
        <div className="panel reg p-12 text-center">
          <p className="font-display text-lg font-semibold">Nothing here yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Sets you buy, unlock with all-access, or redeem with a code will appear here.
          </p>
          <Link href="/catalog" className="btn btn-primary mt-6">
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {library.map((entry, i) => (
            <li
              key={entry.id}
              className="panel reg flex flex-wrap items-center gap-5 p-5"
            >
              <span className="label label-copper">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/catalog/${entry.slug}`}
                  className="font-display font-medium transition hover:text-copper"
                >
                  {entry.title}
                </Link>
                <p className="label mt-1">
                  {entry.via === "subscription" ? "All-access" : "Owned"}
                  {entry.pageCount ? ` · ${entry.pageCount} plates` : ""}
                </p>
              </div>

              <a href={`/api/download/${entry.id}`} className="btn btn-primary shrink-0">
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
