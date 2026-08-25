import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await auth();
  const { next, error } = await searchParams;
  if (session?.user) redirect(next ?? "/library");

  return (
    <div className="mx-auto max-w-md">
      <p className="label label-copper">Access</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-3 text-muted">
        Enter your email and we&rsquo;ll send you a sign-in link. No password to
        remember.
      </p>

      <form
        action={async (formData: FormData) => {
          "use server";
          const email = String(formData.get("email") ?? "")
            .trim()
            .toLowerCase();

          /*
           * No rate limit here any more, and that is the fix rather than an
           * omission. It used to be checked in this action, which meant it
           * only ever saw requests from people using the form —
           * `POST /api/auth/signin/nodemailer` went straight past it and sent
           * as many emails as it was asked to. The limit now lives in the
           * `signIn` callback in auth.ts, which both paths go through.
           * Checking it here as well would consume two slots per submission
           * and halve the stated limit for honest visitors.
           */
          try {
            await signIn("nodemailer", { email, redirectTo: next ?? "/library" });
          } catch (error) {
            /*
             * A refused sign-in reaches a server action as a thrown AuthError,
             * not as a redirect — that only happens on the HTTP endpoint,
             * where Auth.js sends the browser to `pages.error`. Without this
             * catch the throttle showed the customer "Something broke" from
             * the error boundary, which is both alarming and untrue. Observed
             * in a browser on the sixth submission, not predicted.
             *
             * `signIn` also signals its *success* by throwing — that is how
             * `redirect()` works in Next — so anything that is not an
             * AuthError has to be rethrown or a working sign-in never
             * navigates.
             */
            if (error instanceof AuthError) redirect("/signin?error=throttled");
            throw error;
          }
        }}
        className="panel reg mt-8 p-6"
      >
        <label htmlFor="email" className="label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={error ? "signin-error" : undefined}
          className="field mt-2.5"
        />
        <SubmitButton className="btn btn-primary mt-4 w-full" pendingLabel="Sending…">
          Email me a link
        </SubmitButton>
      </form>

      {error ? (
        <p id="signin-error" role="alert" className="mt-4 text-sm text-copper">
          {/*
            `AccessDenied` is what Auth.js sends when the signIn callback
            refuses, and the throttle is the only thing in it that refuses —
            so on this page that code means exactly one thing. `throttled` is
            kept because a link somewhere may still carry it.
          */}
          {error === "throttled" || error === "AccessDenied"
            ? "Too many sign-in requests. Please wait a few minutes and try again."
            : "That link didn’t work. Request a fresh one — links expire after 24 hours and can only be used once."}
        </p>
      ) : null}
    </div>
  );
}
