/**
 * The only route that can hand out a PDF.
 *
 * It re-checks entitlement on every request rather than trusting anything the
 * client holds, then redirects to a presigned URL that expires in minutes. A
 * leaked link is therefore worth very little, and revoking access (refund,
 * lapsed subscription) takes effect on the next click.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { downloadLogs, products } from "@/db/schema";
import { resolveAccess } from "@/lib/entitlements";
import { createDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", req.url));
  }

  const [product] = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      fileKey: products.fileKey,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const via = await resolveAccess(session.user.id, product.id);
  if (via === "none") {
    return NextResponse.json(
      { error: "You do not have access to this file." },
      { status: 403 },
    );
  }

  const url = await createDownloadUrl(product.fileKey, `${product.slug}.pdf`);

  // Audit trail. IPs are hashed so the log is useful for spotting shared
  // accounts without storing raw addresses.
  await db.insert(downloadLogs).values({
    userId: session.user.id,
    productId: product.id,
    via,
    ipHash: hashIp(req.headers.get("x-forwarded-for")),
    userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  return NextResponse.redirect(url, { status: 302 });
}

function hashIp(forwardedFor: string | null): string | null {
  const ip = forwardedFor?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256")
    .update(`${ip}:${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}
