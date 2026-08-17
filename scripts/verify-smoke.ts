/**
 * Runtime checks against a server that is actually serving.
 *
 * CI builds the app and never runs it, so a whole class of regression — a
 * route that 500s, middleware that stopped protecting /admin, a header that
 * silently vanished — would ship green. `npm run build` proves the code
 * compiles, not that it works.
 *
 * These are the assertions that were being made by hand after every change.
 * Written down, they run the same way every time and in CI.
 *
 *   npm run verify:smoke                       # against localhost:3000
 *   npm run verify:smoke -- http://host:3601   # against anything else
 *
 * Read-only: every request is a GET and nothing is written. Safe against a
 * deployed environment, though it expects a seeded catalog.
 */
import "./load-env";

const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");

let failures = 0;
let checks = 0;

function ok(name: string) {
  checks += 1;
  console.log(`PASS  ${name}`);
}

function fail(name: string, detail: string) {
  checks += 1;
  failures += 1;
  console.error(`FAIL  ${name}\n        ${detail}`);
}

function expect(name: string, condition: boolean, detail: string) {
  if (condition) ok(name);
  else fail(name, detail);
}

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  return { res, body: await res.text() };
}

async function status(name: string, path: string, want: number) {
  const { res } = await get(path);
  expect(name, res.status === want, `${path} returned ${res.status}, wanted ${want}`);
}

