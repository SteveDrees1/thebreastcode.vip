/**
 * Fixed-window rate limiting, held in process memory.
 *
 * Scope, stated plainly: this counts per server instance. On a single VPS that
 * is exact; on serverless it is per warm lambda, so the real ceiling is roughly
 * `limit × instances`. That is still enough to stop the things this defends
 * against — promo-code guessing, download scraping, and magic-link email
 * flooding — all of which need volume through one path to pay off.
 *
 * If you scale out and want an exact global limit, swap `hit()` for Upstash
 * Redis or Vercel KV; every caller goes through this one function, so nothing
 * else has to change.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired entries so the map cannot grow without bound. */
function sweep(now: number) {
  if (windows.size < 5_000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter,
  };
}

/** Best-effort client address, for limiting requests that have no user yet. */
export function clientKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return `${prefix}:${forwarded || realIp || "unknown"}`;
}

/** 429 with the headers a well-behaved client will honour. */
export function tooManyRequests(result: RateLimitResult, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(result.retryAfter),
      "x-ratelimit-remaining": String(result.remaining),
    },
  });
}
