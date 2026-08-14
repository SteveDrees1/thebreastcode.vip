"use client";

import { useState, useTransition } from "react";

/** Opens the Stripe billing portal for the signed-in customer. */
export function PortalButton({ className }: { className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function open() {
    setError(null);
    const res = await fetch("/api/portal", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error ?? "Could not open the billing portal.");
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(open)}
        className="rounded-full border border-line px-5 py-2.5 font-medium disabled:opacity-60"
      >
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
    </div>
  );
}
