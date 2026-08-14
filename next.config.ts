import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Product cover images live in the public bucket; everything else is inlined.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
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
        // Nothing here needs these; denying them shrinks the attack surface and
        // stops third-party scripts from asking on our behalf.
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
        // Hashed filenames are immutable by definition.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
