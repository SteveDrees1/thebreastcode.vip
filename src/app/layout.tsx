import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "The Breast Code — PDF guides",
    template: "%s · The Breast Code",
  },
  description:
    "A catalog of downloadable PDF guides. Buy individually, save with a bundle, or read everything with all-access.",
  openGraph: { type: "website", siteName: "The Breast Code" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4">
            <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
              The Breast Code
            </Link>
            <div className="flex items-center gap-5 text-sm text-ink-soft">
              <Link href="/catalog" className="hover:text-ink">
                Catalog
              </Link>
              <Link href="/bundles" className="hover:text-ink">
                Bundles
              </Link>
              <Link href="/pricing" className="hover:text-ink">
                All-access
              </Link>
            </div>
            <div className="ml-auto flex items-center gap-4 text-sm">
              {session?.user ? (
                <>
                  <Link href="/library" className="text-ink-soft hover:text-ink">
                    Library
                  </Link>
                  <Link href="/account" className="text-ink-soft hover:text-ink">
                    Account
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button type="submit" className="text-ink-soft hover:text-ink">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link
                  href="/signin"
                  className="rounded-full bg-accent px-4 py-1.5 font-medium text-white"
                >
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-sm text-ink-soft">
            <span>© {new Date().getFullYear()} The Breast Code</span>
            <Link href="/referrals" className="hover:text-ink">
              Refer a friend
            </Link>
            <Link href="/redeem" className="hover:text-ink">
              Redeem a code
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
