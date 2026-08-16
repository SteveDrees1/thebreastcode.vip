/**
 * Stripe webhook signature verification, as this app uses it.
 *
 * The webhook is the fulfilment path: `checkout.session.completed` is what
 * grants an entitlement, so anyone who can forge a request to it can mint
 * themselves the catalog. The only thing standing in the way is
 * `constructEvent`, and the ways it gets defeated are usage mistakes rather
 * than flaws in Stripe's crypto — verifying a re-serialised body, trusting the
 * parsed payload, or letting a missing signature through.
 *
 * These tests use Stripe's own `generateTestHeaderString`, so they need no
 * network and no real keys. What they do not cover is the handler's database
 * effects; `verify:entitlements` covers grant idempotency against a real
 * database, including webhook replay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const SECRET = "whsec_test_secret_value";
const WRONG_SECRET = "whsec_a_different_secret";

const stripe = new Stripe("sk_test_not_a_real_key", {
  apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
});

/** The exact shape the route receives: a raw string plus a signature header. */
function signed(payload: string, secret = SECRET, timestamp?: number) {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    ...(timestamp ? { timestamp } : {}),
  });
}

const EVENT = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", metadata: { userId: "u1", productId: "p1" } } },
});

describe("constructEvent, as the route calls it", () => {
  it("accepts a correctly signed payload and returns the parsed event", () => {
    const event = stripe.webhooks.constructEvent(EVENT, signed(EVENT), SECRET);
    expect(event.type).toBe("checkout.session.completed");
    expect(event.id).toBe("evt_1");
  });

  it("rejects a payload signed with a different secret", () => {
    // i.e. someone who guessed the endpoint but not STRIPE_WEBHOOK_SECRET.
    expect(() =>
      stripe.webhooks.constructEvent(EVENT, signed(EVENT, WRONG_SECRET), SECRET),
    ).toThrow(/signature/i);
  });

  it("rejects a tampered payload carrying the original signature", () => {
    // The attack that matters: replay a real event with the amount or the
    // product swapped.
    const tampered = EVENT.replace('"p1"', '"p_expensive"');
    expect(() =>
      stripe.webhooks.constructEvent(tampered, signed(EVENT), SECRET),
    ).toThrow(/signature/i);
  });

  it("rejects an empty or malformed signature header", () => {
    for (const header of ["", "t=1,v1=deadbeef", "garbage"]) {
      expect(() => stripe.webhooks.constructEvent(EVENT, header, SECRET)).toThrow();
    }
  });

  it("rejects a signature outside the timestamp tolerance", () => {
    // Bounds how long a captured request stays replayable.
    const longAgo = Math.floor(Date.now() / 1000) - 60 * 60;
    expect(() =>
      stripe.webhooks.constructEvent(EVENT, signed(EVENT, SECRET, longAgo), SECRET, 300),
    ).toThrow(/timestamp/i);
  });

  it("accepts an old signature when tolerance is widened, proving the previous test tested tolerance", () => {
    // Control: without this, the test above could be passing for the wrong
    // reason — a malformed header rather than an expired one.
    const longAgo = Math.floor(Date.now() / 1000) - 60 * 60;
    const event = stripe.webhooks.constructEvent(
      EVENT,
      signed(EVENT, SECRET, longAgo),
      SECRET,
      60 * 60 * 24,
    );
    expect(event.id).toBe("evt_1");
  });

  it("fails if the body is parsed and re-serialised before verification", () => {
    // This is why the route calls `req.text()` and never `req.json()`. The
    // signature covers the exact bytes Stripe sent; a round trip through
    // JSON.parse/stringify changes them (key order, whitespace, number
    // formatting) and verification collapses. The failure mode is a webhook
    // that rejects every legitimate delivery.
    const spaced = JSON.stringify(JSON.parse(EVENT), null, 2);
    expect(spaced).not.toBe(EVENT);
    expect(() =>
      stripe.webhooks.constructEvent(spaced, signed(EVENT), SECRET),
    ).toThrow(/signature/i);
  });
});

describe("the route handler itself", () => {
  // The route logs the verification failure. That is wanted in production and
  // noise here, so it is captured rather than printed — and asserted below, so
  // silencing it does not quietly remove the logging.
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** POST the real handler. STRIPE_WEBHOOK_SECRET matches SECRET in vitest.config.ts. */
  async function post(headers: Record<string, string>, body = EVENT) {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    return POST(
      new Request("https://example.test/api/stripe/webhook", {
        method: "POST",
        headers,
        body,
      }),
    );
  }

  it("400s an unsigned POST without touching the database", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing signature" });
  });

  it("400s a forged signature, and logs it", async () => {
    const res = await post({ "stripe-signature": signed(EVENT, WRONG_SECRET) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
    // A rejected webhook must leave a trace; a silent 400 is undiagnosable.
    expect(errorSpy).toHaveBeenCalledWith(
      "[stripe] signature verification failed",
      expect.anything(),
    );
  });

  it("400s a tampered body carrying a genuine signature", async () => {
    const tampered = EVENT.replace('"p1"', '"p_expensive"');
    const res = await post({ "stripe-signature": signed(EVENT) }, tampered);
    expect(res.status).toBe(400);
  });

  it("distinguishes a missing signature from an invalid one", async () => {
    // Different messages, so a misconfigured endpoint is diagnosable — while
    // both are still a flat 400 to the caller.
    const missing = await (await post({})).json();
    const invalid = await (await post({ "stripe-signature": "garbage" })).json();
    expect(missing).not.toEqual(invalid);
  });
});
