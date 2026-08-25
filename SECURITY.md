# Security

## Reporting a vulnerability

Report privately — do not open a public issue. Use GitHub's **Report a
vulnerability** button under the repository's Security tab, which opens a
private advisory visible only to the maintainers.

Include what you did, what happened, and what you expected. A request/response
pair or a short script is worth more than a scanner label. Expect an
acknowledgement within a few days.

Please do not run automated scanners against the production site, and do not
access, modify or exfiltrate data that is not yours — a proof of concept
against your own account is enough to demonstrate almost anything here.

## What protects what

A short map, so a reviewer knows which file to read:

| Concern | Where it is enforced |
| --- | --- |
| May this user read this PDF? | `src/lib/entitlements.ts` — the only answer to that question |
| Private columns never reaching a client | `src/lib/catalog.ts`, guarded at compile time by `satisfies` |
| Console access (admin vs read-only auditor) | `src/lib/admin.ts` — three distinct gates |
| Server-action authorisation | each action calls `getAdmin()` itself; layouts protect nothing. `tests/server-actions.test.ts` reads both action modules and fails any exported action that does not gate itself |
| CSP nonce, and `/admin` 404 for anonymous callers | `src/middleware.ts` |
| Transport and framing headers | `next.config.ts` |
| Webhook authenticity | Stripe signature verified against the raw body before any parsing |
| Download authorisation | auth → rate limit → entitlement → short-lived presigned URL |
| Emailed sign-in links | `src/lib/signin-throttle.ts`, called from the `signIn` callback in `auth.ts` — the one point both the form and `POST /api/auth/signin/nodemailer` pass through |
| Every API route having *decided* about a limit | `tests/rate-limit.test.ts` reads `src/app/api/**/route.ts` and fails any route that neither calls `hit()` nor appears in a named exemption list |
| JSON-LD injection | `safeJsonLd()` in `src/lib/seo.ts` |
| Health detail disclosure | `/api/health` returns a bare verdict to anonymous callers; the per-area report needs a console session |

Two properties are covered by executable checks rather than review alone:

```bash
npm run verify:entitlements   # 16 cases; scratch database only
npm run verify:exposure       # 5 cases, including a control that must fail
```

Both write to and delete from the database. Never point them at production.

`npm test` needs no database, network or real credentials. It covers the
security-relevant logic directly, including the webhook route's signature gate
(an unsigned POST, a forged signature and a tampered body all 400 before the
handler runs, verified by calling the real route): presigned download URLs (TTL, that the
secret key never appears in the URL, and that a filename cannot inject a
Content-Disposition header), `safeJsonLd` escaping, the rate limiter, and a
runtime assertion that no private column sits in the public projections. Each
of those assertions was confirmed to fail when the corresponding protection is
removed from the source, rather than assumed to be watching.

`npm run verify:seo` is separate: it only reads, so it is safe against any
database including a copy of production.

`npm run verify:a11y -- --with-session` inserts a scratch admin user and a
session row so it can audit the console, and deletes both in a `finally`. It
creates a real administrator, briefly, in whatever database it is pointed at —
treat it exactly like `verify:entitlements` and give it a disposable one. The
default run, without the flag, sets no cookie and writes nothing.

`npm run verify:smoke` runs against a server that is actually serving, and
asserts the runtime properties nothing else can: that `/admin` answers 404 to
an anonymous caller, that the CSP nonce is present *and differs between
requests*, that `/_next/image` still rejects a wildcard bucket at 400, that no
private column name appears in the catalog HTML, and that `/api/health`
discloses only a verdict to a stranger. CI runs it against the built app —
without it, a route that 500s or middleware that stopped protecting the console
would ship green.

## Verified against a running server

Not reasoning about the code — a real Postgres, a real build, and a local SMTP
sink so the magic-link email is actually delivered and the link followed.

**Sign-up and sign-in**

