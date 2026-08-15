/**
 * Brand constants — the single source of truth for anything a customer reads
 * as identity: the name, the tagline, the series prefix, the palette.
 *
 * Centralised on purpose. The name appears in metadata, the header, the footer,
 * two generated social cards, the JSON-LD publisher block, llms.txt and the
 * PDF manifests. Scattering a string across those and then renaming means a
 * find-and-replace that always misses one; here it is one edit.
 *
 * See BRAND.md for positioning, voice and usage rules.
 */

export const brand = {
  /**
   * A "datum" is the reference surface every other measurement is taken from
   * in an engineering drawing — which is exactly what these plates are. "Press"
   * says publisher rather than blog. It fits the vocabulary already printed on
   * the plates themselves (N.T.S., REV A, PLATE 02/07).
   */
  name: "Datum Press",
  /** Uppercase wordmark, as it appears in the header and on the plates. */
  wordmark: "DATUM PRESS",
  /** For tight spaces: favicon alt, mobile, the footer rule. */
  shortName: "Datum",

  tagline: "Reference plates for the shop.",

  /** One sentence. Used for meta descriptions and the llms.txt summary. */
  description:
    "Print-ready reference plate sets: dimensioned diagrams, spec tables keyed to real stock, and working notes, designed to laminate and keep at the bench.",

  /** The line printed across the top of every plate. */
  seriesName: "Original Reference Series",

  /**
   * The domain the store runs on. Deliberately separate from `name`: the brand
   * and the address do not have to match, and this one currently does not —
   * see the note in BRAND.md.
   */
  domain: "thebreastcode.vip",

  /** Spec-bar vocabulary reused across the site and the social cards. */
  spec: {
    format: "US Letter",
    scale: "N.T.S.",
    print: "Full bleed",
  },
} as const;

/**
 * Palette, mirrored from globals.css.
 *
 * Duplicated here only because `next/og` renders outside the CSS pipeline and
 * cannot read custom properties. Any change must be made in both places, which
 * is why the list is short and the names match exactly.
 */
export const palette = {
  ink: "#07080a",
  surface: "#0d0f13",
  surface2: "#141821",
  line: "#1f242e",
  text: "#e9ecf1",
  muted: "#98a1b1",
  faint: "#6b7484",
  copper: "#e0913f",
  copperBright: "#f3ad63",
  cyan: "#4fd6c4",
} as const;
