import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bundles, products, promoCodes } from "@/db/schema";
import { requireConsole } from "@/lib/admin";
import { createPromoAction, togglePromoAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Promos" };

export default async function AdminPromosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const user = await requireConsole();
  const { error, created } = await searchParams;

  const [codes, productList, bundleList] = await Promise.all([
    db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)),
    db
      .select({ id: products.id, title: products.title })
      .from(products)
      .where(eq(products.status, "published"))
      .orderBy(asc(products.title)),
    db
      .select({ id: bundles.id, title: bundles.title })
      .from(bundles)
      .where(eq(bundles.status, "published"))
      .orderBy(asc(bundles.title)),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <section>
        <p className="label label-copper">Giveaways</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
          Promo codes
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted">
          These grant content outright. For percentage discounts at checkout, use
          Stripe&rsquo;s own promotion codes instead — checkout already accepts them.
        </p>

        <hr className="rule mt-5 mb-2" />

        {codes.length === 0 ? (
          <p className="py-6 text-sm text-muted">No codes yet.</p>
        ) : (
          <ul>
            {codes.map((code) => {
              const exhausted =
                code.maxRedemptions !== null &&
                code.redemptionCount >= code.maxRedemptions;

              return (
                <li
                  key={code.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3.5"
                >
                  <span className="font-mono text-sm tracking-wider text-copper">
                    {code.code}
                  </span>
                  <span className="label">{code.kind.replace(/_/g, " ")}</span>

                  <span className="ml-auto text-sm tabular-nums text-muted">
                    {code.redemptionCount}
                    {code.maxRedemptions === null ? " / ∞" : ` / ${code.maxRedemptions}`}
                  </span>

                  {exhausted ? <span className="label">claimed out</span> : null}

                  {user.isAdmin ? (
                  <form action={togglePromoAction}>
                    <input type="hidden" name="id" value={code.id} />
                    <button
                      type="submit"
                      className={`label transition hover:text-copper ${
                        code.active ? "label-copper" : ""
                      }`}
                      aria-label={`${code.active ? "Disable" : "Enable"} code ${code.code}`}
                    >
                      {code.active ? "active" : "disabled"}
                    </button>
                  </form>
                  ) : (
                    <span className={`label ${code.active ? "label-copper" : ""}`}>
                      {code.active ? "active" : "disabled"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {user.isAdmin ? (
      <section>
        <p className="label label-copper">New code</p>
        <hr className="rule mt-4 mb-6" />

        {created ? (
          <p role="status" className="panel mb-5 border-copper/40 p-3 text-sm text-copper">
            Code created.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="panel mb-5 border-copper/40 p-3 text-sm text-copper">
            {error}
          </p>
        ) : null}

        <form action={createPromoAction} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Code</span>
              <input
                name="code"
                required
                minLength={3}
                maxLength={40}
                placeholder="LAUNCH2026"
                autoCapitalize="characters"
                className="field mt-2 tracking-[0.2em] uppercase"
              />
            </label>

            <label className="block">
              <span className="label">Grants</span>
              <select name="kind" defaultValue="free_product" className="field mt-2">
                <option value="free_product">one set, free</option>
                <option value="free_bundle">a whole bundle, free</option>
                <option value="free_catalog">the entire catalog, free</option>
              </select>
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Set (for &ldquo;one set&rdquo;)</span>
              <select name="productId" defaultValue="" className="field mt-2">
                <option value="">—</option>
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Bundle (for &ldquo;a bundle&rdquo;)</span>
              <select name="bundleId" defaultValue="" className="field mt-2">
                <option value="">—</option>
                {bundleList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Redemption limit</span>
              <input
                name="maxRedemptions"
                inputMode="numeric"
                placeholder="blank = unlimited"
                className="field mt-2 tabular-nums"
              />
            </label>

            <label className="block">
              <span className="label">Note (internal)</span>
              <input
                name="note"
                maxLength={300}
                placeholder="Newsletter launch"
                className="field mt-2"
              />
            </label>
          </div>

          <div>
            <button type="submit" className="btn btn-primary">
              Create code
            </button>
          </div>
        </form>
      </section>
      ) : null}
    </div>
  );
}
