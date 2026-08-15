/**
 * Admin authorisation.
 *
 * `requireAdmin()` must be called at the top of every admin page *and* every
 * admin server action. Gating the layout alone is not enough and it is worth
 * being precise about why: a server action compiles to its own POST endpoint
 * with a generated id, reachable by anyone who has that id, and it does not
 * re-run the layout that "protects" the page it was rendered on. A layout check
 * hides the buttons; only the action's own check stops the request.
 *
 * The session's `isAdmin` is never trusted as the decision either — it is read
 * back from the database here, so revoking someone's admin flag takes effect on
 * their next request rather than whenever their session happens to expire.
 */
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface AdminUser {
  id: string;
  email: string;
}

/**
 * Returns the signed-in admin, or refuses.
 *
 * Refusal is a 404 rather than a 403 on purpose: to anyone without the flag,
 * the admin area should be indistinguishable from a URL that does not exist.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const [user] = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.isAdmin) notFound();

  return { id: user.id, email: user.email };
}

/**
 * Same check for server actions, which must not call `notFound()` — throwing a
 * navigation signal from an action produces a confusing client error rather
 * than a refusal. Returns null instead so callers can fail cleanly.
 */
export async function getAdmin(): Promise<AdminUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user] = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return user?.isAdmin ? { id: user.id, email: user.email } : null;
}

/** Money helpers: the database stores integer cents, forms speak dollars. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function inputToCents(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}
