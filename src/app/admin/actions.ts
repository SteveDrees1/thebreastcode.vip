"use server";

import { and, eq, not, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { adminAuditLog, bundleItems, bundles, products, promoCodes, users } from "@/db/schema";
import { getAdmin, inputToCents, type ConsoleUser } from "@/lib/admin";
import { diff, hashIp, writeAudit } from "@/lib/audit";
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


/** Attribute an entry to the acting admin and stamp the request address. */
async function record(
  admin: ConsoleUser,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
  },
) {
  const forwarded = (await headers()).get("x-forwarded-for");
  await writeAudit({
    ...entry,
    actorId: admin.id,
    actorEmail: admin.email,
    ipHash: hashIp(forwarded?.split(",")[0]?.trim()),
  });
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
  const admin = await authorize("product");

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

  // Read the full row first: the audit entry is only useful if it can say what
  // the values were before.
  const [current] = await db
    .select()
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

  await record(admin, {
    action: "product.update",
    entityType: "product",
    entityId: parsed.data.id,
    summary: `Edited “${parsed.data.title}”`,
    changes: diff(
      {
        title: current.title,
        subtitle: current.subtitle,
        priceCents: current.priceCents,
        status: current.status,
        featured: current.featured,
        includedInSubscription: current.includedInSubscription,
      },
      {
        title: parsed.data.title,
        subtitle: parsed.data.subtitle || null,
        priceCents,
        status: parsed.data.status,
        featured: parsed.data.featured,
        includedInSubscription: parsed.data.includedInSubscription,
      },
    ),
  });

  refreshCatalog();
  redirect(`/admin/products/${parsed.data.id}?saved=1`);
}

export async function toggleProductStatusAction(formData: FormData) {
  const admin = await authorize("product");
  const id = String(formData.get("id") ?? "");

  const [current] = await db
    .select({
      title: products.title,
      status: products.status,
      publishedAt: products.publishedAt,
    })
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

  await record(admin, {
    action: next === "published" ? "product.publish" : "product.unpublish",
    entityType: "product",
    entityId: id,
    summary: `${next === "published" ? "Published" : "Unpublished"} “${current.title}”`,
    changes: { status: { from: current.status, to: next } },
  });

  refreshCatalog();
  revalidatePath("/admin/products");
}

