import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * No remote hosts are optimizable, on purpose.
   *
   * These patterns used to be `**.r2.dev` and `**.amazonaws.com`. A wildcard at
   * that level is every bucket on those providers, not ours — and /_next/image
   * ships enabled whether or not the app imports next/image, so the endpoint
   * was a live open proxy. Verified against the production build: a host
   * outside the list is rejected at 400 before any fetch, while
   * `attacker-bucket.s3.amazonaws.com` returned 403 relayed from upstream —
   * proof the server had already made the outbound request.
   *
   * Two things made that worse than an ordinary SSRF. The fetched bytes are
   * handed to Next's bundled sharp, pinned at 0.34.5, which carries four high
   * severity libvips CVEs (GHSA-f88m-g3jw-g9cj) fixed only in 0.35.0+. And
   * nothing needed the patterns: covers render as plain <img> (see
   * product-card.tsx) because they arrive pre-sized from the bucket, so
   * next/image is imported nowhere in src/.
   *
   * With the list empty the optimizer rejects every remote URL at 400, which
   * puts attacker-controlled bytes out of reach of the vulnerable sharp. If you
   * later adopt next/image, add the one exact bucket hostname here — never a
   * wildcard that spans a provider's whole domain.
   */
  images: {
    remotePatterns: [],
  },
  // Trim the server fingerprint; it only helps someone targeting a known stack.
  poweredByHeader: false,
  reactStrictMode: true,

  // Cheap wins: smaller payloads and fewer client bytes.
  compress: true,
  experimental: {
    optimizePackageImports: ["@aws-sdk/client-s3"],
  },

  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        /*
         * Nothing here needs these; denying them shrinks the attack surface and
         * stops third-party scripts from asking on our behalf.
         *
         * `browsing-topics=()` replaces the `interest-cohort=()` that used to
         * be here. interest-cohort was the opt-out for FLoC, which Chrome
         * abandoned; the Topics API that replaced it reads `browsing-topics`,
         * so the old directive is now a no-op that only looks like an opt-out.
         * Both are listed: the obsolete one costs nothing and still covers any
         * browser that never moved on.
         */
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
          "browsing-topics=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      {
        /*
         * Stop another origin loading our responses as a subresource — an
         * <img>, a <script>, a fetch it never reads. COOP already isolates the
         * browsing context; this is the other half, and without it a
         * cross-origin page can still pull a signed download redirect or an
         * API response into its own document.
         *
         * Deliberately not paired with Cross-Origin-Embedder-Policy. COEP buys
         * cross-origin isolation, which is only worth having for
         * SharedArrayBuffer and precise timers — neither of which this app
         * uses — and it breaks any third-party embed added later. Skipped on
         * purpose rather than overlooked.
         */
        key: "Cross-Origin-Resource-Policy",
        value: "same-origin",
      },
      { key: "X-DNS-Prefetch-Control", value: "on" },
    ];

    return [
      { source: "/:path*", headers: security },
      {
        // Signed download redirects and account pages must never be cached by a
        // shared proxy — one customer's link would be served to another.
        source: "/api/download/:path*",
        headers: [
          ...security,
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/(library|account|referrals|redeem)",
        headers: [
          ...security,
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        // The console shows every customer's order history. Nothing about it
        // may be cached anywhere, or indexed if a URL ever escapes.
        source: "/admin/:path*",
        headers: [
          ...security,
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Hashed filenames are immutable by definition.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        /*
         * Covers are keyed by slug, not by content hash, so they must stay
         * replaceable when a set is revised — `immutable` would strand the old
         * image in caches. An hour fresh plus a day of stale-while-revalidate
         * means repeat visitors pay nothing and a new cover still lands within
         * a day, without a deploy.
         */
        source: "/covers/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
