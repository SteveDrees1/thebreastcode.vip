/**
 * Environment access.
 *
 * Deliberately lazy: `next build` runs module top-level code for every route,
 * and we do not want a missing Stripe key to break a build of pages that never
 * touch Stripe. Each getter throws only when something actually needs it.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /**
   * Origin used for canonicals, og:url, the sitemap and JSON-LD @ids.
   *
   * The order matters more than it looks. `VERCEL_URL` is the *deployment*
   * hostname — `project-a1b2c3-team.vercel.app`, different for every single
   * deploy — so using it for canonicals points them at a URL that is not the
   * site, and a new one each release. `VERCEL_PROJECT_PRODUCTION_URL` is the
   * stable production domain, which is what a canonical is for, so it is tried
   * first and VERCEL_URL is left as the preview-only last resort.
   *
   * NEXT_PUBLIC_SITE_URL still wins, but note it is inlined at *build* time
   * like every NEXT_PUBLIC_ variable: setting it only in the runtime
   * environment has no effect. Set it in the build environment.
   */
  get siteUrl() {
    const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    return (
      process.env.NEXT_PUBLIC_SITE_URL ??
      (fromVercel ? `https://${fromVercel}` : "http://localhost:3000")
    ).replace(/\/$/, "");
  },

  // Stripe
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get stripeSubscriptionPriceId() {
    return required("STRIPE_SUBSCRIPTION_PRICE_ID");
  },

  // Storage
  get s3() {
    return {
      endpoint: required("S3_ENDPOINT"),
      region: process.env.S3_REGION ?? "auto",
      bucket: required("S3_BUCKET"),
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    };
  },
  get downloadTtlSeconds() {
    return optionalInt("DOWNLOAD_URL_TTL_SECONDS", 300);
  },

  // Referrals
  get referralsPerReward() {
    return optionalInt("REFERRALS_PER_REWARD", 3);
  },
} as const;
