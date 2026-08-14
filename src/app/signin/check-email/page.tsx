import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false },
};

export default function CheckEmailPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className="label label-copper">Access</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
        Check your email
      </h1>
      <p className="mt-4 text-muted">
        We&rsquo;ve sent you a sign-in link. It expires in 24 hours and works once.
      </p>
      <p className="mt-6 text-sm text-faint">
        Nothing arrived? Check your spam folder, then request another link.
      </p>
    </div>
  );
}
