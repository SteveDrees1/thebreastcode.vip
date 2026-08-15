/**
 * Audit writing, shared by the console and the CLI scripts.
 *
 * This lives outside the server-action file because the scripts need it too —
 * a set imported from a terminal changes the catalog exactly as much as the
 * same edit made in the console, and a trail with a hole in it invites the
 * wrong conclusion when someone reads it later.
 *
 * Nothing here may import `next/headers`; callers that have a request pass the
 * hashed address in.
 */
import { createHash } from "node:crypto";
import { db } from "@/db";
import { adminAuditLog } from "@/db/schema";

export type Changes = Record<string, { from: unknown; to: unknown }>;

export interface AuditEntry {
  /** Null for CLI runs, which have no signed-in user. */
  actorId?: string | null;
  /** Always set: snapshotted so the entry survives the account being deleted. */
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Changes;
  ipHash?: string | null;
}

/** Field-level diff, keeping only what actually moved. */
export function diff<T extends Record<string, unknown>>(before: T, after: T): Changes {
  const changes: Changes = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}

/** Hash an address so the log is useful without storing raw IPs. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${ip}:${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Write an entry.
 *
 * Never allowed to break the operation it records: a logging failure must not
 * roll back a price change the operator believes succeeded. Failures go to the
 * server log, where they are visible without being destructive.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      changes:
        entry.changes && Object.keys(entry.changes).length > 0 ? entry.changes : null,
      ipHash: entry.ipHash ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}
