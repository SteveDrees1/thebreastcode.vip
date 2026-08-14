/**
 * Register a PDF as a sellable product.
 *
 * Two ways in:
 *
 * 1. **From a manifest** — for generators that describe their own output (see
 *    the workshop-guide repo). The listing is then derived from the same
 *    constants as the document and cannot drift from it.
 *
 *      npm run import:product -- \
 *        --manifest ../workshop-guide/output/workshop_organizer_guide.manifest.json \
 *        --pdf      ../workshop-guide/output/workshop_organizer_guide.pdf \
 *        --price 2400 --publish
 *
 * 2. **From the PDF alone** — for finished PDFs that carry no metadata worth
 *    trusting, which is most of them. Page count, size and checksum are read
 *    from the file; the words a customer reads are supplied on the command line
 *    rather than scraped out of page one, because cover layouts vary and a
 *    wrong guess would be published to the storefront.
 *
 *      npm run import:product -- \
 *        --pdf ./Joinery.pdf \
 *        --slug joinery-reference --title "Joinery Reference" \
 *        --subtitle "Woodworking · Plate Set 01" \
 *        --price 1900 --publish
 *
 * Re-running is safe and is the intended way to ship a revision. Deliberately,
 * a re-import never overwrites `priceCents` or demotes `status`: those are
 * commercial decisions owned by whoever runs the store, not by the build.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { db } from "../src/db";
import { products } from "../src/db/schema";
import { env } from "../src/lib/env";

const manifestSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().default(""),
  docId: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  fileName: z.string().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  sha256: z.string().length(64).optional(),
  assetVersion: z.union([z.number(), z.string()]).optional(),
});

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

type Manifest = z.infer<typeof manifestSchema>;

/** Turn a filename or title into a URL-safe slug. */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[‘’“”]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "");
}

/**
 * Build a manifest for a PDF that did not come with one.
 *
 * Only facts that can be read reliably from the file are derived. Titles and
 * descriptions come from flags: extracting them from page one means guessing at
 * a cover layout, and a bad guess here is published to the storefront.
 */
async function manifestFromPdf(pdf: Buffer, pdfPath: string): Promise<Manifest> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });

  const filename = path.basename(pdfPath, path.extname(pdfPath));
  const embedded = doc.getTitle()?.trim();
  const title = arg("title") ?? embedded ?? filename;
  const slug = arg("slug") ?? slugify(title);

  if (!arg("title") && !embedded) {
    console.warn(
      `warning: no --title given and the PDF has no title metadata; ` +
        `falling back to the filename ("${filename}").`,
    );
  }

  return manifestSchema.parse({
    slug,
    title,
    subtitle: arg("subtitle"),
    description: arg("description") ?? "",
    docId: arg("doc-id"),
    pageCount: doc.getPageCount(),
    fileName: path.basename(pdfPath),
    fileSizeBytes: pdf.length,
    assetVersion: arg("version") ?? 1,
  });
}

async function main() {
  const manifestPath = arg("manifest");
  const pdfPath = arg("pdf");

  if (!pdfPath) {
    console.error(
      "Usage: npm run import:product -- --pdf <path> [--manifest <path>]\n" +
        "  With no --manifest, describe the product directly:\n" +
        "    --slug --title --subtitle --description --doc-id --version\n" +
        "  Common: --price <cents> --publish --no-subscription --skip-upload\n" +
        "          --cover-url <public image url>",
    );
    process.exit(1);
  }

  const pdf = await readFile(path.resolve(pdfPath));

  const manifest = manifestPath
    ? manifestSchema.parse(
        JSON.parse(await readFile(path.resolve(manifestPath), "utf8")),
      )
    : await manifestFromPdf(pdf, pdfPath);

  // Trust the file on disk over the manifest: if they disagree, the manifest is
  // stale and importing it would record a checksum that matches nothing.
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  if (manifest.sha256 && manifest.sha256 !== sha256) {
    console.error(
      `Checksum mismatch: the PDF does not match its manifest.\n` +
        `  manifest: ${manifest.sha256}\n  file:     ${sha256}\n` +
        `Rebuild the PDF so both are regenerated together.`,
    );
    process.exit(1);
  }

  const version = manifest.assetVersion ?? 1;
  const fileKey = `pdfs/${manifest.slug}-v${version}.pdf`;

  const [existing] = await db
    .select({
      id: products.id,
      sourceSha256: products.sourceSha256,
      status: products.status,
      priceCents: products.priceCents,
    })
    .from(products)
    .where(eq(products.slug, manifest.slug))
    .limit(1);

  const priceArg = arg("price");
  if (!existing && priceArg === undefined) {
    console.error("New product: --price <cents> is required the first time.");
    process.exit(1);
  }

  // --- upload -------------------------------------------------------------
  if (flag("skip-upload")) {
    console.log(`skip-upload: assuming ${fileKey} is already in the bucket`);
  } else if (existing?.sourceSha256 === sha256) {
    console.log(`unchanged (${sha256.slice(0, 12)}…) — no upload needed`);
  } else {
    const s3 = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
    });
    await s3.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: fileKey,
        Body: pdf,
        ContentType: "application/pdf",
      }),
    );
    console.log(`uploaded ${fileKey} (${(pdf.length / 1_048_576).toFixed(1)} MB)`);
  }

  // --- upsert -------------------------------------------------------------
  const coverUrl = arg("cover-url");
  const shared = {
    title: manifest.title,
    subtitle: manifest.subtitle ?? null,
    description: manifest.description,
    fileKey,
    fileSizeBytes: pdf.length,
    pageCount: manifest.pageCount ?? null,
    sourceSha256: sha256,
    sourceDocId: manifest.docId ?? null,
    includedInSubscription: !flag("no-subscription"),
    // Only set when passed, so a re-import never wipes an existing cover.
    ...(coverUrl ? { coverImageUrl: coverUrl } : {}),
    updatedAt: new Date(),
  };

  if (existing) {
    // Promote to published when asked, but never demote a live product.
    const status =
      flag("publish") && existing.status !== "published"
        ? ("published" as const)
        : existing.status;

    await db
      .update(products)
      .set({
        ...shared,
        status,
        ...(status === "published" && existing.status !== "published"
          ? { publishedAt: new Date() }
          : {}),
        // Price is intentionally left alone on re-import.
      })
      .where(eq(products.id, existing.id));

    console.log(`updated "${manifest.title}" (${manifest.slug}) — status ${status}`);
    if (priceArg !== undefined && Number(priceArg) !== existing.priceCents) {
      console.log(
        `note: --price ignored for an existing product (still ` +
          `${existing.priceCents}). Change it in the database or an admin tool.`,
      );
    }
  } else {
    const publish = flag("publish");
    await db.insert(products).values({
      ...shared,
      slug: manifest.slug,
      priceCents: Number(priceArg),
      status: publish ? "published" : "draft",
      publishedAt: publish ? new Date() : null,
    });
    console.log(
      `created "${manifest.title}" (${manifest.slug}) — ` +
        `${publish ? "published" : "draft"}, ${priceArg} cents`,
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
