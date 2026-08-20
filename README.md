# Datum Press

**A storefront for selling PDFs.** Upload a PDF, price it, publish it — customers
buy it and get a signed download link that expires in minutes. Sells individual
files, discounted bundles, an all-access subscription, promo-code giveaways and
referral rewards, all from one entitlement model.

Built for [thebreastcode.vip](https://thebreastcode.vip), which publishes
print-ready reference plate sets for the workshop. The brand name lives in one
file — see [BRAND.md](BRAND.md).

```
PDF ──▶ import:product ──▶ make:cover ──▶ price & publish ──▶ customer buys
                                          (console)            ──▶ signed link
```

---

## What it does

| | |
| --- | --- |
| **Sell** | One-off files, multi-file bundles, or an all-access subscription — Stripe Checkout with automatic VAT/sales tax |
| **Deliver** | PDFs live in a private bucket; downloads are short-lived signed URLs minted only after an entitlement check, with a hashed-IP audit trail |
| **Give away** | Promo codes granting a file, a bundle, or the whole catalog; referral rewards after N sign-ups |
| **Manage** | A console for prices, publishing, bundles, promo codes and customers — no SQL required |
| **Watch** | Every change recorded with before/after values, from the console *and* the command line |

Two roles: `is_admin` (read/write) and `can_audit` (read-only — sees everything,
changes nothing).

## Why it is built this way

**One entitlement model.** Purchases, bundles, promos, referral rewards and
manual comps all write rows to `entitlements`, and one `hasAccess()` guards the
download path. Adding a new way to give something away never touches delivery.

The single deliberate exception is subscriptions, which are resolved *live*
against `products.includedInSubscription` rather than materialised as rows — so
a file published tomorrow is readable by today's subscribers, and access ends
the moment a plan lapses.

**Nothing private reaches the browser.** Storefront queries select through an
explicit column list, so `fileKey` — the private object key — is never in the
object at all. A `satisfies` clause makes re-adding it a compile error.

**Authorisation is re-checked per request, in the database.** A server action is
its own POST endpoint and does not inherit a layout's protection, so every
mutation authorises independently rather than trusting the session cookie.

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:generate && npm run db:migrate
npm run db:seed                # optional demo catalog
npm run dev
```

Both the app and the CLI scripts read `.env.local` first, then `.env`, and a
variable already set in your shell beats both — so CI can inject secrets with
no file on disk.

Then make yourself an admin and open `/admin`:

```sql
UPDATE users SET is_admin = true WHERE email = 'you@example.com';
```

### Publishing your first PDF

```bash
npm run import:product -- --pdf ./Guide.pdf --slug my-guide \
  --title "My Guide" --price 1900 --publish
npm run make:cover -- --pdf ./Guide.pdf --slug my-guide --local
```

`--local` writes the cover to `public/covers/` so you need no public bucket at
all. Full options in [Publishing a PDF](#publishing-a-pdf).

## Contributing

Each feature, bug or issue gets its own branch, named
`{type}/{short-description}/{status}` — see [CONTRIBUTING.md](CONTRIBUTING.md).
`./scripts/new-branch.sh feature "add referral credits" complete` cuts one and
validates the name first.

## Checks

```bash
npm run typecheck
npm run lint
npm test                      # unit tests — no database, network or credentials
npm run verify:entitlements   # 16 checks — scratch database only
npm run verify:exposure       # asserts no private column reaches the storefront
npm run verify:seo            # reports pages with no description of their own
npm run build
npm run verify:smoke          # against a running server: npm start, then this
npm run verify:a11y           # same running server; needs Chromium
npm run verify:legal          # unfilled legal placeholders; --strict before launch
```

`verify:a11y` drives a real browser. Install it once with `npx playwright
install --with-deps chromium`, or point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a
binary an image already has.

`verify:entitlements` exercises purchase, expiry, subscription lapse, promo
caps, webhook-replay idempotency and refund revocation against a real database.
`verify:exposure` includes a control assertion that an *unprojected* row still
contains `fileKey`, so it cannot pass by testing nothing. `verify:seo` only
reads, so unlike the other two it is safe against any database; it exits
non-zero only on a structural fault, because thin copy is a content task rather
than a broken build.

All of these run in CI (`.github/workflows/ci.yml`) on every push and pull
request, against a disposable Postgres service container, alongside CodeQL and
`npm audit`. Nothing blocks a merge, though — branch protection is a repository
setting and is not enabled.

## Stack

| Layer | Choice | Why |
| ----- | ------ | --- |
| Framework | Next.js 16 App Router, React 19 | Server components keep catalog pages indexable; one deploy target for pages, API routes and webhooks |
| Language | TypeScript | Types run from the database schema through to the UI |
| Database | Postgres (Neon) | Partial indexes and `ON CONFLICT` do the work for idempotent grants |
| ORM | Drizzle | SQL-shaped, real migrations, no query-engine binary |
| Payments | Stripe Checkout + Stripe Tax | Hosted checkout, subscriptions, automatic tax |
| Auth | Auth.js v5, email magic link | No passwords to leak; a verified email is what receipts and referrals need |
| Files | S3-compatible private bucket (R2) | PDFs never become public URLs |
| Styling | Tailwind v4 | Theme tokens in CSS, no config file |

## Repository map

```
src/
├── app/              routes — storefront, /admin console, API, OG images
├── lib/
│   ├── entitlements  the only module that answers "may this user read this?"
│   ├── catalog       cached reads + the public-column projection
│   ├── brand         name, tagline, palette — one edit renames everything
│   ├── admin         requireConsole / requireAdmin / getAdmin
│   ├── audit         shared by the console and the CLI scripts
│   └── seo           JSON-LD builders and safe serialisation
├── db/               Drizzle schema, client, seed
└── components/
scripts/              import:product, make:cover, verify:*
BRAND.md              name, voice, style guide, marketing
```

---

## How access works

Everything funnels into one question: *may this user read this PDF?*
[`src/lib/entitlements.ts`](src/lib/entitlements.ts) is the only module that
answers it, via two paths:

1. **A live row in `entitlements`** — written by a purchase, a bundle, a promo
   code, a referral reward, or a manual comp. Rows carry an optional `expiresAt`
   and a `revokedAt` for refunds.
2. **An active subscription** — resolved live against
   `products.includedInSubscription`, *not* materialised as rows. This is
   deliberate: a PDF published tomorrow must be readable by today's subscribers,
   and access must vanish the moment a subscription lapses.

Because every sales model reduces to the same check, adding a new promotion type
never touches the download path.

Grants are idempotent on `(userId, productId, source, sourceRef)`, which is what
makes Stripe webhook replays safe — a duplicate delivery writes nothing.

## Stripe setup

1. Create the all-access **Price** in the Stripe dashboard (recurring), and put
   its id in `STRIPE_SUBSCRIPTION_PRICE_ID`.
2. Enable **Stripe Tax** (Settings → Tax). Checkout passes
   `automatic_tax: { enabled: true }`, but you are still the merchant of record:
   you must register and remit in the jurisdictions where you cross thresholds.
3. Add a webhook endpoint pointing at `/api/stripe/webhook`, subscribed to:
   - `checkout.session.completed`
   - `customer.subscription.created` / `.updated` / `.deleted`
   - `charge.refunded`
4. Locally, forward events instead: `npm run stripe:listen`.

Per-product Stripe Prices are optional. If `products.stripePriceId` is empty the
checkout session builds `price_data` inline from `priceCents`, so you can list a
guide without creating anything in Stripe first.

## Publishing a PDF

Generators that emit a catalog manifest — such as the companion
[`workshop-guide`](https://github.com/SteveDrees1/workshop-guide) repo — import
in one command:

```bash
npm run import:product -- \
  --manifest ../workshop-guide/output/workshop_organizer_guide.manifest.json \
  --pdf      ../workshop-guide/output/workshop_organizer_guide.pdf \
  --price    3900 \
  --publish
```

That uploads the PDF to the private bucket and upserts the `products` row, so
the listing is derived from the same constants as the document and cannot drift
from it.

Re-run the same command to ship a revision. Two safeguards matter:

- **Re-import never overwrites `priceCents` and never demotes `status`.** Those
  are commercial decisions, not build output, so a rebuild cannot reset a price
  or unpublish a live product.
- **A stale manifest is rejected.** The PDF is re-hashed on import and compared
  against the manifest; if they disagree, the manifest was not rebuilt with the
  file and the import aborts rather than recording a checksum matching nothing.

Unchanged files are detected via `products.sourceSha256` and skip the upload.

Flags: `--skip-upload` (row only, object already in the bucket),
`--no-subscription` (sell individually, exclude from all-access),
`--cover-url <url>` (public cover image; only written when passed, so a
re-import never wipes an existing cover).

### PDFs without a manifest

Most finished PDFs carry no metadata worth trusting. Import them by describing
the product on the command line — page count, byte size and checksum are read
from the file itself:

```bash
npm run import:product -- \
  --pdf ./Joinery.pdf \
  --slug joinery-reference \
  --title "Joinery Reference" \
  --subtitle "Woodworking · Plate Set 01 · WW-01" \
  --description "$(cat description.txt)" \
  --doc-id WW-01 --price 1900 --publish
```

Titles and descriptions are **not** scraped from page one. Cover layouts vary,
and a wrong guess would be published to the storefront. With no `--title` and no
embedded PDF title the importer falls back to the filename, warns, and leaves
the product in `draft` unless you pass `--publish`.

### Cover images

The plate sets already open with a designed cover, so the catalog thumbnail is
page one of the PDF itself — what a customer sees is exactly what they get.

```bash
npm run make:cover -- --pdf ./Joinery.pdf --slug joinery-reference --local
```

`--local` writes `public/covers/<slug>.webp` and points the product row at it.
For a catalog this size that is a fine production answer: the images version
with the code, cost nothing to serve, and remove the need for a public bucket.
Commit the file so it deploys with the site.

Drop `--local` to upload to object storage instead — set `S3_PUBLIC_BASE_URL`
(and optionally `S3_PUBLIC_BUCKET`) to a **public** bucket or CDN domain. Covers
must never go in the private bucket the PDFs live in.

Preview without touching anything:

```bash
npm run make:cover -- --pdf ./Joinery.pdf --out ./preview.webp --dry-run
```

Flags: `--page N` (default 1), `--width N` (default 800), `--quality N`
(default 82). A letter page renders to roughly 35 KB of WebP in under a second.

Rendering uses pdf.js with a native canvas, so it works on any PDF regardless of
which tool produced it. Those packages are **devDependencies** — only this
script needs them, and they never enter the app bundle.

### By hand

1. Upload the file to the **private** bucket, e.g. `pdfs/my-guide-v1.pdf`.
2. Insert a `products` row whose `fileKey` matches that object key.
3. Optionally upload a cover image and a short sample to a **public** bucket and
   set `coverImageUrl` / `samplePdfUrl`.
4. Set `status` to `published`.

The catalog revalidates hourly, so a new guide appears without a redeploy.

## Design

The storefront borrows the vocabulary of the plate sets it sells — near-black
ground, copper accent, monospace micro-labels, corner registration marks. The
site should read as the same object as the product. It is dark by deliberate
brand choice, not a missing light theme.

Typography is self-hosted through `next/font` (Space Grotesk, Inter, JetBrains
Mono): no third-party request, no layout shift, and the CSP never has to allow
an external font host.

Motion is CSS-only and scroll-driven, so there is nothing to hydrate. The
entrance animation is **transform-only on purpose** — an opacity fade looks
better in a demo but leaves content invisible until scrolled into view, which
breaks printing, deep links, and any browser that resolves the scroll timeline
differently. `prefers-reduced-motion` disables all of it.

## Interface conventions

- **The header wraps to two rows on phones** rather than hiding links behind a
  menu button. The nav is rendered once and CSS reorders it, so there is no
  duplicated markup for screen readers and no JS to open it. (It previously used
  `hidden sm:flex`, which left phone visitors no way to reach the catalog at all.)
- **`not-found.tsx`** — a 404 with a hammer, a thumb and a nail that survived.
  It is also what an unauthorised visitor sees at `/admin`, so it never hints
  that anything is hidden.
- **`error.tsx`** — shows the error *digest* rather than the message. Production
  Next withholds the real error, and the digest is the handle that ties what the
  customer saw to the server log. Quoting eight characters beats "something went
  wrong".
- **`loading.tsx`** — a skeleton in the shape of the page. Every route renders
  per request, so a cold start would otherwise leave the previous page on screen.
- **`SubmitButton`** — server-action forms give no feedback while posting, so a
  customer redeeming a code clicks twice. For a promo redemption that burns a
  rate-limit slot and can race; `useFormStatus` disables the button instead.
- **Touch targets** are at least 24px tall in the header, per WCAG 2.2 (2.5.8).

## Performance

Measured against a production build, and held there by `verify:smoke`:

| | measured | budget |
| --- | --- | --- |
| `/` HTML | 8.1 KB gzipped | 25 KB |
| `/catalog` HTML | 7.2 KB gzipped | 25 KB |
| First-load JS | 178 KB gzipped, 9 chunks | 350 KB |
| TTFB (local, warm) | 15–25 ms | — |

The JS is essentially React 19 plus the Next App Router runtime — no server
library reaches the client, which the smoke test also checks by name. Fonts are
self-hosted through `next/font`, `display: swap`, latin subset only. Hashed
assets are `immutable`; covers get an hour fresh plus a day of
stale-while-revalidate because they are keyed by slug, not content hash. Account
pages and download redirects are `private, no-store`, so no shared proxy can
hand one customer another's signed link.

Budgets are roughly double what was measured. A budget tight enough to fail on
noise is a budget somebody disables.

**Every route is server-rendered on demand.** The root layout calls `auth()` to
decide whether the header says Sign in or Sign out, and reading a cookie opts
the whole route out of static rendering. The data underneath is cached
(`unstable_cache` + tag invalidation), so a request costs a render and no
database round trip.

Making the public catalog statically cacheable means Next's `cacheComponents`,
which was tried and is **not** a config flag away: it rejects
`export const dynamic`, which 18 routes rely on, so adopting it is a
restructure of the console, the API routes and checkout around `"use cache"`
and `<Suspense>` — and it is still experimental. Worth doing when it
stabilises; not worth doing blind on a payments path.

## SEO and discoverability

Everything below is generated from the database, so it cannot drift from the
catalog the way hand-maintained files do.

| Route | What it is |
| ----- | ---------- |
| `/sitemap.xml` | Every public URL with `lastModified`; private paths excluded |
| `/robots.txt` | Allows the public catalog, blocks customer and machinery paths |
| `/llms.txt` | The [llmstxt.org](https://llmstxt.org) convention — a curated map for language models, with live titles, prices and links |
| `/opengraph-image` | Generated 1200×630 social card for the site |
| `/catalog/[slug]/opengraph-image` | Per-set card with its title, doc number and plate count |
| `/bundles/[slug]/opengraph-image` | Per-bundle card naming the sets inside it |

**Social cards were the biggest gap** — before this, every shared link rendered
as a bare URL. Cards are drawn with `next/og` in the same vocabulary as the
plates, using no external fonts so they cannot fail on a locked-down network.
Product pages deliberately do **not** set `openGraph.images`: doing so would
override the generated card, and the cover is a 3:4 portrait that crops badly to
the 1.91:1 social ratio.

Bundles had no card at all until later, and the reason is a trap worth knowing:
a segment that declares `openGraph` in its metadata **without** `images` does
not inherit the root's file-based card. The bundle page declared one, so it
emitted no `og:image` whatsoever — not even the site default — while product
pages, which have a card file in their own segment, were fine. Confirmed in the
served HTML rather than reasoned about, and `verify:smoke` now asserts that
both detail routes emit an `og:image` and that the URL actually returns an
image.

**Structured data**, all escaped through `safeJsonLd` (see the XSS note below):

- `Organization` + `WebSite` site-wide, emitted once in the layout
- `Product` + `Offer` on every set and bundle — price and availability in results
- `BreadcrumbList` on set and bundle pages — results show a trail, not a bare URL
- `ItemList` on the catalog

`Product.image` is always present and always absolute. It used to emit the
cover path verbatim (`/covers/x.webp`), which a crawler reading the JSON
detached from its page cannot resolve, and a set with no cover emitted no
`image` at all — a missing required property. Both now fall back to the route's
own `opengraph-image`, which is a real 1200×630 PNG of that exact item.

Canonical URLs are set on every public page; customer pages carry
`robots: { index: false }` and `/admin` additionally sends `X-Robots-Tag`.

### AI crawlers

`robots.txt` lists assistant crawlers explicitly (GPTBot, ClaudeBot,
PerplexityBot, Google-Extended, CCBot and others) and **allows** them the same
public catalog as anyone else. For a store like this, being answerable inside an
assistant is discovery, not leakage: the PDFs are not public, so the most a model
can reach is a sales page. Listing them by name makes opting out a one-line
change later rather than a research project.

### Caching note

Catalog reads go through `unstable_cache` with a one-hour TTL, and the social
cards read the same cache. An edit made **through the console** calls
`revalidateTag`, so the page and its card both refresh immediately — verified.
An edit made with **raw SQL** bypasses that and waits out the TTL, which is
worth knowing if you change a title in psql and wonder why the card is stale.

## Accessibility

Audited against WCAG 2.2 AA, and the contrast figures are computed rather than
eyeballed:

| | |
| --- | --- |
| Landmarks | `lang`, skip link, `<main>`, one `h1` per page, labelled `<nav>` — checked on `/`, `/catalog`, `/signin`, `/terms` |
| Headings | no skipped levels on any audited page |
| Forms | every input labelled; no button without an accessible name |
| Focus | `:focus-visible` ring, and a skip link that is off-screen until focused |
| Motion | animations sit behind `prefers-reduced-motion: no-preference` |
| Target size | buttons are ~37 px tall, above the 24 px floor of WCAG 2.2 SC 2.5.8 |
| Contrast | every text colour ≥ 4.5:1 on every background it is used on; control borders and the focus ring ≥ 3:1 (SC 1.4.11) |
| Automated | axe (WCAG 2.2 AA tags) over every anonymous page at two viewports, plus a computed contrast test — both in CI |

Three things were fixed rather than found compliant.

- `--color-faint` measured 3.77:1 on `--color-surface-2` — below the 4.5:1 AA
  floor for normal text, and all nine of its usages were `text-sm` or
  `text-xs`, so none qualified for the 3:1 large-text allowance. It is now
  4.97:1 at its worst, still comfortably dimmer than `--color-muted` so the
  hierarchy is intact.
- `--color-line-bright` was the border on every `.field` and `.btn-ghost` at
  1.78:1 against `--color-void`. That border is the *only* thing identifying
  the control, which SC 1.4.11 puts at 3:1. Controls now use a separate
  `--color-control-border` at 3.57:1; the dimmer token stays for the corner
  registration marks and card hover borders, which carry no such requirement.
- There was no `forced-colors` support at all, so Windows High Contrast Mode
  flattened the button backgrounds and the focus ring's fixed cyan. A `@media
  (forced-colors: active)` block now pins focus to `Highlight` and gives
  buttons, panels and rules real borders.

Error text carries `role="alert"`, so a failed form announces itself rather
than changing silently.

Both checks now run in CI, and they cover different halves:

- **`npm run verify:a11y`** loads every anonymously reachable page in Chromium
  at two viewports and runs axe against `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`
  /`wcag22aa`. 24 visits, 20 audited, 0 violations — the four unaudited are
  `/referrals` and `/redeem` at both viewports, which redirect to sign-in. The
  run fails if any always-public page goes unaudited, so a clean result cannot
  be an empty one.
- **`tests/contrast.test.ts`** computes the ratios from the tokens in
  `globals.css`. This exists because axe *cannot* settle contrast here: a
  gradient background or a pseudo-element overlay makes it return "incomplete",
  which on the home page alone is 28 nodes including the primary call to
  action. Both defects above would have passed an axe-only run.

Not covered: no screen-reader pass, and nothing checks the console at `/admin`
or any other page behind a session — `verify:a11y` is anonymous by
construction. Automated rules also catch only part of WCAG; a green run is a
floor, not a pass.

## The console (`/admin`)

Price changes, publishing, bundles, promo codes and customers — the things that
previously needed raw SQL.

Two levels of access, as separate columns rather than a rank:

```sql
-- full read/write
UPDATE users SET is_admin  = true WHERE email = 'you@example.com';
-- read-only: sees everything, changes nothing
UPDATE users SET can_audit = true WHERE email = 'accountant@example.com';
```

A "Console" link appears in the header for either. `is_admin` implies read
access; `can_audit` never implies write — that asymmetry is the whole point of
the auditor role, so the checks are separate functions
(`requireConsole` / `requireAdmin` / `getAdmin`) and are never interchangeable.
For an auditor the write controls are hidden **and** every action refuses them
server-side; hiding a button is a courtesy, not a control.

**Authorisation is enforced per request, in two independent places**, and the
distinction matters:

- `requireAdmin()` gates page rendering.
- `authorize()` in `src/app/admin/actions.ts` gates every mutation.

A server action compiles to its own POST endpoint with a generated id. It is
reachable by anyone holding that id and it does **not** re-run the layout that
"protects" the page it was rendered on. A layout check only hides the buttons;
the action's own check is what stops the request. Both read `is_admin` back from
the database rather than trusting the session cookie, so revoking admin takes
effect on the next request instead of whenever the session expires.

Refusal is a 404, not a 403: to anyone without the flag, the console is
indistinguishable from a URL that does not exist.

Every write calls `revalidateTag(CATALOG_TAG)`, so an edit reaches the
storefront immediately despite the catalog cache.

### Audit log

Every console mutation writes to `admin_audit_log` and appears under
**Activity** — who did it, what changed, and the before/after for the fields
worth reconstructing (`price: $19 → $27`).

Two details make it trustworthy rather than decorative:

- The actor's **email is snapshotted** and `actor_id` clears to NULL instead of
  cascading, so deleting a staff account leaves their history intact. An audit
  log that disappears along with the account that made the changes is not an
  audit log. Verified: after deleting the acting admin, all entries survive with
  the email preserved.
- Recording is wrapped so a logging failure can never roll back the operation it
  describes — a price change the operator saw succeed must not be undone because
  an insert failed. Failures go to the server log instead.

IP addresses are stored hashed, as elsewhere.

**The CLI writes to the same log.** `import:product` and `make:cover` change the
catalog exactly as much as the console does, so a trail that covered only the UI
would invite the wrong conclusion when someone read it later. Terminal runs have
no session, so `actor_id` stays null and the actor is the shell user
(`cli:steve`) unless you name yourself:

```bash
npm run import:product -- --pdf ./Joinery.pdf --slug joinery-reference \
  --actor you@example.com
```

### Flags

Two kinds, both surfaced in the console:

- **Audit entries** can be flagged for follow-up, with a "flagged only" filter —
  for marking a change you want to come back to. Flagging is deliberately *not*
  itself audited: an auditor marking twenty entries during a review would bury
  the entries they were reading.
- **Customer accounts** can be flagged with a reason, shown alongside download
  counts, distinct hashed IPs and referral counts — the signals that actually
  suggest a shared login or referral gaming. Flagging a person **is** audited,
  because it is a judgement about someone and the reasoning should be
  reconstructable.

## What the browser is allowed to see

Every response is built from an explicit field list. Nothing is sent because it
happened to be on the row.

**Products and bundles.** `src/lib/catalog.ts` defines `publicProductColumns`
and `publicBundleColumns`; every storefront query selects through them, so
`fileKey` (the private object key in the PDF bucket), `sourceSha256`,
`stripePriceId` and the row timestamps are never in the object at all.

The `satisfies Record<keyof PublicProduct, unknown>` on those projections is the
guard, and it is load-bearing rather than decorative: it makes the projection an
object literal subject to excess-property checking, so re-adding `fileKey` fails
to compile. Plain assignability does **not** catch this — a query result with
extra columns is still assignable to the narrower type, which is exactly how
this class of leak ships unnoticed. Both directions are verified: adding a
private column fails with TS2353, dropping a public one fails with TS1360.

**Sessions.** The `session` callback in `src/auth.ts` returns an explicit object
rather than mutating the adapter's. The default object is the session row spread
with the full user row, and `GET /api/auth/session` returns it verbatim — which
would publish `sessionToken`, the actual credential, to any script on the page,
defeating the httpOnly cookie. It now returns `{ expires, user: { id, name,
email, image, isAdmin } }` and nothing else, so new columns on `users` are
private by default.

**API routes** return only what the caller needs: `{ url }` from checkout and
portal, `{ received: true }` from the webhook, a 302 to a short-lived presigned
URL from downloads. Errors return fixed strings; stack traces and driver
messages stay in the server log.

Run `npm run verify:exposure` to check this against a real database. It asserts
the projections and the rows they return carry no private field, and includes a
control assertion that an unprojected row *does* still contain `fileKey` — so
the test cannot quietly pass by testing nothing.

## Security notes

- The PDF bucket must not be public. `src/lib/storage.ts` is the only code that
  mints URLs, and `/api/download/[productId]` is the only caller — after
  re-checking entitlement on every request.
- Download links expire after `DOWNLOAD_URL_TTL_SECONDS` (default 5 minutes), so
  a shared link is worth little and revocation takes effect on the next click.
- Prices are always read server-side from the database, never from the request
  body.
- Download IPs are stored hashed, for spotting shared accounts without keeping
  raw addresses.
- A per-request **nonce-based CSP** is set in `src/middleware.ts` with
  `strict-dynamic`, so Next's own scripts run and injected ones do not.
  `style-src` still needs `'unsafe-inline'` — Next injects inline `<style>`
  while streaming and offers no nonce hook for it. That is a considered
  trade-off, not an oversight.
- HSTS (2 years, preload), `Permissions-Policy` denying camera/mic/geo/payment,
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, COOP `same-origin`, and no
  `X-Powered-By`.
- **Rate limiting** (`src/lib/rate-limit.ts`) on promo redemption (5 / 5 min —
  codes are guessable, so this is where volume pays off), downloads (30 / 5 min),
  checkout (12 / min), and magic-link sign-in (per address and per IP, since
  each request spends money on email).

  It counts **per server instance**: exact on a single VPS, per warm lambda on
  serverless, so the real ceiling is `limit × instances`. That still defeats the
  attacks it targets, all of which need volume through one path. Every caller
  goes through one `hit()` function — swap it for Upstash or Vercel KV if you
  need an exact global limit.

## Deploying to Vercel

Set every variable from `.env.example` in the project settings, point the
Stripe webhook at the deployed URL, and run `npm run db:migrate` against the
production database as part of your release step.

`AUTH_URL` and `NEXT_PUBLIC_SITE_URL` must match the public origin, or magic
links and Stripe redirects will point at the wrong host.

## Legal

`/terms` and `/privacy` are written and linked from every page. Two things to
know before taking real money, both covered in [LEGAL.md](LEGAL.md):

1. **`src/lib/legal.ts` ships with placeholders, not invented company details.**
   A terms page naming a company that does not exist is worse than no page.
   `npm run verify:legal` lists what is missing; `-- --strict` fails while any
   remain.
2. **Checkout requires a Terms of service URL on your Stripe account.** The
   session sets `consent_collection`, which Stripe rejects without one — so
   every checkout fails until it is set. This is also what obtains the EU/UK
   waiver of the 14-day right to cancel, which a terms document alone cannot
   do.

Subject access and erasure requests are answerable with
`npm run data:request` — export a customer's data as JSON, or irreversibly
anonymise them while keeping the sale record tax law requires. See
[LEGAL.md](LEGAL.md).

Neither document has been reviewed by a lawyer.

## Operations

`GET /api/health` answers uptime monitors and post-deploy checks:

| | |
| --- | --- |
| `200 {"status":"ok"}` | database reachable and every required variable set |
| `503 {"status":"degraded"}` | something is wrong — point your monitor at the status code |

Anonymous callers get only that verdict. Naming which subsystem is unconfigured
would tell a stranger which part of the stack to go after, so the detail —
per-area config report, database latency, the list of degraded areas — is
returned only to a signed-in console user. Variable *names* appear there;
values never do, and a test asserts it.

This exists because `src/lib/env.ts` resolves lazily, which is right for builds
(a missing Stripe key must not break a build of pages that never touch Stripe)
but means a deploy missing `STRIPE_SECRET_KEY` boots cleanly and fails when a
customer clicks Buy. Hit this endpoint after deploying and you find out first.

Never cached, `noindex`, and not rate limited — locking out the thing that
tells you the site is down is a poor trade, and it costs one `select 1`.

## Known limitations

- **`/admin` answers 200 for a signed-in non-admin**, though the body is the 404
  page with no console chrome and no data. `notFound()` cannot set a status once
  the response has begun streaming. Anonymous probes are answered with a real
  404 in middleware, which covers the case that matters; `/admin` is listed in
  robots.txt anyway, so its existence was never secret.
- **Rate limiting counts per server instance** — exact on one VPS, per warm
  lambda on serverless. Every caller goes through one `hit()` function if you
  need an exact global limit (Upstash, Vercel KV).
- **`style-src` still needs `'unsafe-inline'`.** Next injects inline `<style>`
  while streaming and offers no nonce hook for it.
- **`PutObject` has never run against a real bucket**, for want of credentials;
  `--skip-upload` and `--local` work around it. The *download* half is covered:
  presigning is local HMAC computation, so `npm test` asserts the real signed
  URL — bucket, key, TTL, that the secret never appears in it, and that a
  filename cannot inject a header. What no test can tell you is whether the
  object exists or whether the provider accepts the signature.
- **Several catalog pages have no description of their own.** Every page emits
  one — `metaDescription()` guarantees that — but the last-resort fallback is
  the generic brand line, so a page with no copy renders correctly while being
  indistinguishable from every other page in a search result. `npm run
  verify:seo` lists which ones — 1 of 4 on a freshly seeded catalog, more once
  you import real PDFs. Fixing it means writing copy, not code.
- **4 high-severity advisories, all one nodemailer issue** counted through
  `@auth/core`, `next-auth` and `@auth/drizzle-adapter`. Auth.js declares
  `nodemailer: "^7.0.7 || ^8.0.5"`, so the patched 9.x installs as an invalid
  peer on the sign-in path. The vector is the `raw` message option, which this
  app never uses. Recorded in `SECURITY.md` with what retires it.

## Not built yet

- Admin UI for creating products (insert rows or extend the seed script for now)
- Emailed receipts beyond Stripe's own
- Review the placeholder copy in `/terms` before taking real payments — the
  refund and EU/UK digital-goods withdrawal wording needs to match your policy
