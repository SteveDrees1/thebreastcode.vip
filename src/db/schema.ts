/**
 * Database schema for the PDF catalog.
 *
 * The organising idea: every way a customer can come to own a PDF — a one-off
 * purchase, a bundle, a promo code, a referral reward, a manual comp — writes a
 * row into `entitlements`. Access checks therefore never branch on sales model.
 *
 * The single deliberate exception is subscriptions. An all-access plan must
 * cover PDFs that do not exist yet, so materialising entitlement rows at
 * purchase time would silently exclude everything published later. Instead the
 * subscription is resolved live at read time against
 * `products.includedInSubscription`. See src/lib/entitlements.ts.
 */
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const cuid = () => crypto.randomUUID();

/**
 * Short, shareable referral code. Excludes vowels and lookalike characters so
 * codes are unambiguous when read aloud and cannot spell words by accident.
 */
const REFERRAL_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";
const generateReferralCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (byte) => REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length],
  ).join("");

// ---------------------------------------------------------------------------
// Auth.js tables (shapes required by @auth/drizzle-adapter)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(cuid),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),

  /** Stripe customer, created lazily on first checkout. */
  stripeCustomerId: text("stripe_customer_id").unique(),

  /**
   * Short public code this user shares to refer others. Generated on insert so
   * that users created by the Auth.js adapter (which only knows about its own
   * columns) still get one.
   */
  referralCode: text("referral_code").notNull().unique().$defaultFn(generateReferralCode),

  /** Staff flag, gates /admin. */
  isAdmin: boolean("is_admin").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"oauth" | "oidc" | "email" | "webauthn">().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const publishStatus = pgEnum("publish_status", ["draft", "published", "archived"]);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    /** Markdown. Rendered on the product page. */
    description: text("description").notNull().default(""),

    /** Public cover image (safe to serve from a public bucket / CDN). */
    coverImageUrl: text("cover_image_url"),

    /**
     * Object key of the sellable PDF inside the PRIVATE bucket.
     * Never exposed to the client — see src/lib/storage.ts.
     */
    fileKey: text("file_key").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    pageCount: integer("page_count"),

    /** Optional free sample (first N pages) in the PUBLIC bucket. */
    samplePdfUrl: text("sample_pdf_url"),

    /**
     * Checksum of the PDF as built by the generator. Lets `import:product` skip
     * re-uploading an unchanged file and tells you at a glance whether the
     * object in the bucket matches the current build.
     */
    sourceSha256: text("source_sha256"),
    /** Document id from the generator, e.g. "DM-WSG-2026". */
    sourceDocId: text("source_doc_id"),

    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** Stripe Price the checkout session uses. */
    stripePriceId: text("stripe_price_id"),

    /** Whether an active all-access subscriber gets this one. */
    includedInSubscription: boolean("included_in_subscription").notNull().default(true),

    status: publishStatus("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_status_idx").on(t.status, t.publishedAt),
    index("products_subscription_idx").on(t.includedInSubscription),
  ],
);

export const bundles = pgTable("bundles", {
  id: text("id").primaryKey().$defaultFn(cuid),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description").notNull().default(""),
  coverImageUrl: text("cover_image_url"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  stripePriceId: text("stripe_price_id"),
  status: publishStatus("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bundleItems = pgTable(
  "bundle_items",
  {
    bundleId: text("bundle_id")
      .notNull()
      .references(() => bundles.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bundleId, t.productId] })],
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orderStatus = pgEnum("order_status", ["pending", "paid", "refunded", "failed"]);
export const lineItemKind = pgEnum("line_item_kind", ["product", "bundle", "subscription"]);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Unique so the Stripe webhook can be replayed safely: a second delivery of
     * the same checkout.session.completed hits this constraint and no-ops.
     */
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull().unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),

    amountSubtotalCents: integer("amount_subtotal_cents").notNull().default(0),
    amountTaxCents: integer("amount_tax_cents").notNull().default(0),
    amountTotalCents: integer("amount_total_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),

    status: orderStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_user_idx").on(t.userId, t.createdAt)],
);

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey().$defaultFn(cuid),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  kind: lineItemKind("kind").notNull(),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  bundleId: text("bundle_id").references(() => bundles.id, { onDelete: "set null" }),
  /** Snapshot of the title/price at purchase time, for receipts and history. */
  titleSnapshot: text("title_snapshot").notNull(),
  unitAmountCents: integer("unit_amount_cents").notNull(),
});

