# Legal

**None of this is legal advice, and none of it has been reviewed by a lawyer.**
The documents in this repository were written to cover the obligations that
apply to selling digital content to consumers at a distance. Whether they are
sufficient for the places you actually sell into is a question for someone
qualified to answer it.

Run `npm run verify:legal` for the current state.

## What exists

| | |
| --- | --- |
| `/terms` | Terms of sale — licence scope, price and tax, delivery, the right to cancel and its waiver, refunds, subscriptions, liability, governing law |
| `/privacy` | Privacy policy — written against `src/db/schema.ts`, so it describes the data actually stored rather than a template's guess |
| `src/lib/legal.ts` | The company details both pages depend on, as marked placeholders |
| `scripts/verify-legal.ts` | Lists unfilled placeholders and the manual checks |

Both pages are linked from the footer on every page, listed in the sitemap, and
not disallowed in robots.txt — terms a customer cannot find are terms that were
not presented.

## Before you take real money

### 1. Fill in the placeholders

`src/lib/legal.ts` ships with `TODO_LEGAL:` markers instead of an invented
company name and address. That is deliberate: a terms page naming a company
that does not exist, or giving an address nobody can serve notice at, is a
false statement on a document customers are entitled to rely on.

```bash
npm run verify:legal            # what is still missing
npm run verify:legal -- --strict # non-zero while anything is missing
```

`--strict` is the pre-launch gate. The default is report-only because every
placeholder is unfilled until you fill it, and a check that fails from the day
it lands is a check people learn to ignore.

### 2. Set the Terms of Service URL in Stripe

**Checkout will fail without this.** `src/app/api/checkout/route.ts` sets
`consent_collection: { terms_of_service: "required" }`, and Stripe rejects a
session using it unless the account has a Terms of service URL under
Dashboard → Settings → Business → Public details. Set it to
`https://your-domain/terms`.

This was not verified against the live Stripe API — there are no real keys in
this repository — so complete one test-mode purchase and confirm the tickbox
appears before going live.

### 3. Understand what the consent box is for

A UK or EU consumer buying at a distance has 14 days to cancel. For digital
content delivered immediately that right *survives* unless the customer gave
express prior consent to delivery starting **and** acknowledged losing the
right (Consumer Rights Directive art. 16(m); UK Consumer Contracts Regulations
reg. 37).

Declaring the waiver in a terms document is not enough — it has to be obtained
at the point of sale. That is what the Checkout consent box does, and why the
wording there and clause 5 of `/terms` are a matched pair. Change one and you
must change the other, or the waiver stops working.

Without it, every download stays refundable for fourteen days regardless of
what the terms page says.

### 4. Tax

Stripe Tax calculates VAT and sales tax at checkout, and the products are
categorised as digital goods so the rates are right. It does not make you
compliant: you are the merchant of record, and registering and remitting where
you cross a threshold is yours. Confirm your position before you cross one, not
after.

### 5. Things a script cannot check

- A lawyer's review for the jurisdictions you sell into.
- Whether you need an Impressum (Germany) or equivalent local notice.
- Each processor's international transfer safeguards — the privacy policy says
  "typically Standard Contractual Clauses", which is true of the common
  providers but should be confirmed rather than assumed.
- Retention periods. The policy says records of a sale are kept "commonly six
  years, depending on where we are established". Replace that with the actual
  period once you know your jurisdiction.

## Things that are already handled

Worth knowing so they are not solved twice:

- **No cookie banner is needed as things stand.** The only cookie is the
  Auth.js session cookie, which is strictly necessary and therefore exempt from
  consent under ePrivacy. There is no analytics or advertising script anywhere
  in the app. Add one and this stops being true.
- **No card data touches the servers.** Stripe handles it end to end.
- **IP addresses are never stored raw.** `download_logs` and `admin_audit_log`
  hold a SHA-256 salted with `AUTH_SECRET` (`src/lib/audit.ts`), which is what
  lets the privacy policy describe the download log as security data rather
  than identification.
- **No passwords exist to leak.** Sign-in is an emailed single-use link.

## Keeping the documents honest

`src/lib/legal.ts` holds `lastUpdated`, which both pages display. Update it in
the same change that alters the text — a policy showing a date older than its
content is telling customers something untrue about which version they agreed
to.

The privacy policy makes specific claims about what is stored. If you add a
column holding personal data, or a third-party script, the policy is wrong
until you update it. `src/db/schema.ts` is the thing to check it against.
