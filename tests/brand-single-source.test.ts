/**
 * Brand strings live in one module.
 *
 * `src/lib/brand.ts` is the only place the name, wordmark, tagline and domain
 * are written down. The rule is in CLAUDE.md and BRAND.md; nothing checked it,
 * and it had already been broken — `src/lib/stripe.ts` passed Stripe
 * `appInfo: { name: "thebreastcode.vip", version: "0.1.0" }`, hardcoding the
 * domain and a version copied from package.json. Nothing renders that, so it
 * would have gone stale in silence.
 *
 * Comments are excluded before matching. Prose that mentions the shop by name
 * — explaining a phishing risk, or what a customer sees — is not a hardcoded
 * brand string, and a check that flags it is a check that gets disabled. The
 * stripping is line-based and deliberately simple: block comments, and lines
 * whose first non-space characters are `//` or `*`. It can hide a violation
 * inside a trailing comment on a line of code; it cannot invent one.
 */
import { readFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";

const root = fileURLToPath(new URL("..", import.meta.url));

/** The strings that may appear only in brand.ts. */
const OWNED: Array<[string, string]> = [
  ["name", brand.name],
  ["wordmark", brand.wordmark],
  ["domain", brand.domain],
  ["tagline", brand.tagline],
];

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

const files = globSync("src/**/*.{ts,tsx}", { cwd: root })
  .map((f) => f.replaceAll("\\", "/"))
  .filter((f) => f !== "src/lib/brand.ts")
  .sort();

describe("brand strings", () => {
  it("found the source files at all", () => {
    // A broken glob would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("src/lib/stripe.ts");
    expect(files).not.toContain("src/lib/brand.ts");
  });

  it("are non-empty, so the search is for something real", () => {
    for (const [key, value] of OWNED) {
      expect(value, `brand.${key} is empty`).toBeTruthy();
      expect(value.length, `brand.${key} is too short to search for`).toBeGreaterThan(3);
    }
  });

  for (const [key, value] of OWNED) {
    it(`brand.${key} appears only in brand.ts`, () => {
      const offenders = files.filter((file) =>
        withoutComments(readFileSync(`${root}${file}`, "utf8")).includes(value),
      );
      expect(
        offenders,
        `hardcoded "${value}" — import it from @/lib/brand instead`,
      ).toEqual([]);
    });
  }
});
