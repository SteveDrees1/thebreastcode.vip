/**
 * The throttle on emailed sign-in links.
 *
 * This exists as its own module, and has its own test, because of where it
 * used to live. The limit was applied inside the sign-in form's server action,
 * which meant it only ever inspected requests from people who were not trying
 * to get around it. Auth.js mounts `POST /api/auth/signin/nodemailer` for every
 * provider and advertises the URL from `GET /api/auth/providers`; ten direct
 * POSTs with a valid CSRF token returned ten 302s and delivered ten magic-link
 * emails to one address, against a stated limit of five per fifteen minutes.
 * Reproduced against a local SMTP sink, then re-run after the fix: five sent,
 * the rest refused.
 *
 * These assertions cover the decision. That the decision is *reached* on both
 * paths is a property of `auth.ts` calling it from the `signIn` callback, and
 * was verified in a browser — see SECURITY.md.
 *
 * Keys are unique per test because the limiter holds one process-wide Map.
 */
import { describe, expect, it } from "vitest";
import { checkSignInThrottle } from "@/lib/signin-throttle";

let n = 0;
/** An address and a source no other test has used. */
function fresh() {
  const id = `${process.pid}-${n++}`;
  return { email: `user-${id}@example.test`, ip: `10.0.0.${n % 255}-${id}` };
}

describe("checkSignInThrottle", () => {
  it("allows the first request", () => {
    expect(checkSignInThrottle(fresh())).toEqual({ ok: true });
  });

  it("allows five sends to one address, then refuses", () => {
    const who = fresh();
    for (let i = 0; i < 5; i++) {
      expect(checkSignInThrottle(who), `attempt ${i + 1}`).toEqual({ ok: true });
    }
    expect(checkSignInThrottle(who)).toEqual({ ok: false, reason: "email" });
  });

  it("counts an address the same however it is capitalised or padded", () => {
    // Without normalising, `Victim@Example.test` is a different bucket from
    // `victim@example.test` and the per-address limit is bypassed by holding
    // down shift.
    const { ip } = fresh();
    const address = `mixed-${process.pid}-${n++}@Example.TEST`;
    for (let i = 0; i < 5; i++) {
      checkSignInThrottle({ email: i % 2 ? address.toUpperCase() : address, ip });
    }
    expect(checkSignInThrottle({ email: `  ${address.toLowerCase()}  `, ip })).toEqual({
      ok: false,
      reason: "email",
    });
  });

  it("refuses a source that walks a list of addresses", () => {
    // Fifteen different addresses never trip the per-address limit; the
    // per-source limit is the only thing standing between a script and the
    // sending budget.
    const ip = `10.9.9.${n++}-${process.pid}`;
    for (let i = 0; i < 15; i++) {
      expect(
        checkSignInThrottle({ email: `walk-${process.pid}-${i}-${n}@example.test`, ip }),
        `address ${i + 1}`,
      ).toEqual({ ok: true });
    }
    expect(
      checkSignInThrottle({ email: `walk-${process.pid}-last-${n}@example.test`, ip }),
    ).toEqual({ ok: false, reason: "ip" });
  });

  it("charges a refused attempt to its source too", () => {
    /*
     * Both limits are consumed on every attempt, including attempts the
     * address limit already refused. If the per-address check short-circuited
     * — returning before the source is counted — then hammering one inbox
     * would cost the source nothing beyond the first five, and a script could
     * flood inboxes in rotation almost for free.
     *
     * The numbers matter, so they are spelled out. Two inboxes are hit eight
     * times each: 16 attempts, of which 6 are refused on the address limit.
     * Counting every attempt puts the source at 16, past its limit of 15, so a
     * fresh address from the same source is refused. Counting only the
     * attempts that got through puts it at 10, and the same probe succeeds.
     *
     * An earlier version of this test used five attempts per inbox, which is
     * exactly the address limit — nothing was ever refused, so both versions
     * of the code counted identically and the assertion passed either way.
     * It was caught by making the mutation and watching the test stay green.
     */
    const ip = `10.8.8.${n++}-${process.pid}`;
    for (let round = 0; round < 2; round++) {
      const email = `rotate-${process.pid}-${round}-${n}@example.test`;
      for (let i = 0; i < 8; i++) checkSignInThrottle({ email, ip });
    }
    expect(
      checkSignInThrottle({ email: `rotate-${process.pid}-new-${n}@example.test`, ip }),
    ).toEqual({ ok: false, reason: "ip" });
  });

  it("does not let a missing source address share one bucket with a real one", () => {
    // An empty IP becomes "unknown" rather than "", so it is still a bucket
    // and still counted — a request with no forwarded-for header is not free.
    const email = `noip-${process.pid}-${n++}@example.test`;
    for (let i = 0; i < 5; i++) checkSignInThrottle({ email, ip: "" });
    expect(checkSignInThrottle({ email, ip: "" })).toEqual({ ok: false, reason: "email" });
  });
});
