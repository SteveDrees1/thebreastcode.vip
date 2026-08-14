/**
 * Register a generated PDF as a sellable product.
 *
 * Reads the manifest emitted by the generator (see the workshop-guide repo),
 * uploads the PDF to the private bucket, and upserts the matching `products`
 * row so the catalog listing is derived from the same constants as the document.
 *
 *   npm run import:product -- \
 *     --manifest ../workshop-guide/output/workshop_organizer_guide.manifest.json \
 *     --pdf      ../workshop-guide/output/workshop_organizer_guide.pdf \
 *     --price    2400 \
 *     --publish
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

async function main() {
  const manifestPath = arg("manifest");
  const pdfPath = arg("pdf");

  if (!manifestPath || !pdfPath) {
    console.error(
      "Usage: npm run import:product -- --manifest <path> --pdf <path> " +
        "[--price <cents>] [--publish] [--no-subscription] [--skip-upload]",
    );
    process.exit(1);
  }

  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.resolve(manifestPath), "utf8")),
  );
  const pdf = await readFile(path.resolve(pdfPath));

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
