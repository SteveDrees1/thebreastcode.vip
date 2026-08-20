/**
 * SEO helpers, two of which have a bug history worth locking down.
 *
 * `safeJsonLd` exists because `JSON.stringify` alone was an XSS here: it
 * escapes quotes but leaves `<` alone, so a product title containing
 * `</script>` closed the JSON-LD element early and everything after it parsed
 * as HTML. That was reproduced, not hypothesised.
 *
 * `metaDescription` exists because `subtitle ?? description.slice(0, 155)` had
 * no final fallback, so a product with both fields blank emitted no meta
 * description at all.
 */
import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";
import { metaDescription, productJsonLd, safeJsonLd } from "@/lib/seo";

describe("safeJsonLd", () => {
  it("escapes < and > so a title cannot close the script element", () => {
    const out = safeJsonLd({ name: "</script><img src=x onerror=alert(1)>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("\\u003c");
  });

  it("escapes ampersands", () => {
    expect(safeJsonLd({ name: "Mortise & Tenon" })).toContain("\\u0026");
  });

  it("escapes U+2028 and U+2029, which are raw newlines to a JS parser", () => {
    const out = safeJsonLd({ name: "a b c" });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
  });

  it("stays semantically identical — escaping changes bytes, not meaning", () => {
    const value = { name: "</script> & <b>", n: 12, ok: true, nested: { a: ["x", "y"] } };
    // JSON.parse understands \uXXXX, so a consumer sees the original string.
    expect(JSON.parse(safeJsonLd(value))).toEqual(value);
  });
});

describe("metaDescription", () => {
  it("prefers the first non-blank candidate", () => {
    expect(metaDescription("subtitle here", "description here")).toBe("subtitle here");
  });

  it("falls through a null candidate", () => {
    expect(metaDescription(null, "description here")).toBe("description here");
  });

  it("treats an empty string as absent, which `??` did not", () => {
    // The original bug: `"" ?? next` yields "", so a subtitle stored as an
    // empty string shadowed a perfectly good description.
    expect(metaDescription("", "description here")).toBe("description here");
  });

  it("treats whitespace-only as absent", () => {
    expect(metaDescription("   \n\t ", "description here")).toBe("description here");
  });

  it("never returns empty, even when every candidate is blank", () => {
    // This is the case that shipped with no meta description tag at all.
    expect(metaDescription(null, "")).toBe(brand.description);
    expect(metaDescription(undefined, undefined)).toBe(brand.description);
    expect(metaDescription()).toBe(brand.description);
  });

  it("collapses internal whitespace", () => {
    expect(metaDescription("a\n\n  b   c")).toBe("a b c");
  });

  it("leaves a description at or under the limit untouched", () => {
    const exact = "x".repeat(155);
    expect(metaDescription(exact)).toBe(exact);
    expect(metaDescription(exact)).not.toContain("…");
  });

  it("truncates a long description on a word boundary with an ellipsis", () => {
    const long = `${"word ".repeat(60)}end`;
    const out = metaDescription(long);

    expect(out.length).toBeLessThanOrEqual(156); // 155 + the ellipsis
    expect(out.endsWith("…")).toBe(true);
    // Cut at a space, so no half-word before the ellipsis.
    expect(out.slice(0, -1)).not.toMatch(/wor$|wo$|w$/);
  });

  it("still truncates when the text has no spaces to break on", () => {
    const out = metaDescription("x".repeat(400));
    expect(out.length).toBeLessThanOrEqual(156);
    expect(out.endsWith("…")).toBe(true);
  });

  it("does not leave dangling punctuation before the ellipsis", () => {
    const out = metaDescription(`${"alpha beta, ".repeat(30)}end`);
    expect(out).not.toMatch(/[,;:.\s]…$/);
  });
});

describe("productJsonLd", () => {
  const base = {
    name: "Joinery Reference",
    description: "A reference plate set.",
    sku: "joinery-reference",
    path: "/catalog/joinery-reference",
    priceCents: 1900,
    currency: "usd",
  };

  it("formats price as a decimal string and upper-cases the currency", () => {
    const out = productJsonLd(base);
    expect(out.offers.price).toBe("19.00");
    expect(out.offers.priceCurrency).toBe("USD");
  });

  it("handles a price that would lose a trailing zero", () => {
    expect(productJsonLd({ ...base, priceCents: 1990 }).offers.price).toBe("19.90");
    expect(productJsonLd({ ...base, priceCents: 5 }).offers.price).toBe("0.05");
  });

  it("builds an absolute offer URL from the site origin", () => {
    expect(productJsonLd(base).offers.url).toBe(
      "https://example.test/catalog/joinery-reference",
    );
  });

  it("always emits an absolute image, falling back to the route's own card", () => {
    // `image` is a required property for a Product rich result, and a crawler
    // reads this JSON detached from the page, so a relative path resolves
    // against nothing. Both halves were wrong before: a cover was emitted
    // verbatim as "/covers/x.webp", and a set with no cover emitted no image
    // at all.
    expect(productJsonLd({ ...base, image: "/covers/x.webp" }).image).toEqual([
      "https://example.test/covers/x.webp",
    ]);
    expect(productJsonLd({ ...base, image: "https://cdn.test/a.webp" }).image).toEqual([
      "https://cdn.test/a.webp",
    ]);

    // No cover, in each of the three ways a caller can express it.
    const card = ["https://example.test/catalog/joinery-reference/opengraph-image"];
    expect(productJsonLd(base).image).toEqual(card);
    expect(productJsonLd({ ...base, image: null }).image).toEqual(card);
    // An empty string is not nullish, so `??` would have made this
    // "https://example.test" — the site root, silently, as a product image.
    expect(productJsonLd({ ...base, image: "" }).image).toEqual(card);
  });

  it("survives a hostile title once passed through safeJsonLd", () => {
    const out = safeJsonLd(productJsonLd({ ...base, name: "</script><img src=x>" }));
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><img src=x>");
  });
});
