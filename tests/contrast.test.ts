/**
 * Palette contrast, computed rather than eyeballed.
 *
 * `npm run verify:a11y` drives a real browser and is the broader check, but it
 * cannot settle contrast on this design: axe returns "incomplete" for anything
 * over a gradient or under a pseudo-element, which here means every primary
 * button (`linear-gradient` background) and every card (`.sheen::after`
 * overlay). On the home page alone that is 28 nodes it declines to judge —
 * including the main call to action. Verified, not assumed: the axe run prints
 * those as `color-contrast — N node(s)` under "needs a human to confirm".
 *
 * So the ratios are computed here from the tokens themselves. This is the
 * check that would have caught `--color-faint` at 3.77:1, and the one that did
 * catch `--color-line-bright` at 1.78:1 on an input border.
 *
 * Tokens are read out of `src/app/globals.css` rather than duplicated, so a
 * palette edit is what the test sees. A pair table is written out by hand
 * below, because *which* foreground sits on *which* ground is a fact about the
 * components, and deriving it from the CSS would only prove the CSS agrees
 * with itself.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../src/app/globals.css", import.meta.url)),
  "utf8",
);

/** Every `--color-*: #rrggbb` declaration in the `@theme` block. */
function readTokens(source: string): Record<string, string> {
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(source);
  if (!theme) throw new Error("no @theme block in globals.css");
  const tokens: Record<string, string> = {};
  for (const [, name, hex] of theme[1].matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g,
  )) {
    tokens[name] = hex.toLowerCase();
  }
  return tokens;
}

const token = readTokens(css);

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The text colour on copper fills. A literal rather than a token: it is a
 * near-black chosen to sit on copper specifically, and promoting it to the
 * palette would invite its use as a background. Asserted below to be the
 * value the CSS and the pricing badge actually use.
 */
const ON_COPPER = "#1a1206";

/** The three grounds anything can sit on. */
const GROUNDS = ["void", "surface", "surface-2"] as const;

type Pair = { fg: string; bg: string; min: number; where: string };

const TEXT_PAIRS: Pair[] = [
  // Normal-size body text: 4.5:1. Nothing in this design leans on the 3:1
  // large-text allowance — `--color-faint` is only ever paired with `text-sm`
  // or `text-xs`, which is why it had to move rather than be excused.
  ...(["text", "muted", "faint", "copper"] as const).flatMap((fg) =>
    GROUNDS.map((bg) => ({
      fg: token[fg],
      bg: token[bg],
      min: 4.5,
      where: `text-${fg} on bg-${bg}`,
    })),
  ),
  // .btn-primary is a vertical gradient between two copper stops, and its
  // label must clear both ends. The darker stop is the binding one.
  {
    fg: ON_COPPER,
    bg: token.copper,
    min: 4.5,
    where: ".btn-primary label on the gradient's dark stop, and the /pricing badge",
  },
  {
    fg: ON_COPPER,
    bg: token["copper-bright"],
    min: 4.5,
    where: ".btn-primary label on the gradient's light stop",
  },
  { fg: ON_COPPER, bg: token.copper, min: 4.5, where: ".skip-link" },
];

const NON_TEXT_PAIRS: Pair[] = [
  // SC 1.4.11: 3:1 for anything that identifies a control or its state.
  ...GROUNDS.map((bg) => ({
    fg: token["control-border"],
    bg: token[bg],
    min: 3,
    where: `.field / .btn-ghost border on bg-${bg}`,
  })),
  // The focus ring is offset 2px, so it is judged against the page ground it
  // sits on — never against the control it surrounds. On copper it would be
  // 1.42:1, which is the whole reason the offset exists.
  ...GROUNDS.map((bg) => ({
    fg: token.cyan,
    bg: token[bg],
    min: 3,
    where: `:focus-visible ring on bg-${bg}`,
  })),
];

describe("palette", () => {
  it("parses every colour token out of globals.css", () => {
    for (const name of [...GROUNDS, "text", "muted", "faint", "copper", "copper-bright", "cyan", "control-border"]) {
      expect(token[name], `--color-${name} missing from @theme`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("uses ON_COPPER where copper is a background", () => {
    // If someone changes the copper fills to plain white text, the ratio
    // assertions above would still pass while describing a colour nothing
    // uses. This is what keeps the table honest.
    expect(css).toContain(`color: ${ON_COPPER}`);
  });
});

describe("text contrast meets WCAG 2.2 AA", () => {
  for (const pair of TEXT_PAIRS) {
    it(`${pair.where} is at least ${pair.min}:1`, () => {
      const ratio = contrast(pair.fg, pair.bg);
      expect(
        ratio,
        `${pair.fg} on ${pair.bg} measured ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe("non-text contrast meets WCAG 2.2 AA (SC 1.4.11)", () => {
  for (const pair of NON_TEXT_PAIRS) {
    it(`${pair.where} is at least ${pair.min}:1`, () => {
      const ratio = contrast(pair.fg, pair.bg);
      expect(
        ratio,
        `${pair.fg} on ${pair.bg} measured ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe("the text hierarchy still reads as three steps", () => {
  // Raising --color-faint to clear AA moved it towards --color-muted. If the
  // two ever converge the fix will have flattened the design instead of
  // correcting it, and nothing else would notice.
  it("faint is dimmer than muted, which is dimmer than text", () => {
    const on = token["surface-2"];
    expect(contrast(token.faint, on)).toBeLessThan(contrast(token.muted, on));
    expect(contrast(token.muted, on)).toBeLessThan(contrast(token.text, on));
  });

  it("keeps a visible gap between faint and muted", () => {
    const on = token["surface-2"];
    expect(contrast(token.muted, on) - contrast(token.faint, on)).toBeGreaterThan(1);
  });
});

describe("the decorative hairlines are still decorative", () => {
  // --color-line-bright used to border the inputs and failed 1.4.11 there. It
  // remains in use for the registration marks and a card's hover border, which
  // carry no requirement. This records that it is *not* fit for a control, so
  // the next person to reach for it sees why the other token exists.
  it("line-bright does not meet 3:1 and so must not border a control", () => {
    expect(contrast(token["line-bright"], token.void)).toBeLessThan(3);
    expect(css).not.toMatch(/\.field\s*\{[^}]*var\(--color-line-bright\)/s);
  });
});