async function main() {
  console.log(`Smoke-testing ${base}\n`);

  // --- Routes answer at all -------------------------------------------------
  for (const path of ["/", "/catalog", "/bundles", "/pricing", "/terms", "/privacy", "/signin"]) {
    await status(`${path} serves`, path, 200);
  }
  await status("sitemap.xml serves", "/sitemap.xml", 200);
  await status("robots.txt serves", "/robots.txt", 200);
  // Not asserted as 200. A partially configured environment — CI, or a preview
  // deploy without Stripe keys — is *correctly* 503 "degraded", and demanding
  // 200 here would make the smoke test a configuration check rather than a
  // liveness check. What matters is that the endpoint answers with a verdict
  // it defines. (This assertion originally said 200 and failed in CI for
  // exactly that reason.)
  {
    const { res, body } = await get("/api/health");
    expect(
      "health answers with a known verdict",
      [200, 503].includes(res.status),
      `/api/health returned ${res.status}; expected 200 (ok) or 503 (degraded)`,
    );
    let parsed: { status?: string } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* handled by the assertion below */
    }
    expect(
      "health reports ok or degraded",
      parsed.status === "ok" || parsed.status === "degraded",
      `body was not a recognised verdict: ${body.slice(0, 120)}`,
    );
    expect(
      "the health status matches the status code",
      (res.status === 200) === (parsed.status === "ok"),
      `status code ${res.status} disagrees with body status "${parsed.status}"`,
    );
  }

  // --- The 404 path actually 404s ------------------------------------------
  // Next will happily serve a custom not-found with a 200 if a route opts into
  // the wrong rendering mode, which makes soft-404s a real risk.
  await status("unknown path is a real 404", "/no-such-page-here", 404);

  // --- Middleware still protects the console -------------------------------
  // An anonymous caller must not be able to tell /admin apart from nonsense.
  await status("/admin is 404 for anonymous callers", "/admin", 404);
  await status("/admin/products is 404 for anonymous callers", "/admin/products", 404);

  // --- Security headers ----------------------------------------------------
  {
    const { res } = await get("/");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect("CSP is present", csp.length > 0, "no content-security-policy header");
    expect(
      "CSP carries a per-request nonce",
      /'nonce-[A-Za-z0-9+/=]+'/.test(csp),
      `no nonce in: ${csp.slice(0, 120)}`,
    );
    expect(
      "framing is denied",
      res.headers.get("x-frame-options") === "DENY",
      `x-frame-options: ${res.headers.get("x-frame-options")}`,
    );
    expect(
      "MIME sniffing is off",
      res.headers.get("x-content-type-options") === "nosniff",
      `x-content-type-options: ${res.headers.get("x-content-type-options")}`,
    );
    expect(
      "cross-origin resource policy is set",
      res.headers.get("cross-origin-resource-policy") === "same-origin",
      `cross-origin-resource-policy: ${res.headers.get("cross-origin-resource-policy")}`,
    );
    expect(
      "cross-origin opener policy is set",
      res.headers.get("cross-origin-opener-policy") === "same-origin",
      `cross-origin-opener-policy: ${res.headers.get("cross-origin-opener-policy")}`,
    );
    expect(
      "HSTS is long-lived and covers subdomains",
      /max-age=(\d+)/.test(res.headers.get("strict-transport-security") ?? "") &&
        Number(/max-age=(\d+)/.exec(res.headers.get("strict-transport-security") ?? "")?.[1]) >=
          31536000,
      `strict-transport-security: ${res.headers.get("strict-transport-security")}`,
    );
    expect(
      "Topics API is opted out of, not just the dead FLoC directive",
      (res.headers.get("permissions-policy") ?? "").includes("browsing-topics=()"),
      `permissions-policy: ${res.headers.get("permissions-policy")}`,
    );
    expect(
      "no CORS header invites a cross-origin reader",
      res.headers.get("access-control-allow-origin") === null,
      `access-control-allow-origin: ${res.headers.get("access-control-allow-origin")}`,
    );

    const second = await get("/");
    const nonceOf = (v: string) => /'nonce-([A-Za-z0-9+/=]+)'/.exec(v)?.[1];
    expect(
      "the nonce differs between requests",
      nonceOf(csp) !== nonceOf(second.res.headers.get("content-security-policy") ?? ""),
      "the same nonce was served twice — it is not per-request",
    );
  }

  // --- The image optimizer is not an open proxy ----------------------------
  // This shipped as a live proxy once. 400 means rejected before any fetch.
  for (const host of ["attacker-bucket.s3.amazonaws.com", "anything.r2.dev"]) {
    const { res } = await get(
      `/_next/image?url=${encodeURIComponent(`https://${host}/x.png`)}&w=640&q=75`,
    );
    expect(
      `image optimizer rejects ${host}`,
      res.status === 400,
      `got ${res.status}; anything but 400 means the server fetched it`,
    );
  }

  // --- Nothing private reaches the HTML ------------------------------------
  {
    const { body } = await get("/catalog");
    for (const marker of ["fileKey", "file_key", "sourceSha256", "stripePriceId"]) {
      expect(
        `/catalog does not leak ${marker}`,
        !body.includes(marker),
        `found "${marker}" in the catalog HTML`,
      );
    }
  }

  // --- SEO essentials on a product page ------------------------------------
  {
    const { body } = await get("/catalog");
    const slug = /href="\/catalog\/([a-z0-9-]+)"/.exec(body)?.[1];
    if (!slug) {
      fail("a product page is reachable from /catalog", "no product links found — seeded?");
    } else {
      const { res, body: page } = await get(`/catalog/${slug}`);
      expect(`/catalog/${slug} serves`, res.status === 200, `returned ${res.status}`);
      expect(
        "product page has one meta description",
        (page.match(/<meta name="description"/g) ?? []).length === 1,
        "expected exactly one description meta tag",
      );
      expect(
        "product page has one canonical",
        (page.match(/<link rel="canonical"/g) ?? []).length === 1,
        "expected exactly one canonical link",
      );
      expect(
        "product page has exactly one h1",
        (page.match(/<h1[\s>]/g) ?? []).length === 1,
        "expected exactly one h1",
      );
      expect(
        "product page emits Product structured data",
        page.includes('"@type":"Product"') || page.includes('\\"@type\\":\\"Product\\"'),
        "no Product JSON-LD found",
      );
    }
  }

  // --- The sitemap matches what the catalog shows --------------------------
  // These drifted apart once: six products listed, three in the sitemap.
  {
    const { body: catalog } = await get("/catalog");
    const { body: sitemap } = await get("/sitemap.xml");
    const listed = new Set([...catalog.matchAll(/href="\/catalog\/([a-z0-9-]+)"/g)].map((m) => m[1]));
    const mapped = new Set([...sitemap.matchAll(/\/catalog\/([a-z0-9-]+)</g)].map((m) => m[1]));
    const missing = [...listed].filter((s) => !mapped.has(s));
    expect(
      "every listed product is in the sitemap",
      missing.length === 0,
      `missing from sitemap: ${missing.join(", ")}`,
    );
  }

  // --- The legal documents are reachable and complete -----------------------
  // Terms a customer cannot find are terms that were never presented, so the
  // footer link matters as much as the page existing.
  {
    const { body: home } = await get("/");
    for (const path of ["/terms", "/privacy"]) {
      expect(
        `${path} is linked from the site footer`,
        home.includes(`href="${path}"`),
        `no link to ${path} in the homepage HTML`,
      );
    }

    const { body: terms } = await get("/terms");
    expect(
      "terms state the cancellation waiver",
      terms.includes("lose your right to cancel"),
      "the waiver wording is missing — it is the pair to the checkout consent box",
    );

    const { body: privacy } = await get("/privacy");
    expect(
      "privacy policy describes the hashed-IP download log",
      privacy.includes("salted SHA-256 hash"),
      "the policy no longer matches what the code stores",
    );

    for (const [path, body] of [["/terms", terms], ["/privacy", privacy]] as const) {
      // The marker should never reach a rendered page; legalValue() turns an
      // unfilled placeholder into readable text instead.
      expect(
        `${path} leaks no raw TODO_LEGAL marker`,
        !body.includes("TODO_LEGAL"),
        `raw placeholder marker rendered on ${path}`,
      );
    }
  }

  // --- Performance budget ---------------------------------------------------
  /*
   * Budgets, not aspirations. Each ceiling is roughly double what was measured
   * when this was written, so ordinary growth passes and a regression that
   * doubles a payload does not. Measured then: ~10KB gzipped HTML, ~180KB of
   * JS, TTFB in the 15-25ms range locally.
   *
   * Deliberately generous. A budget tight enough to fail on noise is a budget
   * somebody disables.
   */
  {
    /*
     * Compress locally rather than trusting the transfer size.
     *
     * Node's fetch decompresses transparently, so `arrayBuffer().byteLength`
     * is the *decompressed* size — measuring that against a compressed budget
     * is how this check first failed, on numbers that were fine. Gzipping the
     * body here measures the same thing a CDN would send, and does not depend
     * on whether the origin happened to compress this particular response.
     */
    const { gzipSync } = await import("node:zlib");
    const gz = async (path: string) => {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      const raw = Buffer.from(await res.arrayBuffer());
      return { res, bytes: gzipSync(raw).byteLength, raw: raw.byteLength };
    };

    for (const path of ["/", "/catalog"]) {
      const { res, bytes, raw } = await gz(path);
      expect(
        `${path} is served compressed`,
        (res.headers.get("content-encoding") ?? "").includes("gzip"),
        `content-encoding: ${res.headers.get("content-encoding")} — uncompressed HTML is the cheapest win there is`,
      );
      expect(
        `${path} HTML stays under 25KB gzipped`,
        bytes < 25_000,
        `${path} was ${bytes} bytes gzipped (${raw} raw)`,
      );
    }

    // Every script the document pulls in, which is what actually blocks
    // interaction. React and Next are most of it; the ceiling leaves room to
    // grow without leaving room to ship a charting library by accident.
    const { body: home } = await get("/");
    const scripts = [...new Set(home.match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? [])];
    let js = 0;
    for (const src of scripts) js += (await gz(src)).bytes;
    expect(
      "first-load JS stays under 350KB compressed",
      js < 350_000,
      `${scripts.length} chunks totalling ${js} bytes gzipped`,
    );

    // Hashed filenames can be cached forever; not doing so makes every repeat
    // visit pay for bytes that cannot have changed.
    if (scripts[0]) {
      const { res } = await gz(scripts[0]);
      const cc = res.headers.get("cache-control") ?? "";
      expect(
        "hashed static assets are immutable",
        cc.includes("immutable") && cc.includes("max-age=31536000"),
        `cache-control on a hashed chunk: ${cc}`,
      );
    }

    // The checkout redirect is the one third-party navigation in the app.
    expect(
      "the connection to Stripe Checkout is warmed",
      home.includes('rel="preconnect"') && home.includes("checkout.stripe.com"),
      "no preconnect to checkout.stripe.com — the buyer pays DNS+TLS at the moment they decide to pay",
    );
  }

  // --- Health endpoint discloses nothing to a stranger ----------------------
  {
    const { res, body } = await get("/api/health");
    expect(
      "health is never cached",
      (res.headers.get("cache-control") ?? "").includes("no-store"),
      `cache-control: ${res.headers.get("cache-control")}`,
    );
    expect(
      "health tells an anonymous caller only status and time",
      !body.includes("checks") && !body.includes("missing"),
      `body disclosed more than a verdict: ${body.slice(0, 120)}`,
    );
  }

  console.log(`\n${checks} checks, ${failures} failed.`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Smoke run could not complete:", error);
  process.exit(1);
});
