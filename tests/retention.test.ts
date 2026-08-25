/**
 * The retention period the privacy policy promises is the one the pruning
 * script enforces.
 *
 * `/privacy` used to say download logs "are kept for a rolling period rather
 * than indefinitely", and nothing deleted one — ever. The only deletion path
 * was per-person GDPR erasure, which answers a different question for a
 * different reader. A privacy notice describing behaviour the software does
 * not have is a false statement about how personal data is handled, and
 * storage limitation (GDPR Article 5(1)(e)) is exactly what it was falsely
 * claiming to satisfy.
 *
 * These assertions pin the two halves together: the page must render the
 * constant rather than restate the number, and the script must use the same
 * one. Neither can move without the other.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_LOG_RETENTION_DAYS, retentionCutoff } from "@/lib/retention";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

describe("retentionCutoff", () => {
  it("is the retention period before the given instant", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const cutoff = retentionCutoff(90, now);
    expect(cutoff.toISOString()).toBe("2026-03-03T12:00:00.000Z");
  });

  it("defaults to the published period", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(retentionCutoff(undefined, now)).toEqual(
      retentionCutoff(DOWNLOAD_LOG_RETENTION_DAYS, now),
    );
  });

  it("is a period a person could actually be told", () => {
    expect(DOWNLOAD_LOG_RETENTION_DAYS).toBeGreaterThan(0);
    expect(Number.isInteger(DOWNLOAD_LOG_RETENTION_DAYS)).toBe(true);
  });
});

describe("the promise and the enforcement stay together", () => {
  it("the privacy page renders the constant instead of restating the number", () => {
    const page = read("src/app/privacy/page.tsx");
    expect(page).toMatch(/import \{ DOWNLOAD_LOG_RETENTION_DAYS \} from "@\/lib\/retention"/);
    expect(page).toMatch(/\$\{DOWNLOAD_LOG_RETENTION_DAYS\}/);
    // The old wording promised a rolling period with nothing behind it. If it
    // comes back, so does the gap between what is said and what is done.
    expect(page).not.toContain("kept for a rolling period");
  });

  it("something actually deletes the logs, using the same constant", () => {
    const script = read("scripts/prune-logs.ts");
    expect(script).toMatch(/from "\.\.\/src\/lib\/retention"/);
    expect(script, "the script must delete, not only report").toMatch(
      /\.delete\(downloadLogs\)/,
    );
  });

  it("is wired to a script name, or nobody can run it", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["prune:logs"]).toBe("tsx scripts/prune-logs.ts");
  });
});
