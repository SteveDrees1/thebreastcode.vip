"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  kind: "product" | "bundle" | "subscription";
  slug?: string;
  label: string;
  className?: string;
}

/**
 * Starts a Stripe Checkout session and forwards the browser to it. Kept as a
 * client component so the rest of every page can stay server-rendered.
 */
export function CheckoutButton({ kind, slug, label, className }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function start() {
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, slug }),
    });

    if (res.status === 401) {
      router.push(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error ?? "Something went wrong. Please try again.");
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(start)}
        className="btn btn-primary w-full"
      >
        {pending ? "Starting checkout…" : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-copper">
          {error}
        </p>
      ) : null}
    </div>
  );
}