| | |
| --- | --- |
| New address → account created | verified email set, referral code generated, `is_admin` false |
| Magic link replayed | rejected, `error=Verification`, no session issued, token already consumed from `verification_tokens` |
| Existing address signs in again | no duplicate account; a second session, so other devices keep working |
| Sign-out | deletes only that session row; the other device stays signed in |
| Replaying a signed-out cookie | treated as anonymous, and `/account` returns no email |
| Session cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`. No `Secure` over plain HTTP; Auth.js adds it and the `__Secure-` prefix on HTTPS, which is what `middleware.ts` looks for |
| Sixth link request for one address | refused; the form lands on `/signin?error=throttled`, a direct POST on `/signin?error=AccessDenied`, and both render the same sentence |
| Following a link after being throttled | still works — the throttle applies to sending, not to verifying |

### The sign-in throttle was bypassable, and this is how it was found

Worth recording in full, because the shape recurs: a control placed on the path
an honest user takes, guarding a route that is also reachable directly.

The limit on emailed sign-in links lived in the sign-in form's server action.
Auth.js, though, mounts `POST /api/auth/signin/<provider>` for every configured
provider and *advertises the URL* from `GET /api/auth/providers`. Against a
local SMTP sink, ten direct POSTs carrying a valid CSRF token returned ten
302s and delivered **ten** magic-link emails to one address, against a stated
limit of five per fifteen minutes. The per-IP limit went with it.

Three consequences, none of which need an account:

- any inbox can be flooded, using the shop's own name;
- the transactional email budget is spendable by a stranger;
- a list of addresses can be walked, each receiving a genuine "sign in to Datum
  Press" message — which burns the sending domain's reputation.

The fix is `src/lib/signin-throttle.ts`, called from the `signIn` callback in
`auth.ts`. That callback runs before `sendVerificationRequest` on every path,
so there is no longer a way in that skips it. The form's own copy of the check
was removed rather than kept — two checks would consume two slots per
submission and quietly halve the limit for honest visitors.

Re-running the identical attack after the fix: five emails, then five
redirects to `/signin?error=AccessDenied`. Through the form: five, then the
throttled message.

One thing the fix broke and had to be fixed again: a refused sign-in reaches a
*server action* as a thrown `AuthError`, not as a redirect — only the HTTP
endpoint gets sent to `pages.error`. The first version therefore showed the
customer "Something broke" from the error boundary. Caught by clicking the
button six times in a browser rather than by reading the code. The action now
catches `AuthError` and redirects; everything else is rethrown, because
`signIn` signals *success* by throwing too.

**API surface**

| Request | Result |
| --- | --- |
| `POST /api/checkout`, `POST /api/portal` unauthenticated | 401 |
| `GET /api/download/<id>` unauthenticated | 307 to sign-in |
| `POST /api/stripe/webhook` unsigned | 400 |
| Authenticated user, product they do not own | 403 |
| …then granted an entitlement | 302 with a signed URL |
| Nonexistent product id | 404 |
| Cross-origin `GET` | no `Access-Control-Allow-Origin`, so no cross-origin reader |
| `OPTIONS` preflight | 204 with `Allow` only — the browser still blocks |
| Cross-site form-encoded `POST` | 400: the route parses JSON, so the CSRF-able content types never reach it. `SameSite=Lax` would already withhold the cookie |
| 34 downloads in a row | 27 allowed then 7 × 429 — exactly right, 3 of the 30 having been spent earlier |
| 14 billing-portal requests in a row | 12 allowed then 2 × 429 with `retry-after: 60`. The limit is checked before the customer lookup, so it holds even for an account Stripe has never seen |

A caution for whoever repeats this: the session cookie is scoped to the host in
the magic link. Testing against `127.0.0.1` while the cookie was issued for
`localhost` sends no cookie at all, and every request looks anonymous — which
reads exactly like a broken sign-out.

## Automation

- **CI** (`.github/workflows/ci.yml`) — typecheck, lint, `npm test`, the verify
  suites against a disposable Postgres service container, build, a runtime
  smoke test and an accessibility audit against the started server, and
  `npm audit`.
- **CodeQL** (`.github/workflows/codeql.yml`) — `security-extended` on every
  push and PR to `main`, plus weekly so new queries reach existing code.
- **Dependabot** (`.github/dependabot.yml`) — weekly, for npm and for GitHub
  Actions. Majors are excluded for the packages the app's behaviour rests on
  (next, stripe, zod, next-auth, react, typescript, eslint, nodemailer), and
  minors too for the pre-1.0 ones (drizzle-orm, drizzle-kit, sharp) where a
  minor *is* the breaking release. Those need a deliberate branch with the full
  suite run against them. Security updates ignore that list.

## Known exceptions

An exception is a risk we have accepted for a stated reason, with a
compensating control and something specific that retires it. It is not a
permanent excuse.

### nodemailer's `raw` option — arbitrary file read and SSRF

- **Advisory:** message-level `raw` bypasses `disableFileAccess` /
  `disableUrlAccess`. Affects `nodemailer <= 9.0.0`. Reported as 4 high, but
  that is one advisory counted four times: `nodemailer` itself plus
  `@auth/core`, `next-auth` and `@auth/drizzle-adapter`, which only appear
  because they depend on it.
- **Why not simply upgraded:** `next-auth@5.0.0-beta.32` and `@auth/core@0.41.3`
  both declare `nodemailer: "^7.0.7 || ^8.0.5"`. Installing 9.0.5 was tried and
  npm marks it `invalid` against that range — an unsupported combination on the
  only path anyone signs in by. The alternative npm suggests is `next-auth`
  4.24.7, which is a downgrade off the v5 API this app is written against.
- **Compensating control:** the vector is the `raw` message option, and nothing
  here constructs a raw message — Auth.js sends a templated magic link, and
  `grep -rn "raw:" src/` is empty. An attacker would need to control the
  message options passed to the transport, which no route exposes.
- **Retires when:** Auth.js widens its nodemailer range to include ^9, or
  reaches a stable v5. At that point upgrade and raise the CI gate in `ci.yml`
  from `--audit-level=critical` to `high`.

### Retired: Next.js 15's bundled sharp and postcss

Kept as a record of an exception that closed rather than lingered. Next 15.5.23
bundled `sharp` 0.34.5 (4 libvips CVEs) and a vulnerable `postcss`, with no
patch below Next 16.3.1. The Next 16 upgrade landed and removed all of them.
The compensating control at the time — `images.remotePatterns: []` — stays in
place on its own merits, because it also closes the open image proxy described
below.

### Retired: drizzle-orm SQL injection

`drizzle-orm < 0.45.2` carried a SQL injection via improperly escaped SQL
identifiers. Fixed by upgrading to 0.45.2.

Worth recording *how* it was nearly missed. Dependabot opened the upgrade as
PR #12, and it was closed as a routine seven-minor version bump on a pre-1.0
package without checking whether it carried an advisory. It only resurfaced
because the Next 16 upgrade cleared the sharp noise that had been burying it in
`npm audit` output. Read what a dependency PR actually fixes before closing it;
"pre-1.0 minors need a deliberate branch" is a reason to schedule the work, not
a reason to assume it is cosmetic.

### The image optimizer was an open proxy until it was closed

Recorded because the shape recurs. `remotePatterns` was `**.r2.dev` and
`**.amazonaws.com` — every bucket on those providers, not ours. `/_next/image`
is enabled whether or not the app imports `next/image`, and this app never
imported it: covers render as plain `<img>`. So the patterns bought nothing and
left a live proxy that also fed the vulnerable sharp.

If you adopt `next/image`, add the one exact bucket hostname. Never a wildcard
spanning a provider's domain.

## Settings that live in GitHub, not in this repository

These cannot be committed and have to be set by someone with admin rights:

- **Secret scanning + push protection** — blocks a credential at push time
  rather than after it is in history.
- **Branch protection on `main`** — require CI to pass, require a review,
  disallow force pushes.
- **Dependabot alerts and security updates** — the config file schedules
  version updates; alerts are a separate repository setting.
- **Private vulnerability reporting** — required for the reporting flow above.

## Operational notes

- Rate limiting (`src/lib/rate-limit.ts`) counts per server instance. On
  serverless the real ceiling is roughly `limit × warm instances`. Adequate
  against promo-code guessing, download scraping and magic-link flooding; swap
  `hit()` for Redis if you need an exact global limit.
- IP addresses in the audit and download logs are stored as SHA-256 salted with
  `AUTH_SECRET`, never raw. Rotating `AUTH_SECRET` makes historical hashes
  uncorrelatable with new ones, which is a deliberate trade, not a bug.
- The bucket holding sellable PDFs must be private. Downloads are only ever
  served as short-lived presigned URLs minted after an entitlement check.
- `GET /api/health` is unauthenticated by design so monitors can reach it, but
  it answers strangers with `{status, time}` only. The subsystem breakdown is
  gated on `getConsoleUser()`, and no variable *value* reaches the response in
  either tier — `tests/health.test.ts` asserts the serialised report contains
  none of them. Database errors are swallowed rather than returned, because the
  message can carry the connection string.
- `.env.local`, `.env` and `.env*.local` are gitignored. `.env.example` holds
  placeholders only and is the file to update when a variable is added.
