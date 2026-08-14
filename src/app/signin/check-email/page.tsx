import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="font-serif text-3xl">Check your email</h1>
      <p className="mt-3 text-ink-soft">
        We&rsquo;ve sent you a sign-in link. It expires in 24 hours and works once.
      </p>
      <p className="mt-6 text-sm text-ink-soft">
        Nothing arrived? Check your spam folder, then request another link.
      </p>
    </div>
  );
}
