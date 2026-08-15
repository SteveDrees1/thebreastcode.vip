"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reports its own pending state.
 *
 * Server-action forms post and re-render with no built-in feedback, so without
 * this a customer redeeming a code sees nothing happen and clicks again. For a
 * promo redemption or a price save, a double submit is not harmless — it burns
 * a rate-limit slot and can race. Disabling while pending removes the whole
 * class of problem, and `useFormStatus` reads the state of the enclosing form
 * without any state of our own.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className} aria-busy={pending}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
