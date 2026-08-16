/**
 * The public projections, asserted at runtime.
 *
 * `satisfies Record<keyof PublicProduct, unknown>` already makes re-adding a
 * private column a compile error, and that is the stronger guard. This is the
 * belt to its braces, and it catches two things the type cannot:
 *
 *   1. A `satisfies` clause deleted along with the leak — the type error goes
 *      away with it, and nothing is left to complain.
 *   2. A column added to the schema and to the projection but never considered
 *      private, which type-checks perfectly.
 *
 * The list below is therefore written out by name rather than derived from the
 * types. Deriving it from `PrivateProductField` would make the test agree with
 * whatever the code currently claims, which is not a test.
 *
 * `scripts/verify-exposure.ts` covers the same property against a live
 * database, including a control that an unprojected row *does* carry fileKey.
 * This file needs no database.
 */
import { describe, expect, it } from "vitest";
import { publicBundleColumns, publicProductColumns } from "@/lib/catalog";

/** Columns that must never reach anything client-bound. */
const MUST_NEVER_BE_PUBLIC = [
  "fileKey", // the object key in the private PDF bucket — the expensive one
  "sourceSha256",
  "stripePriceId",
] as const;

describe("publicProductColumns", () => {
  const keys = Object.keys(publicProductColumns);

  it.each(MUST_NEVER_BE_PUBLIC)("does not expose %s", (field) => {
    expect(keys).not.toContain(field);
  });

  it("does not expose internal timestamps", () => {
    expect(keys).not.toContain("createdAt");
    expect(keys).not.toContain("updatedAt");
  });

  it("still carries what the storefront needs to render a product", () => {
    // If this fails the projection was trimmed too far and pages break.
    for (const field of ["id", "slug", "title", "priceCents", "currency", "status"]) {
      expect(keys).toContain(field);
    }
  });

  it("maps every key to a real Drizzle column, not a stray literal", () => {
    for (const [key, column] of Object.entries(publicProductColumns)) {
      expect(column, `${key} is not a column`).toBeTruthy();
      expect(typeof column, `${key} is not an object`).toBe("object");
    }
  });

  it("maps each key to the matching database column, not a neighbouring one", () => {
    // A copy-paste slip like `subtitle: products.description` type-checks
    // perfectly — both are text columns — and would serve one field's data
    // under another's name. Drizzle exposes the real column name, so the
    // camelCase key should snake_case to it.
    const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

    for (const [key, column] of Object.entries(publicProductColumns)) {
      expect((column as { name?: string }).name, `${key} maps to the wrong column`).toBe(
        snake(key),
      );
    }
  });
});

describe("publicBundleColumns", () => {
  const keys = Object.keys(publicBundleColumns);

  it("does not expose the Stripe price id", () => {
    expect(keys).not.toContain("stripePriceId");
  });

  it("does not expose internal timestamps", () => {
    expect(keys).not.toContain("createdAt");
  });

  it("still carries what the bundle page needs", () => {
    for (const field of ["id", "slug", "title", "priceCents", "currency", "status"]) {
      expect(keys).toContain(field);
    }
  });
});
