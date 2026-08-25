/**
 * Delete operational logs past their retention period.
 *
 * `/privacy` tells the reader that download logs are kept "for a rolling
 * period rather than indefinitely". Nothing made that true until this existed.
 * The period is `DOWNLOAD_LOG_RETENTION_DAYS` in `src/lib/retention.ts`, which
 * is also what the page renders, so the promise and the enforcement cannot
 * drift apart.
 *
 *   npm run prune:logs               # delete what is due
 *   npm run prune:logs -- --dry-run  # count it without deleting
 *
 * WRITES. Point it at production deliberately, on a schedule — nothing in this
 * repository runs it for you. See README for the scheduling note.
 *
 * Idempotent: running it twice deletes nothing the second time, so a retry
 * after a network failure is safe.
 */
import "./load-env";
import { lt, sql } from "drizzle-orm";
import { db } from "../src/db";
import { downloadLogs } from "../src/db/schema";
import { DOWNLOAD_LOG_RETENTION_DAYS, retentionCutoff } from "../src/lib/retention";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const cutoff = retentionCutoff();
  console.log(
    `Retention: ${DOWNLOAD_LOG_RETENTION_DAYS} days — anything before ` +
      `${cutoff.toISOString()} is due.`,
  );

  const [{ count: due }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(downloadLogs)
    .where(lt(downloadLogs.createdAt, cutoff));

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(downloadLogs);

  console.log(`download_logs: ${total} rows, ${due} past retention.`);

  if (dryRun) {
    console.log("--dry-run: nothing deleted.");
    return;
  }
  if (due === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const deleted = await db
    .delete(downloadLogs)
    .where(lt(downloadLogs.createdAt, cutoff))
    .returning({ id: downloadLogs.id });

  console.log(`Deleted ${deleted.length} row(s).`);
  // Reported rather than assumed equal: a row written between the count and
  // the delete legitimately changes the number, and a silent mismatch is how
  // a retention job quietly stops working.
  if (deleted.length !== due) {
    console.log(`(counted ${due} a moment earlier — rows are still being written)`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
