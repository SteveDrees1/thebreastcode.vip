import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

/**
 * Sentinel used when DATABASE_URL is absent.
 *
 * `next build` imports every route module to collect page data, so this file is
 * evaluated even on machines with no database credentials. postgres-js does not
 * open a socket until the first query, so constructing the client here is free;
 * pointing it at an unroutable host means a genuinely misconfigured deployment
 * fails on its first query rather than silently reading from somewhere else.
 *
 * The alternative — wrapping the handle in a Proxy — breaks the Auth.js Drizzle
 * adapter, which detects the dialect via the prototype chain.
 */
const UNCONFIGURED = "postgresql://unconfigured@255.255.255.255:5432/unconfigured";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "[db] DATABASE_URL is not set — database access will fail. " +
        "Copy .env.example to .env.local and fill it in.",
    );
  }
  // `prepare: false` is required for transaction-pooled connections (Neon's
  // pooled endpoint, PgBouncer): prepared statements do not survive pooling.
  return postgres(url ?? UNCONFIGURED, { prepare: false, max: 10 });
}

// Reuse the socket across hot reloads in dev, otherwise every edit leaks a pool.
const client = globalThis.__pgClient ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
