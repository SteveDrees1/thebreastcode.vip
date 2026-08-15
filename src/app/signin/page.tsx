import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { hit } from "@/lib/rate-limit";

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

          // Every request here sends an email on our budget, so cap both the
          // address (someone's inbox being flooded) and the source (a script
          // walking a list of addresses).
          const requestHeaders = await headers();
          const ip =
            requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

          const perEmail = hit(`signin:email:${email}`, 5, 900);
          const perIp = hit(`signin:ip:${ip}`, 15, 900);
          if (!perEmail.ok || !perIp.ok) {
            redirect("/signin?error=throttled");
          }

          await signIn("nodemailer", { email, redirectTo: next ?? "/library" });
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
        <button type="submit" className="btn btn-primary mt-4 w-full">
          Email me a link
        </button>
      </form>

      {error ? (
        <p id="signin-error" role="alert" className="mt-4 text-sm text-copper">
          {error === "throttled"
            ? "Too many sign-in requests. Please wait a few minutes and try again."
            : "That link didn’t work. Request a fresh one — links expire after 24 hours and can only be used once."}
        </p>
      ) : null}
    </div>
  );
}
