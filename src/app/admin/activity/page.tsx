import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { requireConsole } from "@/lib/admin";
import { formatPrice } from "@/lib/stripe";
import { toggleAuditFlagAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Activity" };

/** Money fields read better as currency than as raw cents. */
function renderValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "priceCents" && typeof value === "number") return formatPrice(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

const FIELD_LABELS: Record<string, string> = {
  priceCents: "price",
  includedInSubscription: "all-access",
  publishedAt: "published",
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ flagged?: string }>;
}) {
  const user = await requireConsole();
  const { flagged } = await searchParams;
  const flaggedOnly = flagged === "1";

  const [entries, [{ value: flaggedCount }]] = await Promise.all([
    db
      .select()
      .from(adminAuditLog)
      .where(flaggedOnly ? eq(adminAuditLog.flagged, true) : undefined)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(200),
    db
      .select({ value: count() })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.flagged, true)),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label label-copper">Audit</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
            Activity
          </h2>
        </div>
        <Link
          href={flaggedOnly ? "/admin/activity" : "/admin/activity?flagged=1"}
          className={`label transition hover:text-copper ${
            flaggedOnly ? "label-copper" : ""
          }`}
        >
          {flaggedOnly ? "← all entries" : `⚑ flagged (${flaggedCount})`}
        </Link>
      </div>

      <p className="mt-2 max-w-lg text-sm text-muted">
        Every change made through the console <em>and</em> from the command line,
        newest first. Entries are kept even if the account that made them is later
        removed.
      </p>

      <hr className="rule mt-5 mb-2" />

      {entries.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          {flaggedOnly
            ? "Nothing flagged."
            : "Nothing recorded yet. Changes will appear immediately."}
        </p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`border-b border-line py-4 ${
                entry.flagged ? "-mx-3 border-l-2 border-l-copper bg-surface/40 px-3" : ""
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="label shrink-0">
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span className="min-w-0 flex-1 text-sm">{entry.summary}</span>
                <span className="label label-copper shrink-0">{entry.action}</span>

                {user.isAdmin ? (
                  <form action={toggleAuditFlagAction}>
                    <input type="hidden" name="id" value={entry.id} />
                    <button
                      type="submit"
                      className={`label transition hover:text-copper ${
                        entry.flagged ? "label-copper" : ""
                      }`}
                      aria-label={`${entry.flagged ? "Unflag" : "Flag"} this entry`}
                    >
                      {entry.flagged ? "⚑" : "⚐"}
                    </button>
                  </form>
                ) : entry.flagged ? (
                  <span className="label label-copper">⚑</span>
                ) : null}
              </div>

              <p className="label mt-1.5 truncate">{entry.actorEmail}</p>

              {entry.changes ? (
                <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <li key={field} className="font-mono text-xs text-muted">
                      <span className="text-faint">{FIELD_LABELS[field] ?? field}:</span>{" "}
                      {renderValue(field, change.from)}{" "}
                      <span className="text-copper">→</span>{" "}
                      <span className="text-text">{renderValue(field, change.to)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {entry.flagged && entry.flagNote ? (
                <p className="mt-2 text-xs text-copper">⚑ {entry.flagNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
