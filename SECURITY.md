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

Two properties are covered by executable checks rather than review alone:

```bash
npm run verify:entitlements   # 16 cases; scratch database only
npm run verify:exposure       # 5 cases, including a control that must fail
```

`npm run verify:seo` is read-only and safe against any database, including a
copy of production.

Both write to and delete from the database. Never point them at production.

## Automation

- **CI** (`.github/workflows/ci.yml`) — typecheck, lint, the verify suites
  against a disposable Postgres service container, build, and `npm audit`.
- **CodeQL** (`.github/workflows/codeql.yml`) — `security-extended` on every
  push and PR to `main`, plus weekly so new queries reach existing code.
- **Dependabot** (`.github/dependabot.yml`) — weekly, for npm and for GitHub
  Actions. Major Next upgrades are excluded because they need a deliberate
  branch with the full suite run against them.

## Known exceptions

An exception is a risk we have accepted for a stated reason, with a
compensating control and something specific that retires it. It is not a
permanent excuse.

### Next.js 15.5.23 bundles sharp 0.34.5 and a vulnerable postcss

- **Advisories:** GHSA-f88m-g3jw-g9cj (4 libvips CVEs in sharp < 0.35.0), plus
  three postcss `sourceMappingURL` advisories. 8 high, 0 critical.
- **Why not simply upgraded:** 15.5.23 is the newest 15.x — it carries the
  `backport` dist-tag — so there is no patch below Next 16.3.1. A major App
  Router upgrade is its own branch, not a line in a security pass.
- **Compensating control:** `next.config.ts` sets `images.remotePatterns: []`,
  so `/_next/image` rejects every remote URL at 400 before any fetch. Nothing
  attacker-controlled reaches sharp. The postcss advisories are build-time and
  need attacker-controlled CSS, which would already mean repository write
  access. Verified against a production build, not assumed.
- **Retires when:** the Next 16 upgrade lands. At that point raise the CI gate
  in `ci.yml` from `--audit-level=critical` back to `high`.

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
- `.env.local`, `.env` and `.env*.local` are gitignored. `.env.example` holds
  placeholders only and is the file to update when a variable is added.
