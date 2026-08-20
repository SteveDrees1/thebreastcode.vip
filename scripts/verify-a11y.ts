/**
 * Accessibility checks in a real browser.
 *
 * The contrast bug that shipped here — `--color-faint` at 3.77:1 against
 * `--color-surface-2`, below the 4.5:1 AA floor, on nine `text-sm` usages —
 * was found by hand, sampling colours out of the compiled CSS. Nothing would
 * have caught it on the next change. This is the check that would have.
 *
 *   npm run verify:a11y                       # against localhost:3000
 *   npm run verify:a11y -- http://host:3601   # against anything else
 *
 * Read-only: every visit is a GET and nothing is written or submitted. Safe
 * against a deployed environment, though it expects a seeded catalog.
 *
 * WHY A BROWSER, AND NOT JSDOM
 *
 * axe under jsdom is much cheaper to run and was the first thing tried. It
 * cannot check contrast, because contrast needs computed styles and a real
 * layout — jsdom applies no stylesheet, so `color-contrast` comes back
 * "incomplete" on every node. It would have reported a clean run on the exact
 * defect that motivated this file. A real engine is the whole point.
 *
 * WHAT THIS DOES NOT COVER
 *
 * Automated rules catch somewhere around a third of WCAG failures, and none of
 * the judgement calls: whether alt text is *accurate*, whether the focus order
 * is *sensible*, whether an error message is *understandable*. A green run
 * here is a floor, not a pass. It is also anonymous-only — `/library`,
 * `/account` and `/admin` need a session, so they are not visited at all.
 */
import "./load-env";
import { chromium, type Browser, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");

/*
 * WCAG 2.2 AA, which is what the EU Accessibility Act and the refreshed
 * Section 508 / EN 301 549 all point at. `best-practice` is deliberately
 * excluded: it holds opinions (a page "should" have one main landmark, region
 * rules) that are not conformance failures, and a gate that fails on opinions
 * gets switched off.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/*
 * Two viewports, because several rules only fail at one of them. Reflow
 * (1.4.10) and target size (2.5.8) are the obvious pair — a header that wraps
 * to two rows on a phone is a different DOM from the one on a laptop, and this
 * layout does exactly that.
 */
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

let violations = 0;
let runs = 0;
const incompleteSeen = new Map<string, number>();

/** Pull the first catalog and bundle links out of the rendered HTML. */
async function discoverDetailRoutes(): Promise<string[]> {
  const found: string[] = [];
  for (const [listing, pattern] of [
    ["/catalog", /href="(\/catalog\/[^"#?]+)"/],
    ["/bundles", /href="(\/bundles\/[^"#?]+)"/],
  ] as const) {
    const res = await fetch(`${base}${listing}`);
    const match = pattern.exec(await res.text());
    if (match) found.push(match[1]);
    else console.warn(`NOTE  no detail link found on ${listing}; skipping that page type`);
  }
  return found;
}

async function audit(page: Page, path: string, viewport: (typeof VIEWPORTS)[number]) {
  runs += 1;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  const res = await page.goto(`${base}${path}`, { waitUntil: "load" });
  const status = res?.status() ?? 0;
  // A 404 page is a legitimate target (it is audited on purpose below), but an
  // unexpected 500 would otherwise be audited as if it were the real page and
  // pass, because an error page is trivially accessible.
  if (status >= 500) {
    violations += 1;
    console.error(`FAIL  ${path} [${viewport.name}] returned ${status}; nothing was audited`);
    return;
  }

  /*
   * Let any redirect finish before axe touches the document.
   *
   * A session-gated page like /referrals answers 200 and then redirects on the
   * client — `redirect()` runs after the response has started streaming, so
   * Next cannot send a 307 and sends markup that navigates instead. Running
   * axe into that produced "Execution context was destroyed", which reads like
   * a broken tool rather than what it is: a page this run cannot reach.
   */
  await page.waitForLoadState("networkidle").catch(() => {});
  const landed = new URL(page.url()).pathname;
  if (landed !== path) {
    console.log(`NOTE  ${path} [${viewport.name}] redirected to ${landed}; not audited here`);
    return;
  }

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  for (const rule of results.incomplete) {
    incompleteSeen.set(rule.id, (incompleteSeen.get(rule.id) ?? 0) + rule.nodes.length);
  }

  if (results.violations.length === 0) {
    console.log(`PASS  ${path} [${viewport.name}]`);
    return;
  }

  for (const rule of results.violations) {
    violations += 1;
    console.error(
      `FAIL  ${path} [${viewport.name}] ${rule.id} (${rule.impact ?? "unknown impact"})` +
        `\n        ${rule.help}` +
        `\n        ${rule.helpUrl}`,
    );
    for (const node of rule.nodes.slice(0, 4)) {
      console.error(`        at ${node.target.join(" ")}`);
      // The failure summary names the measured value — the actual contrast
      // ratio, the missing attribute — which is what makes a report fixable
      // rather than just alarming.
      const summary = (node.failureSummary ?? "").split("\n").filter(Boolean).slice(1);
      for (const line of summary) console.error(`          ${line.trim()}`);
    }
    if (rule.nodes.length > 4) {
      console.error(`        …and ${rule.nodes.length - 4} more node(s)`);
    }
  }
}

async function main() {
  console.log(`Auditing ${base} against ${TAGS.join(", ")}\n`);

  const routes = [
    "/",
    "/catalog",
    "/bundles",
    "/pricing",
    "/referrals",
    "/redeem",
    "/signin",
    "/terms",
    "/privacy",
    ...(await discoverDetailRoutes()),
    // The 404 is a real page with real content here, not a framework default.
    "/this-route-does-not-exist",
  ];

  /*
   * Normally Playwright resolves the Chromium it downloaded for its own
   * version. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides that, for the case
   * where a build image bakes a browser in and forbids the download — the
   * binary is then whatever the image has, which may not match Playwright's
   * pinned build. Left unset, nothing changes.
   */
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath });
  } catch (error) {
    console.error(
      "Could not launch Chromium. Install it with `npx playwright install --with-deps chromium`,\n" +
        "or point PLAYWRIGHT_CHROMIUM_EXECUTABLE at an existing binary.",
    );
    throw error;
  }

  // One context for the whole run: no cookies are ever set, so every visit is
  // anonymous by construction rather than by convention.
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    for (const path of routes) {
      for (const viewport of VIEWPORTS) {
        await audit(page, path, viewport);
      }
    }
  } finally {
    await browser.close();
  }

  if (incompleteSeen.size > 0) {
    // "Incomplete" is axe declining to decide — a background image behind
    // text, an element it could not resolve. Reported, never failed on:
    // these need a human to look, and failing on them would make the gate
    // unactionable.
    console.log("\nNeeds a human to confirm (axe could not decide):");
    for (const [id, nodes] of [...incompleteSeen].sort()) {
      console.log(`  ${id} — ${nodes} node(s)`);
    }
  }

  console.log(`\n${runs} page audits, ${violations} rule violation(s).`);
  process.exit(violations > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
