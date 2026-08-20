# Datum Press — brand and style guide

> Reference plates for the shop.

---

## The name

**Datum Press.**

A *datum* is the reference surface every other measurement on an engineering
drawing is taken from. That is precisely what these plate sets are: the thing
you measure against. *Press* says publisher rather than blog or app.

It fits vocabulary already printed on the plates — `N.T.S.`, `REV A`,
`PLATE 02 / 07`, `FORMAT LETTER · FULL BLEED` — so the shopfront and the product
speak the same language instead of the site sounding like marketing wrapped
around someone else's work.

**Alternatives considered**, kept here so the decision can be revisited:

| Name | Why it was in | Why not |
| ---- | ------------- | ------- |
| Benchmark Press | Bench pun plus reference mark; instantly legible | Over-used in software; harder to own in search |
| Kerf & Co. | Woodworking-native, memorable | Locks the brand to woodworking; blocks expansion into metal, electrical, trades |
| True Edge | Evokes accuracy and squareness | Generic; several existing tool brands |
| Scribe | The marking tool; short and sharp | Collides with writing-software products |

Datum is the only one that stays accurate if the catalog grows past woodworking
into any trade that works from a drawing.

### About the domain

The store currently runs on **thebreastcode.vip**, which does not match this
name or the catalog's subject. That mismatch costs real trust at checkout —
a shopper reading the address bar while entering card details is the worst
possible moment for confusion.

The brand name lives in exactly one file, `src/lib/brand.ts`, so this is a
decision you can act on cheaply in either direction:

- **Keep Datum Press** → point a matching domain (e.g. `datumpress.com`) at the
  same deployment and update `NEXT_PUBLIC_SITE_URL`. Nothing else changes.
- **Keep the current domain** → change `brand.name` and `brand.wordmark` in that
  one file. Every page, both social cards, the JSON-LD publisher block and
  `llms.txt` follow automatically.

---

## Positioning

**For** people who build things from drawings — woodworkers first, other trades
next — **who** are tired of re-deriving the same numbers from forum threads and
half-remembered rules of thumb, **Datum Press publishes** fixed-layout reference
plates **that** put the diagram, the spec table and the working notes on one
sheet you can laminate and keep at the bench.

**Unlike** a book, a video or a blog post, a plate is designed to be *used at the
moment of the cut* — at arm's length, with dusty hands, under bad light.

### What we are not

- Not a course. There is no curriculum and no completion.
- Not a magazine. Nothing here is topical or expires.
- Not a community. The product is the sheet, not the forum.

Being clear about this keeps the roadmap honest: the answer to "should we add
comments/streaks/a feed?" is no.

---

## Voice

Write like a good set of shop notes: **precise, unhurried, faintly dry.**

| Do | Don't |
| -- | ----- |
| "Tenon length, blind: 1″ – 1½″" | "Perfect your joinery today!" |
| "Species figures are typical values — individual boards vary." | "Guaranteed results every time." |
| "Yours to keep, no expiry." | "Lifetime access!!" |
| "This page isn't where it should be." | "Oops! Something went wrong :(" |

**Rules**

1. **State the number.** Anywhere a figure exists, print it. Vagueness reads as
   not knowing.
2. **Admit the tolerance.** "Rules of thumb — verify against your own material"
   builds more trust than false precision.
3. **No exclamation marks.** One in the 404 is the whole budget.
4. **Second person, sparingly.** "You save $11.25", not "Customers save".
5. **Humour is dry and rare.** It appears where someone is already mildly
   annoyed — a 404, an empty state — and never in the checkout path.

---

## Visual system

Everything below is implemented in `src/app/globals.css` and mirrored for the
social cards in `src/lib/brand.ts`.

### Colour

| Token | Hex | Use |
| ----- | --- | --- |
| `void` | `#07080a` | Page ground |
| `surface` | `#0d0f13` | Panels |
| `surface-2` | `#141821` | Insets, cover wells |
| `line` | `#1f242e` | Hairlines, dividers |
| `text` | `#e9ecf1` | Primary type |
| `muted` | `#98a1b1` | Body copy |
| `faint` | `#6b7484` | Micro-labels |
| **`copper`** | **`#e0913f`** | **The one accent: price, emphasis, primary action** |
| `cyan` | `#4fd6c4` | Live/interactive signal only — focus rings, status dots |

Copper and cyan never compete. Copper is the brand; cyan means *this is live or
focused*. If a screen needs a third accent, the screen is doing too much.

