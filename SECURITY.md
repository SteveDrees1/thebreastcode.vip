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
| Server-action authorisation | each action calls `getAdmin()` itself; layouts protect nothing |
| CSP nonce, and `/admin` 404 for anonymous callers | `src/middleware.ts` |
| Transport and framing headers | `next.config.ts` |
| Webhook authenticity | Stripe signature verified against the raw body before any parsing |
| Download authorisation | auth → rate limit → entitlement → short-lived presigned URL |
| JSON-LD injection | `safeJsonLd()` in `src/lib/seo.ts` |
| Health detail disclosure | `/api/health` returns a bare verdict to anonymous callers; the per-area report needs a console session |

Two properties are covered by executable checks rather than review alone:

```bash
npm run verify:entitlements   # 16 cases; scratch database only
npm run verify:exposure       # 5 cases, including a control that must fail
```

Both write to and delete from the database. Never point them at production.

`npm test` needs no database, network or real credentials. It covers the
security-relevant pure logic directly: presigned download URLs (TTL, that the
secret key never appears in the URL, and that a filename cannot inject a
Content-Disposition header), `safeJsonLd` escaping, the rate limiter, and a
runtime assertion that no private column sits in the public projections. Each
of those assertions was confirmed to fail when the corresponding protection is
removed from the source, rather than assumed to be watching.

`npm run verify:seo` is separate: it only reads, so it is safe against any
database including a copy of production.

## Automation

- **CI** (`.github/workflows/ci.yml`) — typecheck, lint, `npm test`, the verify
  suites against a disposable Postgres service container, build, and
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
