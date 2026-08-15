# thebreastcode.vip

An online catalog for selling PDF guides. Products can be bought individually,
grouped into discounted bundles, read through an all-access subscription, or
given away with promo codes and referral rewards.

## Stack

| Layer      | Choice                              | Why |
| ---------- | ----------------------------------- | --- |
| Framework  | Next.js 15 (App Router) + React 19  | Server components keep catalog pages indexable; one deploy target for pages, API routes, and webhooks |
| Language   | TypeScript                          | Types run from the database schema through to the UI |
| Database   | Postgres (Neon)                     | Partial indexes and `ON CONFLICT` do the heavy lifting for idempotent grants |
| ORM        | Drizzle                             | SQL-shaped, generates real migrations, no query-engine binary |
| Payments   | Stripe Checkout + Stripe Tax        | Hosted checkout (PCI stays with Stripe), subscriptions, automatic VAT/sales tax |
| Auth       | Auth.js v5, email magic link        | No passwords to leak; a verified email is what receipts and referrals need anyway |
| Files      | S3-compatible private bucket (R2)   | PDFs never become public URLs — access is a presigned link minted per download |
| Styling    | Tailwind v4                         | Theme tokens in CSS, no config file |

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

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:generate            # build migrations from the schema
npm run db:migrate             # apply them
npm run db:seed                # optional demo catalog
npm run dev
```

### Verifying the rules

```bash
npm run verify:entitlements    # scratch database only — it creates and deletes users
```

This exercises purchases, expiry, subscription lapse, promo caps, webhook-replay
idempotency, and refund revocation against a real database.

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

## Performance

- Catalog reads go through `unstable_cache` (`src/lib/catalog.ts`), so a page
  view costs a React render and no database round trip.
- Pages that show who is signed in are rendered per request. A route that reads
  the session cookie **cannot** also be prerendered — declaring
  `generateStaticParams` next to an `auth()` call is what produces
  `DYNAMIC_SERVER_USAGE`. Speed comes from caching the data, not the HTML.
- Static assets are served `immutable`; account pages and download redirects are
  `private, no-store` so no shared proxy can hand one customer another's link.

Measured on the catalog page against a local build: TTFB 20 ms, DOMContentLoaded
88 ms, 106 KB of JS, 182 DOM nodes, no console errors.

## Accessibility

Skip link as the first tab stop, one `h1` per page with no skipped levels,
landmark regions, `:focus-visible` rings in a colour that stays legible against
both the ground and the copper accents, labelled controls, and `role="alert"` on
error text.

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

## Not built yet

- Admin UI for creating products (insert rows or extend the seed script for now)
- Emailed receipts beyond Stripe's own
- Review the placeholder copy in `/terms` before taking real payments — the
  refund and EU/UK digital-goods withdrawal wording needs to match your policy
