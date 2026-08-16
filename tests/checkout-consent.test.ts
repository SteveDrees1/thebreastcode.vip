/**
 * The consent the checkout has to collect, and the terms clause it points at.
 *
 * This guards a legal control rather than a behaviour. A UK or EU consumer has
 * 14 days to cancel a distance purchase; for digital content delivered
 * immediately the right *survives* unless they gave express prior consent and
 * acknowledged losing it (CRD art. 16(m), UK CCR reg. 37). That consent has to
 * be obtained at the point of sale — a clause in a document nobody was made to
 * read does not do it.
 *
 * So `consent_collection` disappearing from the session would not break a
 * single test or throw a single error. It would silently make every download
 * refundable for a fortnight. These tests exist because nothing else would
 * notice.
 *
 * Stripe is mocked: the point is what parameters we *send*, which needs no
 * network and no keys.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Captures the arguments of the last checkout.sessions.create call. */
const created = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    checkout: { sessions: { create: created } },
  }),
  getOrCreateCustomer: vi.fn(async () => "cus_test_123"),
  formatPrice: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_1", email: "buyer@example.test" } })),
}));

vi.mock("@/lib/entitlements", () => ({
  hasAccess: vi.fn(async () => false),
  hasActiveSubscription: vi.fn(async () => false),
}));

/** A published product, returned by the route's `select ... limit(1)` chain. */
const PRODUCT = {
  id: "p_1",
  slug: "joinery-reference",
  title: "Joinery Reference",
  status: "published",
  priceCents: 1900,
  currency: "usd",
  stripePriceId: null,
};

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [PRODUCT],
        }),
      }),
    }),
  },
}));

async function postCheckout(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/checkout/route");
  return POST(
    new Request("https://example.test/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    }),
  );
}

/** The parameters the route handed Stripe. */
function sessionParams() {
  expect(created, "checkout.sessions.create was never called").toHaveBeenCalled();
  return created.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe("checkout collects the consent that waives the right to cancel", () => {
  beforeEach(() => {
    created.mockReset();
    created.mockResolvedValue({ url: "https://checkout.stripe.test/c/session_1" });
  });

  it("requires terms-of-service consent on a single product", async () => {
    await postCheckout({ kind: "product", slug: "joinery-reference" });
    expect(sessionParams().consent_collection).toEqual({ terms_of_service: "required" });
  });

  it("requires it on a subscription too", async () => {
    await postCheckout({ kind: "subscription" });
    expect(sessionParams().consent_collection).toEqual({ terms_of_service: "required" });
  });

  it("states what is being agreed to, rather than only linking the terms", async () => {
    // "Express" consent means the customer is told, at the point of sale, that
    // they are giving up the right — not that a document they could have
    // opened says so somewhere.
    await postCheckout({ kind: "product", slug: "joinery-reference" });
    const custom = sessionParams().custom_text as {
      terms_of_service_acceptance?: { message?: string };
    };
    const message = custom?.terms_of_service_acceptance?.message ?? "";

    expect(message).toMatch(/immediately/i);
    expect(message).toMatch(/lose .*right to cancel/i);
  });

  it("still charges the price from our database, not the request", async () => {
    // Guards the older invariant the route was built on, since this test now
    // has the session parameters in hand anyway.
    await postCheckout({
      kind: "product",
      slug: "joinery-reference",
      priceCents: 1,
      amount: 1,
    });
    const lineItems = sessionParams().line_items as Array<{
      price_data?: { unit_amount?: number };
    }>;
    expect(lineItems[0].price_data?.unit_amount).toBe(1900);
  });

  it("keeps automatic tax on, so VAT is calculated rather than absorbed", async () => {
    await postCheckout({ kind: "product", slug: "joinery-reference" });
    expect(sessionParams().automatic_tax).toEqual({ enabled: true });
  });
});

describe("the checkout wording and the terms clause stay a matched pair", () => {
  it("the terms page still contains the waiver the checkout claims it does", async () => {
    // The checkout box says the customer loses the right to cancel. If clause 5
    // of /terms stops explaining that, the consent points at nothing and the
    // waiver is on shakier ground than it looks.
    const { readFile } = await import("node:fs/promises");
    const terms = await readFile("src/app/terms/page.tsx", "utf8");

    expect(terms).toMatch(/lose your right to cancel/i);
    expect(terms, "the terms should still describe the 14-day right it waives").toMatch(
      /14 days/i,
    );
  });
});
