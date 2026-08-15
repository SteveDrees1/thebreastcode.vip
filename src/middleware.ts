import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content Security Policy with a fresh nonce.
 *
 * A nonce is what makes `strict-dynamic` usable: Next's inline bootstrap script
 * is allowed because it carries this nonce, and any script an attacker manages
 * to inject is not. Next reads the nonce off the request header and stamps it
 * onto the scripts it emits.
 *
 * `style-src` still needs 'unsafe-inline'. Next injects inline <style> during
 * streaming and there is no nonce hook for it; styles are a far weaker vector
 * than scripts, so this is the accepted trade-off rather than an oversight.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' is required by the dev-mode React refresh runtime only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: ${isDev ? "'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // data: covers inlined placeholders; blob: covers client-generated previews.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Checkout and the billing portal are redirects, not embeds, so no frame-src
    // for Stripe is needed. Keep framing off entirely.
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self' https://api.stripe.com",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the Stripe webhook. The webhook is
     * excluded because it is a server-to-server POST that never renders HTML,
     * and its signature check is the real gate.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
