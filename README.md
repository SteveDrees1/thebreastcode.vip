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

### By hand

1. Upload the file to the **private** bucket, e.g. `pdfs/my-guide-v1.pdf`.
2. Insert a `products` row whose `fileKey` matches that object key.
3. Optionally upload a cover image and a short sample to a **public** bucket and
   set `coverImageUrl` / `samplePdfUrl`.
4. Set `status` to `published`.

The catalog revalidates hourly, so a new guide appears without a redeploy.

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