// ---------------------------------------------------------------------------
// Subscriptions (all-access)
// ---------------------------------------------------------------------------

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePriceId: text("stripe_price_id"),
    status: subscriptionStatus("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId, t.status)],
);

// ---------------------------------------------------------------------------
// Entitlements — the one thing access checks read
// ---------------------------------------------------------------------------

export const entitlementSource = pgEnum("entitlement_source", [
  "purchase",
  "bundle",
  "promo",
  "referral",
  "manual",
]);

export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    source: entitlementSource("source").notNull(),
    /**
     * What produced this grant: an order id, a promo code id, a referral id.
     * Combined with (userId, productId, source) it makes grants idempotent, so
     * a replayed webhook cannot double-grant.
     */
    sourceRef: text("source_ref").notNull().default(""),

    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = perpetual. Purchases are perpetual; promos may expire. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Set on refund/chargeback rather than deleting, so history survives. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("entitlements_unique_grant_idx").on(
      t.userId,
      t.productId,
      t.source,
      t.sourceRef,
    ),
    index("entitlements_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export const promoKind = pgEnum("promo_kind", [
  /** Grants a specific product outright. */
  "free_product",
  /** Grants every product in a bundle outright. */
  "free_bundle",
  /** Grants the entire published catalog (launch giveaways). */
  "free_catalog",
]);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    code: text("code").notNull().unique(),
    kind: promoKind("kind").notNull(),
    productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
    bundleId: text("bundle_id").references(() => bundles.id, { onDelete: "cascade" }),

    /** NULL = unlimited. */
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").notNull().default(0),

    /** NULL = the grant it produces never expires. */
    grantDurationDays: integer("grant_duration_days"),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("promo_codes_active_idx").on(t.active, t.expiresAt)],
);

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    promoCodeId: text("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One redemption per person per code.
  (t) => [uniqueIndex("promo_redemptions_unique_idx").on(t.promoCodeId, t.userId)],
);

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export const referralStatus = pgEnum("referral_status", ["pending", "qualified", "rewarded"]);

export const referrals = pgTable(
  "referrals",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Unique: a given person can only ever be someone's referral once. */
    referredUserId: text("referred_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    status: referralStatus("status").notNull().default("pending"),
    /** Set when the referred user verifies their email (anti-fraud gate). */
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("referrals_referrer_idx").on(t.referrerUserId, t.status)],
);

/**
 * Credits earned from referrals, redeemable for any single product.
 * Kept separate from entitlements so a user can bank credits before choosing.
 */
export const referralCredits = pgTable(
  "referral_credits",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The referrals that added up to this credit, for auditability. */
    reason: text("reason").notNull().default("referral_milestone"),
    spentOnProductId: text("spent_on_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    spentAt: timestamp("spent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("referral_credits_user_idx").on(t.userId, t.spentAt)],
);

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const downloadLogs = pgTable(
  "download_logs",
  {
    id: text("id").primaryKey().$defaultFn(cuid),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Which access path authorised this download, for abuse analysis. */
    via: text("via").notNull().default("entitlement"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("download_logs_user_idx").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  entitlements: many(entitlements),
  orders: many(orders),
  subscriptions: many(subscriptions),
  referralCredits: many(referralCredits),
}));

export const productsRelations = relations(products, ({ many }) => ({
  entitlements: many(entitlements),
  bundleItems: many(bundleItems),
}));

export const bundlesRelations = relations(bundles, ({ many }) => ({
  items: many(bundleItems),
}));

export const bundleItemsRelations = relations(bundleItems, ({ one }) => ({
  bundle: one(bundles, { fields: [bundleItems.bundleId], references: [bundles.id] }),
  product: one(products, { fields: [bundleItems.productId], references: [products.id] }),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  user: one(users, { fields: [entitlements.userId], references: [users.id] }),
  product: one(products, { fields: [entitlements.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  bundle: one(bundles, { fields: [orderItems.bundleId], references: [bundles.id] }),
}));

/** `now()` helper shared by query modules. */
export const nowSql = sql`now()`;

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Bundle = typeof bundles.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
