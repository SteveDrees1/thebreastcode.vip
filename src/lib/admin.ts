/**
 * Console authorisation.
 *
 * Two levels, deliberately separate columns rather than a rank:
 *
 *   is_admin   full read/write
 *   can_audit  read-only — sees everything, changes nothing
 *
 * `is_admin` implies read access; `can_audit` never implies write. That
 * asymmetry is the whole point of the auditor role, so the two checks are
 * different functions and are never interchangeable:
 *
 *   requireConsole()  gates a page a viewer may read
 *   requireAdmin()    gates a page only a writer may read
 *   getAdmin()        gates a mutation — used by every server action
 *
 * All of them read the flags back from the database rather than trusting the
 * session cookie, so revoking access takes effect on the next request instead
 * of whenever the session happens to expire.
 *
 * `requireAdmin`/`requireConsole` refuse with 404 rather than 403: to anyone
 * without a flag, the console is indistinguishable from a URL that does not
 * exist.
 */
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface ConsoleUser {
  id: string;
  email: string;
  /** May change things. */
  isAdmin: boolean;
  /** May look. True for admins too. */
  canAudit: boolean;
}

async function loadConsoleUser(): Promise<ConsoleUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
      canAudit: users.canAudit,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) return null;
  if (!user.isAdmin && !user.canAudit) return null;

  // An admin can always read; an auditor can only read.
  return { ...user, canAudit: user.canAudit || user.isAdmin };
}

/** Page gate: admin or auditor. */
export async function requireConsole(): Promise<ConsoleUser> {
  const user = await loadConsoleUser();
  if (!user) notFound();
  return user;
}

/** Page gate: admin only. */
export async function requireAdmin(): Promise<ConsoleUser> {
  const user = await loadConsoleUser();
  if (!user?.isAdmin) notFound();
  return user;
}

/**
 * Mutation gate for server actions, which must not call `notFound()` —
 * throwing a navigation signal from an action produces a confusing client
 * error rather than a refusal. Returns null so callers can fail cleanly.
 *
 * Note this requires `isAdmin`, not console access: an auditor reaching a
 * server action id must be refused exactly like a stranger.
 */
export async function getAdmin(): Promise<ConsoleUser | null> {
  const user = await loadConsoleUser();
  return user?.isAdmin ? user : null;
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
