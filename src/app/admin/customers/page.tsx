import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloadLogs, entitlements, orders, referrals, users } from "@/db/schema";
import { requireConsole } from "@/lib/admin";
import { formatPrice } from "@/lib/stripe";
import { toggleUserFlagAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Customers" };

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; flagged?: string }>;
}) {
  const user = await requireConsole();
  const { q, flagged } = await searchParams;
  const search = q?.trim() ?? "";
  const flaggedOnly = flagged === "1";

  // One aggregate pass. Downloads and referrals are the two signals that
  // actually suggest account sharing or referral gaming.
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      flagged: users.flagged,
      flagReason: users.flagReason,
      isAdmin: users.isAdmin,
      canAudit: users.canAudit,
      owned: sql<number>`(
        select count(*) from ${entitlements}
        where ${entitlements.userId} = ${users.id} and ${entitlements.revokedAt} is null
      )`,
      downloads: sql<number>`(
        select count(*) from ${downloadLogs} where ${downloadLogs.userId} = ${users.id}
      )`,
      distinctIps: sql<number>`(
        select count(distinct ${downloadLogs.ipHash}) from ${downloadLogs}
        where ${downloadLogs.userId} = ${users.id}
      )`,
      referred: sql<number>`(
        select count(*) from ${referrals}
        where ${referrals.referrerUserId} = ${users.id} and ${referrals.status} = 'qualified'
      )`,
      spent: sql<number>`(
        select coalesce(sum(${orders.amountTotalCents}), 0) from ${orders}
        where ${orders.userId} = ${users.id} and ${orders.status} = 'paid'
      )`,
    })
    .from(users)
    .where(
      search
        ? sql`${users.email} ilike ${"%" + search + "%"}`
        : flaggedOnly
          ? eq(users.flagged, true)
          : undefined,
    )
    .orderBy(desc(users.flagged), desc(users.createdAt))
    .limit(100);

  const [{ value: total }] = await db.select({ value: count() }).from(users);
  const [{ value: flaggedCount }] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.flagged, true));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label label-copper">People</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
            Customers
          </h2>
        </div>
        <p className="text-sm text-muted tabular-nums">
          {total} total · {flaggedCount} flagged
        </p>
      </div>

      {/* GET form: the query lives in the URL, so a search is shareable and the
          back button behaves. */}
      <form method="GET" className="mt-6 flex flex-wrap gap-3">
        <label htmlFor="q" className="sr-only">
          Search by email
        </label>
        <input
          id="q"
          name="q"
          defaultValue={search}
          placeholder="Search by email…"
          className="field flex-1"
        />
        <button type="submit" className="btn btn-ghost">
          Search
        </button>
        <a
          href={flaggedOnly ? "/admin/customers" : "/admin/customers?flagged=1"}
          className={`btn btn-ghost ${flaggedOnly ? "border-copper text-copper" : ""}`}
        >
          {flaggedOnly ? "Showing flagged" : "Flagged only"}
        </a>
      </form>

      <hr className="rule mt-6 mb-2" />

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          {search ? `No accounts matching “${search}”.` : "No accounts yet."}
        </p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id} className="border-b border-line py-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {row.email}
                </span>

                {row.isAdmin ? <span className="label label-copper">admin</span> : null}
                {!row.isAdmin && row.canAudit ? (
                  <span className="label" style={{ color: "var(--color-cyan)" }}>
                    auditor
                  </span>
                ) : null}

                <span className="font-display text-sm font-semibold tabular-nums">
                  {formatPrice(Number(row.spent))}
                </span>

                {user.isAdmin ? (
                  <form action={toggleUserFlagAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={row.id} />
                    {!row.flagged ? (
                      <>
                        <label htmlFor={`reason-${row.id}`} className="sr-only">
                          Reason for flagging {row.email}
                        </label>
                        <input
                          id={`reason-${row.id}`}
                          name="reason"
                          placeholder="reason…"
                          className="field w-32 !py-1 !text-xs"
                        />
                      </>
                    ) : null}
                    <button
                      type="submit"
                      className={`label transition hover:text-copper ${
                        row.flagged ? "label-copper" : ""
                      }`}
                      aria-label={`${row.flagged ? "Unflag" : "Flag"} ${row.email}`}
                    >
                      {row.flagged ? "⚑ flagged" : "flag"}
                    </button>
                  </form>
                ) : row.flagged ? (
                  <span className="label label-copper">⚑ flagged</span>
                ) : null}
              </div>

              <p className="label mt-1.5">
                joined {row.createdAt.toISOString().slice(0, 10)} · {row.owned} owned ·{" "}
                {row.downloads} downloads
                {/* Distinct hashed IPs is the sharing signal worth surfacing. */}
                {Number(row.distinctIps) > 3
                  ? ` · ${row.distinctIps} distinct IPs`
                  : ""}
                {Number(row.referred) > 0 ? ` · ${row.referred} referred` : ""}
              </p>

              {row.flagged && row.flagReason ? (
                <p className="mt-1.5 text-xs text-copper">⚑ {row.flagReason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