export async function toggleProductFeaturedAction(formData: FormData) {
  const admin = await authorize("product");
  const id = String(formData.get("id") ?? "");

  // `returning` gives the post-update value in one round trip, so the log
  // records what the row actually became rather than what we assumed.
  const [updated] = await db
    .update(products)
    .set({ featured: not(products.featured), updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning({ title: products.title, featured: products.featured });

  if (!updated) return;

  await record(admin, {
    action: updated.featured ? "product.feature" : "product.unfeature",
    entityType: "product",
    entityId: id,
    summary: `${updated.featured ? "Featured" : "Unfeatured"} “${updated.title}”`,
    changes: { featured: { from: !updated.featured, to: updated.featured } },
  });

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
  const admin = await authorize("bundle");

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

  await record(admin, {
    action: "bundle.create",
    entityType: "bundle",
    entityId: created.id,
    summary: `Created bundle “${parsed.data.title}”`,
    changes: {
      priceCents: { from: null, to: priceCents },
      status: { from: null, to: parsed.data.status },
    },
  });

  refreshCatalog();
  redirect(`/admin/bundles/${created.id}?created=1`);
}

export async function saveBundleAction(formData: FormData) {
  const admin = await authorize("bundle");
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
    .select()
    .from(bundles)
    .where(eq(bundles.id, id))
    .limit(1);
  if (!current) redirect("/admin/bundles?error=Bundle+not+found");

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

  await record(admin, {
    action: "bundle.update",
    entityType: "bundle",
    entityId: id,
    summary: `Edited bundle “${parsed.data.title}”`,
    changes: diff(
      {
        title: current.title,
        slug: current.slug,
        priceCents: current.priceCents,
        status: current.status,
      },
      {
        title: parsed.data.title,
        slug: parsed.data.slug,
        priceCents,
        status: parsed.data.status,
      },
    ),
  });

  refreshCatalog();
  redirect(`/admin/bundles/${id}?saved=1`);
}

export async function addBundleItemAction(formData: FormData) {
  const admin = await authorize("bundle");
  const bundleId = String(formData.get("bundleId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!bundleId || !productId) return;

  // Append at the end; position drives display order on the bundle page.
  const [{ value: nextPosition }] = await db
    .select({ value: sql<number>`coalesce(max(${bundleItems.position}), -1) + 1` })
    .from(bundleItems)
    .where(eq(bundleItems.bundleId, bundleId));

  const added = await db
    .insert(bundleItems)
    .values({ bundleId, productId, position: Number(nextPosition) })
    .onConflictDoNothing()
    .returning({ productId: bundleItems.productId });

  // A no-op conflict is not a change; do not clutter the log with one.
  if (added.length > 0) {
    const [product] = await db
      .select({ title: products.title })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    await record(admin, {
      action: "bundle.item.add",
      entityType: "bundle",
      entityId: bundleId,
      summary: `Added “${product?.title ?? productId}” to a bundle`,
    });
  }

  refreshCatalog();
  revalidatePath(`/admin/bundles/${bundleId}`);
}

export async function removeBundleItemAction(formData: FormData) {
  const admin = await authorize("bundle");
  const bundleId = String(formData.get("bundleId") ?? "");
  const productId = String(formData.get("productId") ?? "");

  const removed = await db
    .delete(bundleItems)
    .where(and(eq(bundleItems.bundleId, bundleId), eq(bundleItems.productId, productId)))
    .returning({ productId: bundleItems.productId });

  if (removed.length > 0) {
    const [product] = await db
      .select({ title: products.title })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    await record(admin, {
      action: "bundle.item.remove",
      entityType: "bundle",
      entityId: bundleId,
      summary: `Removed “${product?.title ?? productId}” from a bundle`,
    });
  }

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
  const admin = await authorize("promo");

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

  const [createdPromo] = await db
    .insert(promoCodes)
    .values({
      code,
      kind: parsed.data.kind,
      productId: parsed.data.kind === "free_product" ? parsed.data.productId : null,
      bundleId: parsed.data.kind === "free_bundle" ? parsed.data.bundleId : null,
      maxRedemptions: max,
      note: parsed.data.note || null,
    })
    .returning({ id: promoCodes.id });

  await record(admin, {
    action: "promo.create",
    entityType: "promo",
    entityId: createdPromo.id,
    // Codes give away product, so who minted one and how many it covers is
    // exactly the question this log exists to answer.
    summary: `Created promo ${code} (${parsed.data.kind.replace(/_/g, " ")}, limit ${max ?? "unlimited"})`,
  });

  revalidatePath("/admin/promos");
  redirect("/admin/promos?created=1");
}

export async function togglePromoAction(formData: FormData) {
  const admin = await authorize("promo");
  const id = String(formData.get("id") ?? "");

  const [updated] = await db
    .update(promoCodes)
    .set({ active: not(promoCodes.active) })
    .where(eq(promoCodes.id, id))
    .returning({ code: promoCodes.code, active: promoCodes.active });

  if (updated) {
    await record(admin, {
      action: updated.active ? "promo.enable" : "promo.disable",
      entityType: "promo",
      entityId: id,
      summary: `${updated.active ? "Enabled" : "Disabled"} promo ${updated.code}`,
      changes: { active: { from: !updated.active, to: updated.active } },
    });
  }

  revalidatePath("/admin/promos");
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

/**
 * Mark an audit entry for follow-up.
 *
 * Flagging is itself a change, but it is deliberately NOT audited: an auditor
 * marking twenty entries during a review would bury the very entries they were
 * reading. The flag records who set it in the note instead.
 */
export async function toggleAuditFlagAction(formData: FormData) {
  const admin = await authorize("flag");
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  const [current] = await db
    .select({ flagged: adminAuditLog.flagged })
    .from(adminAuditLog)
    .where(eq(adminAuditLog.id, id))
    .limit(1);
  if (!current) return;

  await db
    .update(adminAuditLog)
    .set({
      flagged: !current.flagged,
      flagNote: current.flagged ? null : note || `Flagged by ${admin.email}`,
    })
    .where(eq(adminAuditLog.id, id));

  revalidatePath("/admin/activity");
}

/** Mark a customer account for closer watching. */
export async function toggleUserFlagAction(formData: FormData) {
  const admin = await authorize("flag");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const [current] = await db
    .select({ flagged: users.flagged, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!current) return;

  const next = !current.flagged;
  await db
    .update(users)
    .set({ flagged: next, flagReason: next ? reason || "No reason given" : null })
    .where(eq(users.id, id));

  // Flagging a customer IS audited: it is a judgement about a person, and the
  // reasoning behind it should be reconstructable later.
  await record(admin, {
    action: next ? "user.flag" : "user.unflag",
    entityType: "user",
    entityId: id,
    summary: `${next ? "Flagged" : "Unflagged"} ${current.email}${next && reason ? ` — ${reason}` : ""}`,
    changes: { flagged: { from: current.flagged, to: next } },
  });

  revalidatePath("/admin/customers");
}
