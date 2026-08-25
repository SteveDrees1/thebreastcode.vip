/**
 * The abuse controls: promo-code guessing, download scraping, magic-link
 * flooding. All three reduce to `hit()`.
 *
 * Time is faked rather than slept through, so the window-expiry behaviour is
 * actually asserted instead of assumed. Keys are unique per test because the
 * module holds one process-wide Map — sharing a key across tests would let one
 * leak into the next.
 */
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientKey, hit, tooManyRequests } from "@/lib/rate-limit";

let n = 0;
/** A key no other test has used. */
const freshKey = () => `test-key-${process.pid}-${n++}`;

describe("hit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and counts down", () => {
    const key = freshKey();
    expect(hit(key, 3, 60)).toMatchObject({ ok: true, remaining: 2, retryAfter: 0 });
  });

  it("allows exactly `limit` requests, then refuses", () => {
    const key = freshKey();
    expect(hit(key, 3, 60).ok).toBe(true);
    expect(hit(key, 3, 60).ok).toBe(true);
    // The third is the limit and must still pass — an off-by-one here would
    // refuse a legitimate customer.
    expect(hit(key, 3, 60)).toMatchObject({ ok: true, remaining: 0 });
    expect(hit(key, 3, 60).ok).toBe(false);
  });

  it("keeps refusing past the limit without going negative", () => {
    const key = freshKey();
    for (let i = 0; i < 10; i += 1) hit(key, 2, 60);
    const result = hit(key, 2, 60);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("reports a retryAfter of at least one second while blocked", () => {
    const key = freshKey();
    hit(key, 1, 60);
    const blocked = hit(key, 1, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("never reports retryAfter 0 while blocked, even at the last millisecond", () => {
    // A 0 would tell a client to retry immediately and spin.
    const key = freshKey();
    hit(key, 1, 60);
    vi.advanceTimersByTime(59_999);
    expect(hit(key, 1, 60)).toMatchObject({ ok: false, retryAfter: 1 });
  });

  it("opens a fresh window once the old one expires", () => {
    const key = freshKey();
    hit(key, 1, 60);
    expect(hit(key, 1, 60).ok).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(hit(key, 1, 60)).toMatchObject({ ok: true, remaining: 0, retryAfter: 0 });
  });

  it("counts each key separately, so one user cannot block another", () => {
    const a = freshKey();
    const b = freshKey();
    hit(a, 1, 60);
    expect(hit(a, 1, 60).ok).toBe(false);
    expect(hit(b, 1, 60).ok).toBe(true);
  });
});

describe("clientKey", () => {
  const withHeaders = (headers: Record<string, string>) =>
    new Request("https://example.test/", { headers });

  it("uses the first x-forwarded-for entry, which is the client", () => {
    // The rest of the list is proxies; trusting the last would key every
    // request behind one CDN edge to the same bucket.
    expect(clientKey(withHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "promo")).toBe(
      "promo:1.2.3.4",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(clientKey(withHeaders({ "x-forwarded-for": "  1.2.3.4  " }), "promo")).toBe(
      "promo:1.2.3.4",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(withHeaders({ "x-real-ip": "9.9.9.9" }), "promo")).toBe("promo:9.9.9.9");
  });

  it("degrades to a shared bucket when no address is present", () => {
    // Everyone unidentified shares one bucket. That is deliberate: it is
    // stricter than handing out an unlimited allowance per anonymous caller.
    expect(clientKey(withHeaders({}), "promo")).toBe("promo:unknown");
  });

  it("does not collide across prefixes", () => {
    const req = withHeaders({ "x-forwarded-for": "1.2.3.4" });
    expect(clientKey(req, "promo")).not.toBe(clientKey(req, "signin"));
  });
});

describe("tooManyRequests", () => {
  it("returns 429 with the headers a well-behaved client honours", async () => {
    const res = tooManyRequests({ ok: false, remaining: 0, retryAfter: 42 }, "Slow down.");

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "Slow down." });
  });
});

describe("every API route has decided about rate limiting", () => {
  /*
   * A source-level check, and deliberately so.
   *
   * `/api/portal` shipped with no ceiling while all four of its siblings had
   * one. Nothing was wrong with any single file — the gap only existed
   * relative to the pattern, which is exactly the kind of thing review misses
   * and a reader never thinks to look for. Each call there reached a paid
   * Stripe API, so a signed-in tab in a loop spent the account's quota for
   * free.
   *
   * The exemptions are listed by name with the reason. That is the point: a
   * new route under src/app/api fails this test until someone writes down
   * which side it is on, rather than defaulting silently to unlimited.
   */
  const EXEMPT: Record<string, string> = {
    "stripe/webhook":
      "Stripe signs it and retries on failure; a limit here would drop real events",
    health: "monitors poll it, and it does no work an attacker benefits from",
    "auth/[...nextauth]":
      "throttled in the signIn callback in auth.ts instead — see signin-throttle.ts",
  };

  const routes = globSync("src/app/api/**/route.ts", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  })
    .map((file) => file.replaceAll("\\", "/").replace(/^src\/app\/api\//, "").replace(/\/route\.ts$/, ""))
    .sort();

  it("found the routes at all", () => {
    // Without this, a broken glob makes every assertion below vacuous.
    expect(routes.length).toBeGreaterThanOrEqual(5);
    expect(routes).toContain("portal");
  });

  it("exempts nothing that no longer exists", () => {
    for (const name of Object.keys(EXEMPT)) {
      expect(routes, `${name} is exempted but has no route file`).toContain(name);
    }
  });

  for (const route of routes) {
    const reason = EXEMPT[route];
    it(reason ? `${route} is exempt: ${reason}` : `${route} calls the rate limiter`, () => {
      const source = readFileSync(
        fileURLToPath(new URL(`../src/app/api/${route}/route.ts`, import.meta.url)),
        "utf8",
      );
      if (reason) return;
      expect(source, `no hit( call in src/app/api/${route}/route.ts`).toMatch(/\bhit\(/);
    });
  }
});
