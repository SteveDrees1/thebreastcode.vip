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
- **Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM over
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
npm run verify:entitlements       # scratch database only — writes and deletes
npm run verify:exposure           # scratch database only
npm run verify:seo                # read-only; safe against any database
npm run build
```

`verify:entitlements` and `verify:exposure` both write to and delete from the
database. Never point them at production.

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
- Schema columns carry both a Drizzle `$defaultFn` and a SQL `DEFAULT`, so raw
  SQL inserts work as well as ORM inserts.
- Brand strings live only in `src/lib/brand.ts`. Do not hardcode the name,
  tagline or palette anywhere else; `next/og` images duplicate the palette there
  because they cannot read CSS variables.
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
  the verify suites against a disposable Postgres service container, build, and
  `npm audit`. CodeQL and Dependabot run alongside it.
- No PR template, no CODEOWNERS, and no branch protection — protection is a
  repository setting nobody has enabled, so a red build does not block a merge.

## Outstanding gaps

Worth raising once, not fixing unprompted:

- No `LICENSE` — all rights reserved by default.
- No branch protection, so CI reports but cannot block a merge.
- No automated test suite beyond the three `verify:*` scripts, which cover
  entitlements, field exposure and SEO metadata but nothing else. There are no
  unit tests and no browser tests.
- 8 high-severity advisories in Next 15.5.23's bundled `sharp` and `postcss`,
  accepted with a compensating control — see the exception register in
  `SECURITY.md`. Retired by the Next 16 upgrade, which is not done.
- The S3 `PutObject` upload path has never been exercised against real
  credentials; seeded `fileKey` values point at objects that do not exist, so
  downloads 404 at the storage layer even though the entitlement check passes.

## Maintaining this file

Update it in the same change that invalidates it. The value of this document is
that it is accurate; a CLAUDE.md describing a repository that does not exist is
worse than none. Keep it factual about what is in the repo, and mark inferences
as inferences.
