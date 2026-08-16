/**
 * Deployment health, split from the route so it can be unit tested.
 *
 * `env.ts` resolves lazily on purpose — `next build` evaluates every route
 * module, and a missing Stripe key must not break a build of pages that never
 * touch Stripe. The cost of that laziness is that a production deploy missing
 * STRIPE_SECRET_KEY boots perfectly and fails the first time a customer clicks
 * Buy, which is the worst possible moment to find out.
 *
 * This is the counterweight: something that asks the questions up front, so a
 * misconfigured deploy can be caught by a monitor instead of by a customer.
 */

/** Configuration a running deployment needs, grouped by what breaks without it. */
const REQUIRED_BY_AREA = {
  database: ["DATABASE_URL"],
  auth: ["AUTH_SECRET"],
  payments: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_SUBSCRIPTION_PRICE_ID"],
  storage: ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
  email: ["EMAIL_SERVER_HOST", "EMAIL_SERVER_USER", "EMAIL_SERVER_PASSWORD", "EMAIL_FROM"],
} as const;

export type Area = keyof typeof REQUIRED_BY_AREA;

export interface AreaReport {
  ok: boolean;
  /** Names only. The values are secrets and must never appear in a response. */
  missing: string[];
}

export type ConfigReport = Record<Area, AreaReport>;

/**
 * Which areas are fully configured.
 *
 * Reports the *names* of absent variables and never their values — this feeds
 * an endpoint, and "which secrets exist" is already more than a stranger
 * should learn, let alone what they are.
 */
export function checkConfig(
  // Not `NodeJS.ProcessEnv`: that type requires NODE_ENV, which would force
  // every caller and test fixture to carry a field this function never reads.
  source: Record<string, string | undefined> = process.env,
): ConfigReport {
  const report = {} as ConfigReport;
  for (const [area, names] of Object.entries(REQUIRED_BY_AREA) as Array<
    [Area, readonly string[]]
  >) {
    const missing = names.filter((name) => !source[name]?.trim());
    report[area] = { ok: missing.length === 0, missing };
  }
  return report;
}

/** True when every area is configured. */
export function isConfigHealthy(report: ConfigReport): boolean {
  return Object.values(report).every((area) => area.ok);
}

/** Areas that are not fully configured, for a terse summary line. */
export function degradedAreas(report: ConfigReport): Area[] {
  return (Object.entries(report) as Array<[Area, AreaReport]>)
    .filter(([, area]) => !area.ok)
    .map(([name]) => name);
}
