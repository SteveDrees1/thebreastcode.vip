/**
 * The download path — the only route by which a paid byte reaches a customer.
 *
 * README has long carried "the S3 upload path is the one thing never exercised
 * end to end". That is true of PutObject, which needs real credentials and a
 * real bucket. Presigning does not: an S3 signature is an HMAC computed
 * locally over a canonical request, so the URL this mints can be asserted in
 * full with fake credentials and no network. Everything below therefore tests
 * the real `createDownloadUrl`, not a mock of it.
 *
 * What is still not covered: whether the object exists in the bucket, and
 * whether the provider accepts the signature. Those need credentials.
 */
import { describe, expect, it } from "vitest";
import { createDownloadUrl } from "@/lib/storage";

/** Query parameters of a presigned URL, which is where the signature lives. */
async function sign(fileKey: string, filename: string) {
  const url = new URL(await createDownloadUrl(fileKey, filename));
  return { url, params: url.searchParams };
}

describe("createDownloadUrl", () => {
  it("signs a URL pointing at the configured bucket and key", async () => {
    const { url, params } = await sign("pdfs/guide-01.pdf", "Guide.pdf");

    expect(url.hostname).toBe("accountid.r2.cloudflarestorage.com");
    // forcePathStyle is on, so the bucket is a path segment rather than a
    // subdomain — R2 and most S3-compatible providers require this.
    expect(url.pathname).toBe("/test-bucket/pdfs/guide-01.pdf");
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(params.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("expires in the configured TTL, so a leaked link dies quickly", async () => {
    const { params } = await sign("pdfs/guide-01.pdf", "Guide.pdf");
    // DOWNLOAD_URL_TTL_SECONDS is 300 in the test env.
    expect(params.get("X-Amz-Expires")).toBe("300");
  });

  it("never puts the secret key in the URL", async () => {
    const { url } = await sign("pdfs/guide-01.pdf", "Guide.pdf");
    expect(url.toString()).not.toContain("test-secret-key-value-not-real");
    // The access key id does appear, inside X-Amz-Credential — that is how
    // SigV4 works and is not a leak; the secret is what must never appear.
    expect(url.searchParams.get("X-Amz-Credential")).toContain("AKIAtesttesttesttest");
  });

  it("produces a different signature for a different key", async () => {
    const a = await sign("pdfs/one.pdf", "One.pdf");
    const b = await sign("pdfs/two.pdf", "Two.pdf");
    expect(a.params.get("X-Amz-Signature")).not.toBe(b.params.get("X-Amz-Signature"));
  });
});

describe("filename sanitising in Content-Disposition", () => {
  /** The header is signed, so it round-trips through the presigned params. */
  async function disposition(filename: string): Promise<string> {
    const { params } = await sign("pdfs/guide.pdf", filename);
    return params.get("response-content-disposition") ?? "";
  }

  it("keeps an ordinary name readable", async () => {
    // Case is preserved: sanitizeFilename lowercases only to test for the
    // .pdf suffix, it does not lowercase the name it returns.
    expect(await disposition("Joinery Reference.pdf")).toBe(
      'attachment; filename="Joinery-Reference.pdf"',
    );
  });

  it("appends .pdf when the title has no extension", async () => {
    expect(await disposition("Wood Movement")).toBe(
      'attachment; filename="Wood-Movement.pdf"',
    );
  });

  it("strips a quote that would escape the filename parameter", async () => {
    // Without sanitising, `"; x="` would close the quoted string and let the
    // caller append their own header parameters.
    const value = await disposition('evil"; download; x="');
    expect(value).not.toContain('";');
    expect(value).toBe('attachment; filename="evil-download-x.pdf"');
  });

  it("collapses CR and LF so no second header can be injected", async () => {
    const value = await disposition("evil\r\nX-Injected: yes.pdf");
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).toBe('attachment; filename="evil-X-Injected-yes.pdf"');
  });

  it("does not let a filename traverse out of the download name", async () => {
    // Slashes are stripped entirely, so the header cannot suggest a path.
    expect(await disposition("../../etc/passwd")).toBe(
      'attachment; filename="....etcpasswd.pdf"',
    );
  });

  it("falls back to a usable name when nothing survives sanitising", async () => {
    expect(await disposition("«»")).toBe('attachment; filename="download.pdf"');
  });

  it("caps an absurdly long title", async () => {
    const value = await disposition(`${"a".repeat(500)}.pdf`);
    const name = /filename="([^"]+)"/.exec(value)?.[1] ?? "";
    expect(name.length).toBeLessThanOrEqual(124); // 120 cap + ".pdf"
  });
});
