import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await auth();
  const { next, error } = await searchParams;
  if (session?.user) redirect(next ?? "/library");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="mt-3 text-ink-soft">
        Enter your email and we&rsquo;ll send you a sign-in link. No password to
        remember.
      </p>

      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("nodemailer", {
            email: String(formData.get("email") ?? ""),
            redirectTo: next ?? "/library",
          });
        }}
        className="mt-6"
      >
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="mt-4 w-full rounded-full bg-accent px-5 py-2.5 font-medium text-white"
        >
          Email me a link
        </button>
      </form>

      {error ? (
        <p className="mt-4 text-sm text-accent">
          That link didn&rsquo;t work. Request a fresh one — links expire after 24 hours
          and can only be used once.
        </p>
      ) : null}
    </div>
  );
}
