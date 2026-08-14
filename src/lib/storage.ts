/**
 * Private object storage for the sellable PDFs.
 *
 * The bucket must NOT be public. The only way a byte reaches a customer is a
 * presigned URL minted here, and the only caller allowed to mint one is the
 * download route, after an entitlement check. Keys never reach the client.
 */
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let cached: S3Client | undefined;

function client(): S3Client {
  if (cached) return cached;
  const { endpoint, region, accessKeyId, secretAccessKey } = env.s3;
  cached = new S3Client({
    region,
    endpoint,
    // Required by R2 and most S3-compatible providers.
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
}

/**
 * Mint a short-lived download URL.
 *
 * `filename` sets Content-Disposition so the browser saves a human-readable
 * name instead of the opaque storage key.
 */
export async function createDownloadUrl(fileKey: string, filename: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.s3.bucket,
    Key: fileKey,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
  });

  return getSignedUrl(client(), command, { expiresIn: env.downloadTtlSeconds });
}

/** Confirm an object exists and report its size — used by the admin importer. */
export async function statObject(
  fileKey: string,
): Promise<{ exists: boolean; sizeBytes?: number }> {
  try {
    const res = await client().send(
      new HeadObjectCommand({ Bucket: env.s3.bucket, Key: fileKey }),
    );
    return { exists: true, sizeBytes: res.ContentLength };
  } catch {
    return { exists: false };
  }
}

/** Strip anything that would break or escape the Content-Disposition header. */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  const base = cleaned.length > 0 ? cleaned : "download";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}
