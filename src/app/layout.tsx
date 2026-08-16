import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { auth, signOut } from "@/auth";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { organizationJsonLd, safeJsonLd, webSiteJsonLd } from "@/lib/seo";
import "./globals.css";

// Self-hosted at build time: no third-party request, no layout shift, and the
// CSP never has to allow an external font host.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: `${brand.name} — reference plate sets`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    type: "website",
    siteName: brand.name,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07080a",
  colorScheme: "dark",
};

const NAV = [
  { href: "/catalog", label: "Catalog" },
  { href: "/bundles", label: "Bundles" },
  { href: "/pricing", label: "All-access" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        {/* Publisher and site identity, emitted once rather than per page. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd([organizationJsonLd(), webSiteJsonLd()]),
          }}
        />

        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <header className="sticky top-0 z-50 border-b border-line bg-void/80 backdrop-blur-md">
          {/*
            Wraps to two rows on phones rather than hiding the links behind a
            menu button: the nav is rendered once and CSS reorders it, so there
            is no duplicated markup for screen readers and no JS to open it.
            Previously these links were `hidden sm:flex`, which left phone
            visitors with no way to reach the catalog from the header at all.
          */}
          <nav
            aria-label="Primary"
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-7 gap-y-0 px-5 py-3"
          >
            <Link href="/" className="order-1 flex min-h-6 items-center gap-2.5">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full bg-cyan live-dot"
              />
              <span className="font-display text-[0.95rem] font-bold tracking-tight">
                {brand.wordmark}
              </span>
            </Link>

            <ul className="order-3 flex w-full items-center gap-6 border-t border-line py-2.5 text-sm text-muted sm:order-2 sm:w-auto sm:border-0 sm:py-0">
              {(session?.user
                ? [...NAV, { href: "/account", label: "Account" }]
                : NAV
              ).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-6 items-center transition hover:text-text"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="order-2 ml-auto flex items-center gap-4 py-0.5 text-sm sm:order-3">
              {session?.user ? (
                <>
                  {session.user.isAdmin || session.user.canAudit ? (
                    <Link
                      href="/admin"
                      className="label label-copper inline-flex min-h-6 items-center transition hover:text-text"
                    >
                      Console
                    </Link>
                  ) : null}
                  <Link
                    href="/library"
                    className="inline-flex min-h-6 items-center text-muted transition hover:text-text"
                  >
                    Library
                  </Link>

                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex min-h-6 items-center text-muted transition hover:text-text"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/signin" className="btn btn-primary !px-4 !py-2 !text-sm">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-14">
          {children}
        </main>

        <footer className="mt-10 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <div className="flex flex-wrap items-start justify-between gap-8">
              <div>
                <p className="label label-copper">{brand.seriesName}</p>
                <p className="mt-2 max-w-xs text-sm text-muted">
                  {brand.tagline} Designed to laminate and use.
                </p>
              </div>
              <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                {[
                  { href: "/catalog", label: "Catalog" },
                  { href: "/bundles", label: "Bundles" },
                  { href: "/pricing", label: "All-access" },
                  { href: "/referrals", label: "Refer a friend" },
                  { href: "/redeem", label: "Redeem a code" },
                  { href: "/terms", label: "Terms" },
                  { href: "/privacy", label: "Privacy" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-muted transition hover:text-text"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            <hr className="rule my-8" />

            <p className="label">
              © {new Date().getFullYear()} {brand.name}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
