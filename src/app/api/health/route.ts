/**
 * Liveness and readiness, for uptime monitors and post-deploy checks.
 *
 * Deliberately two-tier. An unauthenticated caller gets a verdict and nothing
 * else — `{ status, time }` plus 200 or 503, which is all a load balancer or
 * an uptime monitor needs. Naming which subsystem is unconfigured tells a
 * stranger which part of the stack to go after, so that detail is behind the
 * admin gate.
 *
 * Not rate limited: a monitor polling every thirty seconds is the intended
 * traffic, and locking out the thing that tells you the site is down is a poor
 * trade. It stays cheap — one `select 1` and some string checks.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getConsoleUser } from "@/lib/admin";
import { checkConfig, degradedAreas, isConfigHealthy } from "@/lib/health";

export const dynamic = "force-dynamic";

/** The database is the one dependency worth actually touching. */
async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    // The error text can carry the connection string. Never return it.
    return { ok: false, latencyMs: Date.now() - started };
  }
}

export async function GET() {
  const [database, config] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkConfig()),
  ]);

  const healthy = database.ok && isConfigHealthy(config);
  const status = healthy ? "ok" : "degraded";

  // Detail only for the console. getConsoleUser() does not throw for anonymous
  // callers, which is what lets this route answer them at all.
  const viewer = await getConsoleUser().catch(() => null);

  const body = viewer
    ? {
        status,
        time: new Date().toISOString(),
        checks: {
          database: { ok: database.ok, latencyMs: database.latencyMs },
          config,
        },
        degraded: degradedAreas(config),
      }
    : { status, time: new Date().toISOString() };

  return NextResponse.json(body, {
    // 503 so an uptime monitor and a load balancer both read it correctly.
    status: healthy ? 200 : 503,
    headers: {
      // A cached health check is a lie about the present.
      "cache-control": "no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
