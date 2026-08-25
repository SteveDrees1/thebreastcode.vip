/**
 * How long operational logs are kept.
 *
 * This is here because `/privacy` makes a promise about it. The policy said
 * download logs "are kept for a rolling period rather than indefinitely" and
 * that "when a retention period ends, records are deleted or irreversibly
 * anonymised" — and nothing in the codebase deleted one, ever. The only
 * deletion path was the per-person GDPR erasure in `scripts/data-request.ts`,
 * which is a different promise to a different reader.
 *
 * A privacy notice that describes behaviour the software does not have is not
 * a documentation problem. It is a false statement about how personal data is
 * handled, and under GDPR Article 5(1)(e) the storage-limitation principle is
 * the thing it is falsely claiming to satisfy.
 *
 * So the number lives in one place, `/privacy` renders it rather than
 * restating it, and `scripts/prune-logs.ts` enforces it. The page cannot
 * describe a period the pruning does not apply.
 *
 * The period itself is an operating choice, not a legal fact — unlike the
 * placeholders in `legal.ts`, nobody has to look this up. Ninety days is long
 * enough to investigate the abuse the log exists for (one account shared with
 * hundreds of people, per the policy's own stated purpose) and short enough to
 * be a real limit. Change the constant if that is wrong for you; the page and
 * the script both follow.
 */
export const DOWNLOAD_LOG_RETENTION_DAYS = 90;

/** The instant before which rows of that age are due for deletion. */
export function retentionCutoff(
  days: number = DOWNLOAD_LOG_RETENTION_DAYS,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
