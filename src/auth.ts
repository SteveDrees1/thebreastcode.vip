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
