import type { Metadata } from "next";
import Link from "next/link";
import { requireConsole } from "@/lib/admin";

// Never cached, never prerendered: this is per-admin and always live.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Console", template: "%s · Console" },
  // Belt and braces with robots.ts — nothing here should ever be indexed.
  robots: { index: false, follow: false, nocache: true },
};

const NAV = [
  { href: "/admin", label: "Overview", key: "00" },
  { href: "/admin/products", label: "Sets", key: "01" },
  { href: "/admin/bundles", label: "Bundles", key: "02" },
  { href: "/admin/promos", label: "Promos", key: "03" },
  { href: "/admin/customers", label: "Customers", key: "04" },
  { href: "/admin/activity", label: "Activity", key: "05" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gates rendering for admins and auditors alike. Note this does NOT protect
  // the server actions — each one re-authorises independently and requires
  // isAdmin, because an action is its own endpoint and an auditor must not be
  // able to reach one.
  const user = await requireConsole();
  const readOnly = !user.isAdmin;

  return (
    <div className="-my-14">
      <div className="flex items-center justify-between gap-4 border-b border-line py-5">
        <div className="flex items-baseline gap-3">
          <span
            aria-hidden
            className="live-dot inline-block size-1.5 shrink-0 rounded-full bg-cyan"
          />
          <h1 className="font-display text-lg font-bold tracking-tight">Console</h1>
          <span className="label hidden sm:inline">
            {readOnly ? "read-only" : "restricted"}
          </span>
        </div>
        <p className="label truncate">{user.email}</p>
      </div>

      {readOnly ? (
        <div className="panel mt-5 border-cyan/30 p-3.5">
          <p className="text-sm text-muted">
            <span className="label" style={{ color: "var(--color-cyan)" }}>
              Auditor
            </span>{" "}
            — you can see everything here but cannot change anything. Controls that
            write are hidden, and the server refuses them regardless.
          </p>
        </div>
      ) : null}

      <div className="grid gap-10 py-8 lg:grid-cols-[168px_1fr]">
        <nav aria-label="Console" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 lg:block lg:space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-baseline gap-2.5 py-1.5 text-sm text-muted transition hover:text-text"
                >
                  <span className="label transition group-hover:text-copper">
                    {item.key}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <hr className="rule my-5 hidden lg:block" />

          <Link href="/catalog" className="label hidden transition hover:text-copper lg:block">
            ← Storefront
          </Link>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
