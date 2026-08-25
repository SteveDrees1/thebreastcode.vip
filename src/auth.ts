/**
 * Auth.js v5 configuration.
 *
 * Magic-link email only. For a digital-goods store this is the right trade-off:
 * there are no passwords to leak or reset, and a verified email address is
 * exactly what a receipt and a download link need anyway. Verified email is
 * also the anti-fraud gate for the referral programme.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { headers } from "next/headers";
import { checkSignInThrottle } from "@/lib/signin-throttle";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { qualifyReferral } from "@/lib/referrals";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      canAudit: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    /*
     * Send failures back to our own page rather than Auth.js's default error
     * screen, which is unbranded and says "AccessDenied" to someone who has
     * simply asked for too many links. `/signin` reads `?error=` and explains
     * it in the site's own words.
     */
    error: "/signin",
  },
  providers: [
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    /**
     * The single choke point for emailed sign-in links.
     *
     * This runs before `sendVerificationRequest`, on every path — the sign-in
     * form's server action *and* a direct `POST /api/auth/signin/nodemailer`,
     * which Auth.js mounts for every provider and advertises from
     * `GET /api/auth/providers`. The throttle used to live in the form's
     * action, which meant it only ever inspected requests from people who were
     * not trying to get around it: ten direct POSTs sent ten emails to one
     * address against a stated limit of five per fifteen minutes. Reproduced
     * against a local SMTP sink, not inferred.
     *
     * Returning false makes Auth.js redirect to `pages.error` above.
     */
    async signIn({ email, user }) {
      // Only the verification-request step sends mail. Following a link back
      // is the same callback with `email` absent, and must not be throttled —
      // that would lock out the person who just asked for the link.
      if (!email?.verificationRequest) return true;

      const address = user?.email;
      // No address means nothing to key on and nothing to send to. Auth.js
      // would reject it anyway; refusing here keeps an unkeyed request from
      // reaching the transport at all.
      if (!address) return false;

      const requestHeaders = await headers();
      const ip =
        requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

      const verdict = checkSignInThrottle({ email: address, ip });
      if (!verdict.ok) {
        // The address is not logged: this is the one place that knows someone
        // typed it, and it may not be theirs.
        console.warn(`[signin] throttled by ${verdict.reason} limit`);
        return false;
      }
      return true;
    },

    /**
     * Build the session object from scratch rather than mutating the one the
     * adapter hands over.
     *
     * That default object is the database session row spread together with the
     * full user row, and `GET /api/auth/session` returns it verbatim to the
     * browser. Mutating it would have published `sessionToken` — the actual
     * credential — to any script on the page, which defeats the point of the
     * cookie being httpOnly, along with `stripeCustomerId`, `referralCode` and
     * `createdAt`, none of which the UI needs.
     *
     * Returning an explicit object means new columns on `users` are private by
     * default: a field reaches the browser only if someone adds it here.
     */
    session({ session, user }) {
      const row = user as typeof user & { isAdmin?: boolean; canAudit?: boolean };
      return {
        expires: session.expires,
        user: {
          id: row.id,
          name: row.name,
          email: row.email,
          image: row.image,
          // Kept because they gate console links in the header. Neither is
          // authorisation on its own — every page and action re-checks against
          // the database.
          isAdmin: row.isAdmin ?? false,
          canAudit: row.canAudit ?? false,
        },
      };
    },
  },
  events: {
    /**
     * A new account is the moment a pending referral becomes real. We attach
     * the referral here (the code was stashed in a cookie at click time) and
     * mark it qualified, since arriving through a magic link proves the email.
     */
    async createUser({ user }) {
      if (user.id) await qualifyReferral(user.id);
    },
  },
});
