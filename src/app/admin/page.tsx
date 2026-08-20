import Link from "next/link";
import { count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLog,
  bundles,
  entitlements,
  orders,
  products,
  promoCodes,
  subscriptions,
  users,
} from "@/db/schema";
import { requireConsole } from "@/lib/admin";
import { formatPrice } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireConsole();

  const [
    [{ value: publishedCount }],
    [{ value: draftCount }],
    [{ value: bundleCount }],
    [{ value: customerCount }],
    [{ value: activeSubs }],
    [{ value: promoCount }],
    [revenue],
    recentOrders,
    topSellers,
    recentActivity,
  ] = await Promise.all([
    db.select({ value: count() }).from(products).where(eq(products.status, "published")),
    db.select({ value: count() }).from(products).where(eq(products.status, "draft")),
    db.select({ value: count() }).from(bundles).where(eq(bundles.status, "published")),
    db.select({ value: count() }).from(users),
    db
      .select({ value: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active")),
    db.select({ value: count() }).from(promoCodes).where(eq(promoCodes.active, true)),
    db
      .select({
        gross: sql<number>`coalesce(sum(${orders.amountTotalCents}), 0)`,
        net: sql<number>`coalesce(sum(${orders.amountSubtotalCents}), 0)`,
        paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')`,
      })
      .from(orders)
      .where(eq(orders.status, "paid")),
    db
      .select({
        id: orders.id,
        total: orders.amountTotalCents,
        currency: orders.currency,
        status: orders.status,
        createdAt: orders.createdAt,
        email: users.email,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .orderBy(desc(orders.createdAt))
      .limit(8),
    // Entitlements are the honest measure of reach: they count comps and
    // referral claims, not just paid orders.
    db
      .select({
        title: products.title,
        slug: products.slug,
        grants: count(entitlements.id),
      })
      .from(entitlements)
      .innerJoin(products, eq(products.id, entitlements.productId))
      .where(isNull(entitlements.revokedAt))
      .groupBy(products.id, products.title, products.slug)
      .orderBy(desc(count(entitlements.id)))
      .limit(5),
    db
      .select({
        id: adminAuditLog.id,
        summary: adminAuditLog.summary,
        actorEmail: adminAuditLog.actorEmail,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(5),
  ]);

  const stats = [
    { k: "Published", v: publishedCount, href: "/admin/products" },
    { k: "Drafts", v: draftCount, href: "/admin/products" },
    { k: "Bundles", v: bundleCount, href: "/admin/bundles" },
    { k: "Customers", v: customerCount },
    { k: "Subscribers", v: activeSubs },
    { k: "Active promos", v: promoCount, href: "/admin/promos" },
  ];

  return (
    <div className="flex flex-col gap-12">
      <section>
        <p className="label label-copper">Overview</p>
        <hr className="rule mt-4 mb-6" />

        {/*
          A list of tiles, not a description list.

          This was a <dl> with <Link> as a direct child and the <dt>/<dd> pair
          inside it — which HTML forbids and which detaches the term from the
          list entirely for a screen reader. axe flagged both halves as
          serious: `definition-list` ("dl element has direct children that are
          not allowed: a") and `dlitem` ("Description list item does not have a
          <dl> parent element"), on every tile, at both viewports.

          Wrapping the anchor in a <div> would not have fixed it — the anchor
          still sits between the <dl> and its <dt>. The honest reading is that
          half of these tiles are navigation and the rest are figures, which is
          a list, not a set of term/definition pairs. The Revenue block below
          stays a <dl>, because that genuinely is one.
        */}
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-3">
          {stats.map((stat) => {
            const body = (
              <>
                <span className="label">{stat.k}</span>
                <span className="mt-1.5 block font-display text-3xl font-bold tabular-nums">
                  {String(stat.v).padStart(2, "0")}
                </span>
              </>
            );
            return (
              <li key={stat.k} className="bg-surface">
                {stat.href ? (
                  <Link
                    href={stat.href}
                    className="block px-5 py-4 transition hover:bg-surface-2"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <p className="label label-copper">Revenue · all time</p>
        <hr className="rule mt-4 mb-6" />

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line">
          <div className="bg-surface px-5 py-4">
            <dt className="label">Gross</dt>
            <dd className="mt-1.5 font-display text-2xl font-bold tabular-nums text-copper">
              {formatPrice(Number(revenue?.gross ?? 0))}
            </dd>
          </div>
          <div className="bg-surface px-5 py-4">
            <dt className="label">Ex-tax</dt>
            <dd className="mt-1.5 font-display text-2xl font-bold tabular-nums">
              {formatPrice(Number(revenue?.net ?? 0))}
            </dd>
          </div>
          <div className="bg-surface px-5 py-4">
            <dt className="label">Paid orders</dt>
            <dd className="mt-1.5 font-display text-2xl font-bold tabular-nums">
              {Number(revenue?.paid ?? 0)}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <p className="label label-copper">Recent orders</p>
        <hr className="rule mt-4 mb-2" />

        {recentOrders.length === 0 ? (
          <p className="py-6 text-sm text-muted">No orders yet.</p>
        ) : (
          <ul>
            {recentOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-3 text-sm"
              >
                <span className="label shrink-0">
                  {order.createdAt.toISOString().slice(0, 10)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  {order.email}
                </span>
                <span className="font-display font-semibold tabular-nums">
                  {formatPrice(order.total, order.currency)}
                </span>
                <span
                  className={`label ${order.status === "paid" ? "label-copper" : ""}`}
                >
                  {order.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <p className="label label-copper">Recent console activity</p>
          <Link href="/admin/activity" className="label transition hover:text-copper">
            All activity →
          </Link>
        </div>
        <hr className="rule mt-4 mb-2" />

        {recentActivity.length === 0 ? (
          <p className="py-6 text-sm text-muted">No changes recorded yet.</p>
        ) : (
          <ul>
            {recentActivity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-3 text-sm"
              >
                <span className="label shrink-0">
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.summary}</span>
                <span className="label truncate">{entry.actorEmail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="label label-copper">Most-held sets</p>
        <hr className="rule mt-4 mb-2" />

        {topSellers.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            Nothing granted yet — sales, comps and referral claims all show here.
          </p>
        ) : (
          <ul>
            {topSellers.map((row, i) => (
              <li
                key={row.slug}
                className="flex items-baseline gap-4 border-b border-line py-3"
              >
                <span className="label label-copper w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/catalog/${row.slug}`}
                  className="min-w-0 flex-1 truncate text-sm transition hover:text-copper"
                >
                  {row.title}
                </Link>
                <span className="font-display font-semibold tabular-nums">
                  {row.grants}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