**Dark is committed, not a preference.** The plates are dark technical documents;
a light storefront would read as a different company. There is deliberately no
light theme.

### Type

- **Display** — Space Grotesk 700. Headings, prices, the wordmark. Tight
  tracking, angular, technical.
- **Body** — Inter. Everything a customer reads in sentences.
- **Mono** — JetBrains Mono, uppercase, `0.18em` tracking. Micro-labels,
  spec bars, document numbers, codes.

Self-hosted via `next/font`. No external font host, ever — it is a privacy leak,
a render-blocking request and a CSP exception all at once.

### Signature elements

These three make a surface recognisable as ours:

1. **Registration marks** — the `+` trim marks at panel corners, lifted from the
   printed plates. Light up copper on hover.
2. **Spec bar** — a bordered strip of mono labels with values beneath
   (`PLATES 07 · FORMAT PDF · LETTER · SCALE N.T.S.`), taken from the plate footer.
3. **Index numbers** — `01`, `02`, `03` in copper mono before list items. The
   catalog is a numbered series, and it should look like one.

**Index numbers and document numbers are not the same thing, and must never be
set in the same place.** An index number counts positions in a list and is
meaningless outside it. A document number (`No. WW-02`) belongs to the plate
set itself and is the same wherever the set appears. The corner of a plate — on
a card, on the detail page, on a printed sheet — is where a *document* number
goes, because that is what a corner number means to anyone who has held a
drawing. Putting a list position there once made the same set "Plate Set 01" on
the home page and "Plate Set 06" on the catalog, while its detail page showed a
third thing. A set with no document number shows no number at all; a blank
corner is honest, a wrong one is not.

### Logo

The wordmark is `DATUM PRESS` set in Space Grotesk 700, uppercase, tight
tracking, preceded by a pulsing cyan dot.

- **Clear space**: one cap-height on every side.
- **Minimum size**: 90px wide. Below that, drop to the dot alone.
- **Never**: recolour it, stretch it, add a gradient, outline it, or set it in
  another face.
- **On photography**: don't. Set it on flat `void` instead.

---

## Marketing

### Launch sequence

1. **Seed the series.** Publish WW-01 and WW-02 with real descriptions. Two
   plates make a series; one makes a pamphlet.
2. **Give away plate 01.** `LAUNCH2026` already grants a free set. The cheapest
   sample beats any amount of copy — the work sells itself once someone has a
   sheet in hand.
3. **Bundle immediately.** "The Complete Woodworking Series" at 25% off the
   sum. Bundles raise average order value from day one and give the referral
   reward something to point at.
4. **Turn on referrals.** Three qualified sign-ups earn a free set. The
   programme is built; it only needs the link surfaced in the post-purchase
   email.

### Channels, in the order they pay

| Channel | Why it works here | First move |
| ------- | ----------------- | ---------- |
| **Search** | People search exact questions: "mortise and tenon proportions", "wood movement per foot". Each plate answers one. | One plate = one long-tail page. `Product` + `Offer` markup is already live. |
| **Reddit / forums** | r/woodworking answers these questions daily, badly. | Answer the question fully in the thread; link the plate as the printable version. Never lead with the link. |
| **Assistant search** | `/llms.txt` already maps the catalog for models. | Nothing further. It compounds as models index. |
| **Email** | Buyers of WW-01 are the only qualified audience for WW-02. | "New plate in the series" — one email per release, no newsletter. |
| **Pinterest / Instagram** | The plates are visually distinctive and inherently shareable. | Post the cover render from `make:cover`. It is already the right aspect for a pin. |

### The line to lead with

> **Stop re-deriving the same numbers.**
> One sheet. Diagram, spec table, working notes. Print it, laminate it, keep it
> at the bench.

### What not to do

- **No discounting the catalog.** Reference material holds value; a permanent
  sale says it does not. Bundles and referrals are the discount mechanics.
- **No urgency theatre.** No countdowns, no "3 left" on an infinite PDF. It
  would be a lie, and this audience checks.
- **No email capture wall.** The catalog is the shop window. Let people look.

---

## Applying a rename

```ts
// src/lib/brand.ts
export const brand = {
  name: "Datum Press",
  wordmark: "DATUM PRESS",
  shortName: "Datum",
  // …
};
```

Change those, run `npm run build`, done. The header, footer, page titles, both
generated social cards, the JSON-LD publisher block and `llms.txt` all read from
this object.
