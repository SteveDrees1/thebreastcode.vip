/**
 * Generate a catalog cover from page one of a PDF, upload it, and point the
 * product row at it.
 *
 *   npm run make:cover -- --slug joinery-reference --pdf ./Joinery.pdf
 *   npm run make:cover -- --slug joinery-reference --pdf ./Joinery.pdf --out ./preview.webp --dry-run
 *
 * The plate sets already open with a designed cover, so the most honest
 * thumbnail is the page itself: what the customer sees in the catalog is
 * exactly what they get in the download.
 *
 * This file is ESM (.mts) on purpose. pdfjs-dist ships ESM only, and tsx
 * compiles plain .ts as CommonJS, which turns the import into a require() and
 * fails with ERR_REQUIRE_ASYNC_MODULE. Keeping the renderer self-contained here
 * avoids flipping the whole project to "type": "module" for one script.
 */
import "./load-env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { db } from "../src/db/index.js";
import { products } from "../src/db/schema.js";
import { writeAudit } from "../src/lib/audit.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Terminal runs have no session, so credit the shell user unless told otherwise. */
function cliActor(): string {
  const explicit = arg("actor");
  if (explicit) return explicit;
  try {
    return `cli:${userInfo().username}`;
  } catch {
    return "cli:unknown";
  }
}


/** Rasterise one page to WebP at the requested width. */
async function renderCover(pdf: Buffer, width: number, quality: number, pageNumber: number) {
  // Keep the loading task: it owns the worker, and destroying the document
  // alone would leave the process hanging.
  const loadingTask = pdfjs.getDocument({
    // pdf.js takes ownership of the buffer it is given, so hand it a copy.
    data: new Uint8Array(pdf),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  if (pageNumber > doc.numPages) {
    throw new Error(`PDF has ${doc.numPages} page(s); cannot render page ${pageNumber}.`);
  }

  const page = await doc.getPage(pageNumber);

  // Render at the scale that lands on the target width, so text is drawn sharp
  // rather than upscaled afterwards.
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const webp = await sharp(canvas.toBuffer("image/png")).webp({ quality }).toBuffer();
  await loadingTask.destroy();

  return { webp, width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) };
}

async function main() {
  const pdfPath = arg("pdf");
  const slug = arg("slug");

  if (!pdfPath) {
    console.error(
      "Usage: npm run make:cover -- --pdf <path> [--slug <product-slug>]\n" +
        "  [--local]          save to public/covers/ and serve from the app\n" +
        "                     (no object storage needed)\n" +
        "  [--out <file>]     also write the image to a path you choose\n" +
        "  [--dry-run]        render only: no upload, no database write\n" +
        "  [--page N]         page to render (default 1)\n" +
        "  [--width N]        pixels wide (default 800)\n" +
        "  [--quality N]      WebP quality (default 82)",
    );
    process.exit(1);
  }

  const pdf = await readFile(path.resolve(pdfPath));
  const started = Date.now();
  const cover = await renderCover(
    pdf,
    Number(arg("width") ?? 800),
    Number(arg("quality") ?? 82),
    Number(arg("page") ?? 1),
  );

  console.log(
    `rendered ${cover.width}x${cover.height}, ` +
      `${(cover.webp.length / 1024).toFixed(0)} KB, ${Date.now() - started} ms`,
  );

  const out = arg("out");
  if (out) {
    await writeFile(path.resolve(out), cover.webp);
    console.log(`wrote ${out}`);
  }

  if (flag("dry-run")) {
    console.log("dry-run: nothing uploaded, database untouched");
    process.exit(0);
  }

  if (!slug) {
    console.error("--slug is required unless --dry-run is set.");
    process.exit(1);
  }

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);

  if (!product) {
    console.error(`No product with slug "${slug}". Import the PDF first.`);
    process.exit(1);
  }

  // Covers are public by design — they are the shop window — so unlike the
  // PDFs they never touch the private bucket.
  //
  // --local writes them into public/ and serves them from the app itself.
  // For a catalog of this size that is a perfectly good production answer:
  // the images are versioned with the code, cost nothing to serve, and remove
  // the need for a public bucket entirely. Object storage only starts to pay
  // off once covers change more often than the site deploys.
  if (flag("local")) {
    const file = path.join(process.cwd(), "public", "covers", `${slug}.webp`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, cover.webp);

    const url = `/covers/${slug}.webp`;
    await db
      .update(products)
      .set({ coverImageUrl: url, updatedAt: new Date() })
      .where(eq(products.id, product.id));

    await writeAudit({
      actorEmail: cliActor(),
      action: "product.cover",
      entityType: "product",
      entityId: product.id,
      summary: `Set a local cover for “${slug}”`,
      changes: { coverImageUrl: { from: null, to: url } },
    });

    console.log(`wrote public/covers/${slug}.webp`);
    console.log(`set coverImageUrl for "${slug}" to ${url}`);
    console.log("commit the file so it deploys with the site");
    process.exit(0);
  }

  const publicBase = process.env.S3_PUBLIC_BASE_URL;
  if (!publicBase) {
    console.error(
      "S3_PUBLIC_BASE_URL is not set. Either pass --local to serve covers from\n" +
        "public/, or point it at the public bucket (or its CDN\n" +
        "domain) that serves cover images, or re-run with --dry-run --out to preview.",
    );
    process.exit(1);
  }

  const key = `covers/${slug}.webp`;
  const bucket = process.env.S3_PUBLIC_BUCKET ?? process.env.S3_BUCKET;

  const s3 = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: cover.webp,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const url = `${publicBase.replace(/\/$/, "")}/${key}`;
  await db
    .update(products)
    .set({ coverImageUrl: url, updatedAt: new Date() })
    .where(eq(products.id, product.id));

  await writeAudit({
    actorEmail: cliActor(),
    action: "product.cover",
    entityType: "product",
    entityId: product.id,
    summary: `Uploaded a cover for “${slug}”`,
    changes: { coverImageUrl: { from: null, to: url } },
  });

  console.log(`uploaded ${key}\nset coverImageUrl for "${slug}" to ${url}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
