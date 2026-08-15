"use server";

import { and, eq, not, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { bundleItems, bundles, products, promoCodes } from "@/db/schema";
import { getAdmin, inputToCents } from "@/lib/admin";
import { CATALOG_TAG } from "@/lib/catalog";
import { hit } from "@/lib/rate-limit";

/**
 * Every action starts here.
 *
 * Server actions are individually addressable POST endpoints — they do not
 * inherit the layout's protection — so authorisation is re-checked per call
 * against the database, not against the session cookie's claims.
 */
async function authorize(scope: string) {
  const admin = await getAdmin();
  if (!admin) {
    // Deliberately vague: an unauthorised caller learns nothing about whether
    // the action exists or what it does.
    throw new Error("Not found.");
  }

  const limit = hit(`admin:${scope}:${admin.id}`, 60, 60);
  if (!limit.ok) throw new Error("Too many changes at once. Wait a moment.");

  return admin;
}

/** Published catalog data is cached; every write has to drop that cache. */
function refreshCatalog() {
  revalidateTag(CATALOG_TAG);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().trim().max(8000).optional(),
  price: z.string().min(1),
  featured: z.boolean(),
  includedInSubscription: z.boolean(),
  status: z.enum(["draft", "published", "archived"]),
});

export async function saveProductAction(formData: FormData) {
  await authorize("product");

  const parsed = productSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? ""),
    subtitle: String(formData.get("subtitle") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    featured: formData.get("featured") === "on",
    includedInSubscription: formData.get("includedInSubscription") === "on",
    status: String(formData.get("status") ?? "draft"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/admin/products/${formData.get("id")}?error=${encodeURIComponent(message)}`);
  }

  const priceCents = inputToCents(parsed.data.price);
  if (priceCents === null) {
    redirect(
      `/admin/products/${parsed.data.id}?error=${encodeURIComponent("Price must be a positive number")}`,
    );
  }

  const [current] = await db
    .select({ status: products.status, publishedAt: products.publishedAt })
    .from(products)
    .where(eq(products.id, parsed.data.id))
    .limit(1);

  if (!current) redirect("/admin/products?error=Product+not+found");

  // Stamp publishedAt the first time something goes live, and never overwrite
  // it afterwards — it is the catalog's sort key and its original date matters.
  const goingLive =
    parsed.data.status === "published" && current.status !== "published";

  await db
    .update(products)
    .set({
      title: parsed.data.title,
      subtitle: parsed.data.subtitle || null,
      description: parsed.data.description ?? "",
      priceCents,
      featured: parsed.data.featured,
      includedInSubscription: parsed.data.includedInSubscription,
      status: parsed.data.status,
      ...(goingLive && !current.publishedAt ? { publishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, parsed.data.id));

  refreshCatalog();
  redirect(`/admin/products/${parsed.data.id}?saved=1`);
}

export async function toggleProductStatusAction(formData: FormData) {
  await authorize("product");
  const id = String(formData.get("id") ?? "");

  const [current] = await db
    .select({ status: products.status, publishedAt: products.publishedAt })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!current) return;

  const next = current.status === "published" ? "draft" : "published";
  await db
    .update(products)
    .set({
      status: next,
      ...(next === "published" && !current.publishedAt
        ? { publishedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  refreshCatalog();
  revalidatePath("/admin/products");
}

export async function toggleProductFeaturedAction(formData: FormData) {
  await authorize("product");
  const id = String(formData.get("id") ?? "");

  await db
    .update(products)
    .set({ featured: not(products.featured), updatedAt: new Date() })
    .where(eq(products.id, id));

  refreshCatalog();
  revalidatePath("/admin/products");
}

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

const bundleSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, numbers and dashes"),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().trim().max(8000).optional(),
  price: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]),
});

export async function createBundleAction(formData: FormData) {
  await authorize("bundle");

  const parsed = bundleSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    subtitle: String(formData.get("subtitle") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    status: String(formData.get("status") ?? "draft"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/bundles?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  const priceCents = inputToCents(parsed.data.price);
  if (priceCents === null) redirect("/admin/bundles?error=Price+must+be+a+number");

  const existing = await db
    .select({ id: bundles.id })
    .from(bundles)
    .where(eq(bundles.slug, parsed.data.slug))
    .limit(1);
  if (existing.length > 0) {
    redirect("/admin/bundles?error=That+slug+is+already+taken");
  }

  const [created] = await db
    .insert(bundles)
    .values({
      title: parsed.data.title,
      slug: parsed.data.slug,
      subtitle: parsed.data.subtitle || null,
      description: parsed.data.description ?? "",
      priceCents,
      status: parsed.data.status,
      publishedAt: parsed.data.status === "published" ? new Date() : null,
    })
    .returning({ id: bundles.id });

  refreshCatalog();
  redirect(`/admin/bundles/${created.id}?created=1`);
}

export async function saveBundleAction(formData: FormData) {
  await authorize("bundle");
  const id = String(formData.get("id") ?? "");

  const parsed = bundleSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    subtitle: String(formData.get("subtitle") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    status: String(formData.get("status") ?? "draft"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/bundles/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  const priceCents = inputToCents(parsed.data.price);
  if (priceCents === null) redirect(`/admin/bundles/${id}?error=Price+must+be+a+number`);

  // A slug collision with a *different* bundle would break both URLs.
  const clash = await db
    .select({ id: bundles.id })
    .from(bundles)
    .where(and(eq(bundles.slug, parsed.data.slug), not(eq(bundles.id, id))))
    .limit(1);
  if (clash.length > 0) {
    redirect(`/admin/bundles/${id}?error=That+slug+is+already+taken`);
  }

  const [current] = await db
    .select({ publishedAt: bundles.publishedAt })
    .from(bundles)
    .where(eq(bundles.id, id))
    .limit(1);

  await db
    .update(bundles)
    .set({
      title: parsed.data.title,
      slug: parsed.data.slug,
      subtitle: parsed.data.subtitle || null,
      description: parsed.data.description ?? "",
      priceCents,
      status: parsed.data.status,
      ...(parsed.data.status === "published" && !current?.publishedAt
        ? { publishedAt: new Date() }
        : {}),
    })
    .where(eq(bundles.id, id));

  refreshCatalog();
  redirect(`/admin/bundles/${id}?saved=1`);
}

export async function addBundleItemAction(formData: FormData) {
  await authorize("bundle");
  const bundleId = String(formData.get("bundleId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!bundleId || !productId) return;

  // Append at the end; position drives display order on the bundle page.
  const [{ value: nextPosition }] = await db
    .select({ value: sql<number>`coalesce(max(${bundleItems.position}), -1) + 1` })
    .from(bundleItems)
    .where(eq(bundleItems.bundleId, bundleId));

  await db
    .insert(bundleItems)
    .values({ bundleId, productId, position: Number(nextPosition) })
    .onConflictDoNothing();

  refreshCatalog();
  revalidatePath(`/admin/bundles/${bundleId}`);
}

export async function removeBundleItemAction(formData: FormData) {
  await authorize("bundle");
  const bundleId = String(formData.get("bundleId") ?? "");
  const productId = String(formData.get("productId") ?? "");

  await db
    .delete(bundleItems)
    .where(
      and(eq(bundleItems.bundleId, bundleId), eq(bundleItems.productId, productId)),
    );

  refreshCatalog();
  revalidatePath(`/admin/bundles/${bundleId}`);
}

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------

const promoSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Code may contain letters, numbers, dashes, underscores"),
  kind: z.enum(["free_product", "free_bundle", "free_catalog"]),
  productId: z.string().optional(),
  bundleId: z.string().optional(),
  maxRedemptions: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});

export async function createPromoAction(formData: FormData) {
  await authorize("promo");

  const parsed = promoSchema.safeParse({
    code: String(formData.get("code") ?? ""),
    kind: String(formData.get("kind") ?? "free_product"),
    productId: String(formData.get("productId") ?? ""),
    bundleId: String(formData.get("bundleId") ?? ""),
    maxRedemptions: String(formData.get("maxRedemptions") ?? ""),
    note: String(formData.get("note") ?? ""),
  });

  if (!parsed.success) {
    redirect(
      `/admin/promos?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  // A code that grants nothing is a support ticket waiting to happen.
  if (parsed.data.kind === "free_product" && !parsed.data.productId) {
    redirect("/admin/promos?error=Choose+a+set+for+this+code");
  }
  if (parsed.data.kind === "free_bundle" && !parsed.data.bundleId) {
    redirect("/admin/promos?error=Choose+a+bundle+for+this+code");
  }

  const max = parsed.data.maxRedemptions?.trim()
    ? Number.parseInt(parsed.data.maxRedemptions, 10)
    : null;
  if (max !== null && (!Number.isFinite(max) || max < 1)) {
    redirect("/admin/promos?error=Redemption+limit+must+be+a+positive+number");
  }

  const code = parsed.data.code.toUpperCase();
  const clash = await db
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(eq(promoCodes.code, code))
    .limit(1);
  if (clash.length > 0) redirect("/admin/promos?error=That+code+already+exists");

  await db.insert(promoCodes).values({
    code,
    kind: parsed.data.kind,
    productId: parsed.data.kind === "free_product" ? parsed.data.productId : null,
    bundleId: parsed.data.kind === "free_bundle" ? parsed.data.bundleId : null,
    maxRedemptions: max,
    note: parsed.data.note || null,
  });

  revalidatePath("/admin/promos");
  redirect("/admin/promos?created=1");
}

export async function togglePromoAction(formData: FormData) {
  await authorize("promo");
  const id = String(formData.get("id") ?? "");

  await db
    .update(promoCodes)
    .set({ active: not(promoCodes.active) })
    .where(eq(promoCodes.id, id));

  revalidatePath("/admin/promos");
}
