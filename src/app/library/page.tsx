import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listLibrary } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your library" };

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
        <div className="mb-8 rounded-xl border border-accent bg-accent-soft p-4">
          <p className="font-medium">{redeemed}</p>
        </div>
      ) : null}

      {checkout === "success" ? (
        <div className="mb-8 rounded-xl border border-accent bg-accent-soft p-4">
          <p className="font-medium">Thank you — your purchase is complete.</p>
          <p className="mt-1 text-sm text-ink-soft">
            If a guide is not listed yet, refresh in a moment: payment confirmation can
            take a few seconds to arrive.
          </p>
        </div>
      ) : null}

      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="font-serif text-3xl">Your library</h1>
        <Link href="/redeem" className="text-sm text-accent underline">
          Redeem a code
        </Link>
      </header>

      {library.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">Nothing here yet.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Guides you buy, unlock with all-access, or redeem with a code will appear
            here.
          </p>
          <Link
            href="/catalog"
            className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-white"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {library.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/catalog/${entry.slug}`}
                  className="font-medium hover:underline"
                >
                  {entry.title}
                </Link>
                <p className="text-sm text-ink-soft">
                  {entry.via === "subscription" ? "Included with all-access" : "Owned"}
                  {entry.pageCount ? ` · ${entry.pageCount} pages` : ""}
                </p>
              </div>
              <a
                href={`/api/download/${entry.id}`}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
