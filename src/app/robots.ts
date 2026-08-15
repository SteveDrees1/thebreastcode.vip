import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing here is useful to a crawler, and several are per-customer.
        disallow: [
          "/api/",
          "/admin",
          "/library",
          "/account",
          "/referrals",
          "/redeem",
          "/signin",
          "/r/",
        ],
      },
    ],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
