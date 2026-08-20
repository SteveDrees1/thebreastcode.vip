"use client";

import { useEffect } from "react";
import { brand, palette } from "@/lib/brand";

/**
 * The last boundary, for a failure in the root layout itself.
 *
 * `error.tsx` sits *inside* the root layout, so it cannot catch an error the
 * layout throws on its way to rendering — and this layout does real work on
 * every request: it calls `auth()`, which reads the session from the database.
 * A database that is refusing connections therefore takes out the one file
 * that renders the page chrome, and without this Next falls back to its own
 * unstyled page: in production, the bare line "Application error: a
 * server-side exception has occurred".
 *
 * Everything here is inline. `globals.css` is imported by the root layout, so
 * a stylesheet is exactly the thing that may not be there; a fallback that
 * needs the CSS to look right is a fallback that looks broken precisely when
 * it is used. This file also has to render its own `<html>` and `<body>`,
 * because it replaces the layout rather than nesting inside it.
 *
 * The digest, not the message: in production Next withholds the real error to
 * avoid leaking internals, and the digest is what ties what the customer saw
 * to the entry in the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: palette.ink,
          color: palette.text,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "30rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.6875rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: palette.copper,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
            }}
          >
            {brand.name}
          </p>

          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "2rem",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            The site is having a moment
          </h1>

          <p style={{ margin: "1rem 0 0", color: palette.muted, lineHeight: 1.6 }}>
            Something failed before the page could be built. This is on our side,
            not yours, and it is usually brief.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              padding: "0.7rem 1.4rem",
              borderRadius: 999,
              border: "1px solid transparent",
              background: palette.copper,
              /* Same near-black the .btn-primary label uses on copper: 7.32:1. */
              color: "#1a1206",
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p
              style={{
                margin: "2rem 0 0",
                fontSize: "0.6875rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: palette.faint,
                fontFamily: "ui-monospace, 'SF Mono', monospace",
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
