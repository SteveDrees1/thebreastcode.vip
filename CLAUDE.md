# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

> An earlier version of this file said the repository was empty. It was written
> against the initial commit and merged after the application already existed.
> Everything below is written against the current tree and was verified by
> running the commands, not copied from framework docs.

## Project overview

- **Name:** Datum Press (`thebreastcode.vip` is the domain the repo is named for;
  the brand name is deliberately different — see `BRAND.md`).
- **Purpose:** a storefront for selling PDF guides. One catalog covering
  one-off purchases, bundles, subscriptions, promo codes and referral credits.
- **Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM over
  Postgres, Stripe (Checkout + Stripe Tax + subscriptions), Auth.js v5 with
  emailed magic links, Tailwind v4.
- **Deployment target:** Vercel with Neon Postgres.

## Codebase structure

```
src/
├── app/          # App Router: routes, server actions, /admin console
├── components/   # shared UI
├── db/           # schema.ts, index.ts (connection), seed.ts
├── lib/          # the business logic — start here
├── auth.ts       # Auth.js config; the session callback shapes what clients see
└── middleware.ts # per-request CSP nonce, and the /admin 404 for anonymous callers
scripts/          # CLI tools: import a product, generate covers, run verifications
drizzle/          # generated SQL migrations — never hand-edit an applied one
```

The pieces worth understanding before changing anything:

- **`src/lib/entitlements.ts`** is the only module that answers "may this user
  read this PDF?". Access comes either from a live `entitlements` row or from an
  active subscription resolved *live* against `products.includedInSubscription`.
  That resolution is deliberately not materialised, so newly published PDFs are
  covered immediately and a lapsed subscription revokes immediately. Route new
  sales paths through `grantEntitlement()` rather than adding a second notion of
  access.
- **`src/lib/catalog.ts`** defines `publicProductColumns`, the projection that
  keeps private columns (`fileKey`, `sourceSha256`, `stripePriceId`) out of
  anything client-bound. It ends in `satisfies Record<keyof PublicProduct,
  unknown>` — that keyword is load-bearing. Plain assignability catches nothing
  here; `satisfies` is what makes adding a private column back a compile error.
- **`src/lib/admin.ts`** has three gates and they are not interchangeable:
  `requireConsole()` (admin or auditor, for pages), `requireAdmin()` (admin
  only, for pages), `getAdmin()` (admin only, for server actions). Every server
  action is its own POST endpoint and does not inherit a layout's protection, so
  each mutation must authorise on its own.

## Development workflow

```bash
npm install
cp .env.example .env.local        # both the app and the CLI scripts read this
npm run db:generate && npm run db:migrate
npm run db:seed                   # optional demo catalog
npm run dev
```

Checks, all of which should pass before pushing:

```bash
npm run typecheck
npm run lint
npm test                          # unit tests; no database, no network
npm run verify:entitlements       # scratch database only — writes and deletes
npm run verify:exposure           # scratch database only
npm run verify:seo                # read-only; safe against any database
npm run build
npm run verify:smoke              # needs a running server; read-only
npm run verify:a11y               # same server; needs Chromium; read-only
npm run verify:a11y -- --with-session   # adds /library, /account and /admin; WRITES
npm run verify:legal              # legal placeholders; read-only
```

`verify:a11y` launches Chromium through Playwright. Install it once with
`npx playwright install --with-deps chromium`, or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a binary the image already carries.

`verify:entitlements`, `verify:exposure`, and `verify:a11y --with-session` all
write to and delete from the database. Never point them at production. The
a11y script's default anonymous pass does not touch it.

Environment precedence is `.env.local`, then `.env`, then anything already
exported — exported wins, which is how CI injects secrets with no file on disk.
`scripts/load-env.ts` implements this; import it rather than `dotenv/config`,
which reads only `.env`.

## Conventions

Observable in the code, not general advice:

- Comments explain *why*, and say what was verified rather than implied. Several
  comments in `src/` document a trade-off or a limitation that is still live —
  treat those as load-bearing and update them when the trade-off changes.
- Known limitations are stated plainly in `README.md` rather than omitted.
- Server actions authorise individually; never rely on a parent layout.
  `tests/server-actions.test.ts` enforces it by reading the source — an action
  added without its gate fails the suite by name. There is no way to assert
  this from the types, and an ungated action looks exactly like a correct one.
