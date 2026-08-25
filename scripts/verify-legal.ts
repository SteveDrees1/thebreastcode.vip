/**
 * Are the legal pages actually fit to publish?
 *
 * `src/lib/legal.ts` ships with marked placeholders instead of invented
 * company details, because a terms page naming a company that does not exist
 * is worse than no page. This finds the ones still unfilled.
 *
 *   npm run verify:legal            # report; exits 0
 *   npm run verify:legal -- --strict # exits 1 if anything is unfilled
 *
 * Report-only by default on purpose. Every placeholder is unfilled until the
 * owner fills it, so failing CI on that would mean CI is red from the day the
 * file lands until launch — and a build that is always red is a build nobody
 * reads. `--strict` is the pre-launch gate: run it before taking real money.
 */
import "./load-env";
import { legal, unfilledLegal } from "../src/lib/legal";

const strict = process.argv.includes("--strict");

/**
 * Things no code can check, listed so they are not quietly forgotten. These
 * are settings and reviews, not values in a file.
 */
const MANUAL_CHECKS = [
  "Schedule `npm run prune:logs` — daily is plenty. /privacy tells the reader " +
    "download logs are deleted after their retention period, and nothing in this " +
    "repository runs that for you. Until it is scheduled, the policy describes " +
    "behaviour the deployment does not have.",
  "Stripe Dashboard → Settings → Business → Public details: set a Terms of service URL. " +
    "Checkout's consent_collection requires it; without it every checkout fails.",
  "Complete one test-mode purchase and confirm the consent tickbox appears and is recorded on the session.",
  "Have a lawyer review both documents for the jurisdictions you actually sell into.",
  "Confirm whether you must register for VAT/GST anywhere you have crossed a threshold — " +
    "Stripe Tax calculates, but you remain the merchant of record.",
  "If you sell to Germany, check whether your pages satisfy the Impressum requirement.",
  "Confirm each processor's international transfer safeguards before relying on the privacy policy's wording.",
];

function main() {
  const unfilled = unfilledLegal();

  if (unfilled.length === 0) {
    console.log("PASS  every legal placeholder has been filled in.");
  } else {
    console.log(`${unfilled.length} legal placeholder(s) still unfilled:\n`);
    for (const item of unfilled) console.log(`  TODO  ${item}`);
    console.log("\nEdit src/lib/legal.ts. These appear verbatim on /terms and /privacy.");
  }

  console.log(`\nLast updated date on both documents: ${legal.lastUpdated}`);
  console.log("\nChecks no script can make for you:");
  for (const item of MANUAL_CHECKS) console.log(`  •  ${item}`);

  if (unfilled.length > 0 && strict) {
    console.error("\nFAIL  --strict: the legal pages are not ready to publish.");
    process.exit(1);
  }
  process.exit(0);
}

main();
