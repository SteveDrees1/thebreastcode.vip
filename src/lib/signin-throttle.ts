import { hit } from "./rate-limit";

/**
 * The throttle on emailed sign-in links.
 *
 * This lives here, not in the sign-in form, because the form is not the only
 * way to reach it. Auth.js mounts `POST /api/auth/signin/nodemailer` for every
 * configured provider and advertises the URL from `GET /api/auth/providers`,
 * so anything the page checks before calling `signIn()` is checked only on the
 * path an honest visitor takes.
 *
 * It was reproduced rather than suspected: against a local SMTP sink, ten
 * direct POSTs to that endpoint with a valid CSRF token returned ten 302s and
 * delivered ten magic-link emails to one address, while the form's own limit
 * was five per fifteen minutes. Three things follow from that — an inbox can
 * be flooded, the transactional email budget can be spent by a stranger, and
 * the sender domain's reputation can be burned by walking a list of addresses,
 * each of whom receives a genuine "sign in to Datum Press" email.
 *
 * Called from the `signIn` callback in `auth.ts`, which every path passes
 * through before a message is sent.
 */

/** Per address: protects the person whose inbox it is. */
const PER_EMAIL = { limit: 5, windowSeconds: 900 };

/** Per source: protects the sending budget from a script walking a list. */
const PER_IP = { limit: 15, windowSeconds: 900 };

export interface SignInThrottleResult {
  ok: boolean;
  /** Which limit refused, for the log. Never shown to the caller. */
  reason?: "email" | "ip";
}

export function checkSignInThrottle(input: {
  email: string;
  ip: string;
}): SignInThrottleResult {
  // Normalised so `A@B.com` and `a@b.com` share a bucket; without this the
  // per-address limit is bypassed by changing case.
  const email = input.email.trim().toLowerCase();
  const ip = input.ip.trim() || "unknown";

  // Both are consumed on every attempt, deliberately. Short-circuiting would
  // let a flood against one address go uncounted against its source.
  const perEmail = hit(`signin:email:${email}`, PER_EMAIL.limit, PER_EMAIL.windowSeconds);
  const perIp = hit(`signin:ip:${ip}`, PER_IP.limit, PER_IP.windowSeconds);

  if (!perEmail.ok) return { ok: false, reason: "email" };
  if (!perIp.ok) return { ok: false, reason: "ip" };
  return { ok: true };
}
