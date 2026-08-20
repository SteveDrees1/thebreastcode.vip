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
 * Read-only by default: every visit is a GET and nothing is written or
 * submitted. Safe against a deployed environment, though it expects a seeded
 * catalog.
 *
 *   npm run verify:a11y -- --with-session
 *
 * adds a second pass over the pages that need an account — the customer's
 * library and the whole `/admin` console, which is the richest surface in the
 * app and the one nothing was auditing. That pass **writes**: it inserts a
 * scratch admin user and a session row, and deletes both afterwards. Point it
 * at a disposable database only, on the same terms as verify:entitlements.
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
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { sessions, users } from "../src/db/schema";

const args = process.argv.slice(2);
const withSession = args.includes("--with-session");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

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
/** `${path} [${viewport}]` for every page axe actually judged. */
const audited = new Set<string>();
const incompleteSeen = new Map<string, number>();

/*
 * Pages that must be audited for the run to mean anything.
 *
 * Without this the script's failure mode is silence: an empty route list, a
 * server that redirects everything to a login, a discovery regex that stops
 * matching — each of those prints "0 page audits, 0 rule violations" and exits
 * 0. That is the same shape as a clean run, and it is exactly what
 * verify-exposure.ts guards against with its control assertion.
 *
 * /referrals and /redeem are deliberately absent: they need a session, so a
 * redirect is the correct outcome and demanding an audit would fail honestly
 * configured runs. They stay in the visit list so that a regression making
 * them publicly reachable shows up as an unexpected audit rather than nothing.
 */
const MUST_BE_AUDITED = [
  "/",
  "/catalog",
  "/bundles",
  "/pricing",
  "/signin",
  "/terms",
  "/privacy",
  "/this-route-does-not-exist",
];

/*
 * Pages that only exist for someone signed in, audited under --with-session.
 *
 * The console is the largest surface in the app and the one with the most
 * forms, selects and tables — where accessibility defects actually live — and
 * nothing was looking at it, because an anonymous crawl is answered with a 404
 * by design. Staff-facing is not exempt: EN 301 549 and Section 508 cover the
 * tools employees use, not only what customers see.
 */
const SIGNED_IN_ROUTES = [
  "/library",
  "/account",
  "/referrals",
  "/redeem",
  "/admin",
  "/admin/products",
  "/admin/bundles",
  "/admin/promos",
  "/admin/customers",
  "/admin/activity",
];

/**
 * Create a scratch admin and a session row for it, and return the token.
 *
 * A session is inserted directly rather than driven through the magic-link
 * flow: that flow needs an SMTP server, and the point here is to audit the
 * pages behind the door, not the door.
 */
async function openSession(): Promise<{ token: string; userId: string }> {
  const token = randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      email: `a11y-${randomUUID()}@verify.invalid`,
      name: "Accessibility audit",
      emailVerified: new Date(),
      isAdmin: true,
    })
    .returning({ id: users.id });

  await db.insert(sessions).values({
    sessionToken: token,
    userId: user.id,
    expires: new Date(Date.now() + 60 * 60 * 1000),
  });

  return { token, userId: user.id };
}

/** Remove both rows. The session cascades from the user; deleted explicitly anyway. */
async function closeSession(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Auth.js names the cookie by transport, and `src/middleware.ts` looks for
 * both. Getting this wrong sends no cookie at all and every page looks
 * anonymous — which reads exactly like a broken sign-in, and is the same trap
 * SECURITY.md records from the manual auth run.
 */
function sessionCookieName(url: string): string {
  return url.startsWith("https://")
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

/** First product and bundle edit form reachable from the console listings. */
async function discoverAdminEditRoutes(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const [listing, pattern] of [
    ["/admin/products", /\/admin\/products\/([a-z0-9-]+)/i],
    ["/admin/bundles", /\/admin\/bundles\/([a-z0-9-]+)/i],
  ] as const) {
    await page.goto(`${base}${listing}`, { waitUntil: "load" });
    const id = pattern.exec(await page.content())?.[1];
    if (id) found.push(`${listing}/${id}`);
    else console.warn(`NOTE  no edit link found on ${listing}; skipping that form`);
  }
  return found;
}

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
  audited.add(`${path} [${viewport.name}]`);

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

  // A fresh context for the anonymous pass: no cookie is ever set in it, so
  // every visit is anonymous by construction rather than by convention.
  const context = await browser.newContext();
  const page = await context.newPage();

  let scratchUserId: string | undefined;
  try {
    for (const path of routes) {
      for (const viewport of VIEWPORTS) {
        await audit(page, path, viewport);
      }
    }

    if (withSession) {
      console.log("\n--- signed in --------------------------------------------");
      const { token, userId } = await openSession();
      scratchUserId = userId;

      // A second context, so the anonymous pass above cannot be contaminated
      // by a cookie set afterwards.
      const signedIn = await browser.newContext();
      await signedIn.addCookies([
        { name: sessionCookieName(base), value: token, url: base },
      ]);
      const signedInPage = await signedIn.newPage();

      const signedInRoutes = [
        ...SIGNED_IN_ROUTES,
        // The edit forms are the densest controls in the app — selects,
        // textareas, checkboxes, destructive buttons — so audit one of each
        // rather than only their listings.
        ...(await discoverAdminEditRoutes(signedInPage)),
      ];

      for (const path of signedInRoutes) {
        for (const viewport of VIEWPORTS) {
          await audit(signedInPage, path, viewport);
        }
      }

      // Every signed-in route must actually be audited. A session that failed
      // to take would redirect each one to /signin, and the run would report
      // nothing but NOTEs — clean, and worthless.
      for (const path of signedInRoutes) {
        for (const v of VIEWPORTS) {
          const key = `${path} [${v.name}]`;
          if (!audited.has(key)) {
            violations += 1;
            console.error(`FAIL  ${key} was never audited; is the session cookie taking?`);
          }
        }
      }

      await signedIn.close();
    }
  } finally {
    await browser.close();
    if (scratchUserId) await closeSession(scratchUserId);
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

  // Nothing above this line can distinguish "clean" from "never ran".
  const missing = MUST_BE_AUDITED.flatMap((path) =>
    VIEWPORTS.map((v) => `${path} [${v.name}]`).filter((key) => !audited.has(key)),
  );
  for (const key of missing) {
    violations += 1;
    console.error(`FAIL  ${key} was never audited; the run cannot be called clean`);
  }

  console.log(
    `\n${runs} page visits, ${audited.size} audited, ${violations} rule violation(s).`,
  );
  process.exit(violations > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
