/**
 * Every server action authorises on its own.
 *
 * This is the codebase's most load-bearing convention and the one with the
 * least natural safety net. A server action is its own POST endpoint: it is
 * reachable by anyone who can construct the request, and it does *not* inherit
 * the protection of the layout or page it happens to be written next to. An
 * action added to `admin/actions.ts` without its gate is not a page that fails
 * to render — it is an unauthenticated mutation, and it looks exactly like the
 * ten correct actions around it.
 *
 * So this reads the source. There is no way to assert the property from the
 * types, and no way to reach the actions from a test without a running server
 * and a forged request. The check is crude on purpose: a name-level guard that
 * fails loudly beats a convention in a document that nobody diffs against.
 *
 * All eleven admin actions and both customer actions were already correct when
 * this was written. That is the point — the test exists so the twelfth is too.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

/** Exported async functions, split naively — the counts below catch a misparse. */
function exportedActions(source: string): Array<{ name: string; body: string }> {
  return source
    .split(/\nexport async function /)
    .slice(1)
    .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf("(")), body: chunk }));
}

describe("admin server actions", () => {
  const source = read("src/app/admin/actions.ts");
  const actions = exportedActions(source);

  it("is a 'use server' module, so every export is an endpoint", () => {
    expect(source).toMatch(/^"use server";/m);
  });

  it("parsed a plausible number of actions", () => {
    // Without this, a change to how the file declares its exports would make
    // every assertion below pass over an empty list.
    expect(actions.length).toBeGreaterThanOrEqual(11);
    expect(actions.map((a) => a.name)).toContain("saveProductAction");
  });

  it("routes its gate through getAdmin, not through a page guard", () => {
    // `authorize()` is the local helper each action calls. If it ever stopped
    // consulting getAdmin(), every assertion below would still pass while
    // authorising nothing.
    const helper = source.slice(source.indexOf("async function authorize("));
    expect(helper.slice(0, 600)).toMatch(/getAdmin\(/);
  });

  for (const action of actions) {
    it(`${action.name} authorises itself`, () => {
      expect(
        action.body,
        `${action.name} does not call authorize()/getAdmin() — it is an unauthenticated mutation`,
      ).toMatch(/\b(authorize|getAdmin|requireAdmin)\(/);
    });
  }
});

describe("customer server actions", () => {
  const source = read("src/app/actions.ts");
  const actions = exportedActions(source);

  it("parsed a plausible number of actions", () => {
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.map((a) => a.name)).toContain("redeemCodeAction");
  });

  for (const action of actions) {
    it(`${action.name} requires a signed-in user`, () => {
      expect(action.body, `${action.name} never calls auth()`).toMatch(/\bauth\(\)/);
      // Reading the session is not the same as refusing without one. Both
      // actions bounce an anonymous caller to /signin; asserting the guard
      // rather than the call is what makes this worth running.
      expect(
        action.body,
        `${action.name} reads the session but does not refuse an anonymous caller`,
      ).toMatch(/if \(!session\?\.user\?\.id\)/);
    });
  }
});