- Schema columns carry both a Drizzle `$defaultFn` and a SQL `DEFAULT`, so raw
  SQL inserts work as well as ORM inserts.
- `/privacy` renders the log-retention period from `src/lib/retention.ts`, the
  same constant `scripts/prune-logs.ts` enforces, so the page cannot promise a
  period nothing applies. Nothing schedules the script — that is a deployment
  step, and `npm run verify:legal` lists it.
- Legal facts live only in `src/lib/legal.ts`, as marked `TODO_LEGAL:`
  placeholders rather than invented company details. `/terms` and `/privacy`
  render them through `legalValue()`. The privacy policy makes specific claims
  about what `src/db/schema.ts` stores — adding a column that holds personal
  data makes the policy wrong until it is updated. See `LEGAL.md`.
- Brand strings live only in `src/lib/brand.ts`. Do not hardcode the name,
  tagline or palette anywhere else; `next/og` images duplicate the palette there
  because they cannot read CSS variables.
  `tests/brand-single-source.test.ts` enforces the strings (comments excluded,
  since prose that names the shop is not a hardcoded brand string), and
  `tests/contrast.test.ts` enforces that the `next/og` palette still matches
  the CSS it mirrors.
- Colour tokens live in the `@theme` block of `src/app/globals.css` and are
  read back by `tests/contrast.test.ts`, which computes WCAG ratios from them.
  Adding a text colour, or a border that identifies a control, means adding the
  pair it is used in — axe cannot settle contrast against this design's
  gradients and overlays, so that test is the only thing watching.
- JSON-LD goes through `safeJsonLd()` in `src/lib/seo.ts`, which escapes `<`,
  `>`, `&` and U+2028/9. `JSON.stringify` alone is an XSS here — that was a real
  bug, not a hypothetical.

## Git workflow

- Default branch is `main`.
- One branch per completed unit of work, named `{type}/{short-description}/{status}`.
  See `CONTRIBUTING.md`, which also explains why the bracketed-with-spaces form
  is not usable (`git check-ref-format` rejects both spaces and `[`).
- `./scripts/new-branch.sh <type> "<description>" [status]` cuts a valid one.
- Commit subjects are `type: imperative summary`; bodies explain the reasoning
  and name what was verified.
- Automated sessions are assigned a branch and must push only to it.
- Do not open a pull request unless the user explicitly asks for one.
- CI runs on every push and PR (`.github/workflows/ci.yml`): typecheck, lint,
  `npm test`, the verify suites against a disposable Postgres service
  container, build, and `npm audit`. CodeQL and Dependabot run alongside it.
- No PR template, no CODEOWNERS, and no branch protection — protection is a
  repository setting nobody has enabled, so a red build does not block a merge.

## Outstanding gaps

Worth raising once, not fixing unprompted:

- No branch protection, so CI reports but cannot block a merge.
- No end-to-end tests. `npm test` covers the pure logic (presigned downloads,
  SEO helpers, rate limiting, the public projections, the health config check,
  palette contrast) and the webhook route's signature gate, and the `verify:*`
  scripts cover entitlements, field exposure, SEO metadata, runtime behaviour
  and accessibility. `verify:a11y` does drive a real browser, but only to audit
  anonymous pages — nothing walks a purchase, nothing talks to the Stripe API,
  and nothing writes to an actual S3 bucket.
- 4 high-severity advisories, all one nodemailer issue counted through
  `@auth/core`, `next-auth` and `@auth/drizzle-adapter`. Cannot be fixed
  without breaking Auth.js's declared peer range; the vector (`raw` messages)
  is unused here. See the exception register in `SECURITY.md`.
- The S3 `PutObject` upload path has never been exercised against real
  credentials; seeded `fileKey` values point at objects that do not exist, so
  downloads 404 at the storage layer even though the entitlement check passes.

## Maintaining this file

Update it in the same change that invalidates it. The value of this document is
that it is accurate; a CLAUDE.md describing a repository that does not exist is
worse than none. Keep it factual about what is in the repo, and mark inferences
as inferences.
