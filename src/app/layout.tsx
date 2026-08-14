import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { auth, signOut } from "@/auth";
import { env } from "@/lib/env";
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
    default: "The Breast Code — reference plate sets",
    template: "%s · The Breast Code",
  },
  description:
    "Print-ready reference plate sets. Dimensioned diagrams, spec tables and working notes — buy a set, save with a series bundle, or read everything with all-access.",
  applicationName: "The Breast Code",
  openGraph: {
    type: "website",
    siteName: "The Breast Code",
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
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <header className="sticky top-0 z-50 border-b border-line bg-void/80 backdrop-blur-md">
          <nav
            aria-label="Primary"
            className="mx-auto flex max-w-6xl items-center gap-7 px-5 py-3.5"
          >
            <Link href="/" className="group flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full bg-cyan live-dot"
              />
              <span className="font-display text-[0.95rem] font-bold tracking-tight">
                THE BREAST CODE
              </span>
            </Link>

            <ul className="hidden items-center gap-6 text-sm text-muted sm:flex">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition hover:text-text">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="ml-auto flex items-center gap-4 text-sm">
              {session?.user ? (
                <>
                  <Link href="/library" className="text-muted transition hover:text-text">
                    Library
                  </Link>
                  <Link
                    href="/account"
                    className="hidden text-muted transition hover:text-text sm:inline"
                  >
                    Account
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button
                      type="submit"
                      className="text-muted transition hover:text-text"
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
                <p className="label label-copper">Original Reference Series</p>
                <p className="mt-2 max-w-xs text-sm text-muted">
                  Print-ready plate sets for the shop. Designed to laminate and use.
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

            <p className="label">© {new Date().getFullYear()} The Breast Code</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
