import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Paths no crawler should index.
 *
 * Two different reasons, worth keeping straight:
 *   - per-customer pages mean nothing without a session and would leak a
 *     private URL into an index if one ever escaped;
 *   - /api and /r are machinery, not content.
 *
 * These are duplicated by `robots: { index: false }` on the pages themselves
 * and by an `X-Robots-Tag` header on /admin. robots.txt asks politely and is
 * publicly readable; the meta tag and header are what actually keep a page out
 * of an index if a crawler ignores this file.
 */
const PRIVATE_PATHS = [
  "/api/",
  "/admin",
  "/library",
  "/account",
  "/referrals",
  "/redeem",
  "/signin",
  "/r/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        /*
         * Assistant crawlers are allowed the same public catalog as everyone
         * else, and pointed at /llms.txt. Being answerable inside an assistant
         * is discovery for a store like this, not leakage — the PDFs are not
         * public, so the most a model can read is the sales page.
         *
         * To opt out of AI training or answering, change this rule's `allow`
         * to a `disallow: ["/"]` for the agents you object to. Listing them
         * explicitly makes that a one-line decision later rather than a
         * research project.
         */
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "PerplexityBot",
          "Google-Extended",
          "Applebot-Extended",
          "CCBot",
          "meta-externalagent",
        ],
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
