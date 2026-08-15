"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Recoverable error boundary.
 *
 * Shows the digest rather than the message: in production Next withholds the
 * real error to avoid leaking internals, and the digest is the handle that ties
 * what the customer saw to the entry in the server log. Asking someone to quote
 * eight characters is far better support than "something went wrong".
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="label label-copper">Error</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
        Something broke
      </h1>
      <p className="mt-4 text-muted">
        This page failed to load. Trying again often works — the fault is usually
        momentary.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/catalog" className="btn btn-ghost">
          Back to the catalog
        </Link>
      </div>

      {error.digest ? (
        <p className="label mt-8">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
