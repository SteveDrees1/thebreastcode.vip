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
    session({ session, user }) {
      session.user.id = user.id;
      session.user.isAdmin = (user as typeof user & { isAdmin?: boolean }).isAdmin ?? false;
      return session;
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
