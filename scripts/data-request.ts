/**
 * Subject access and erasure requests, so the privacy policy is keepable.
 *
 * `/privacy` tells customers they can ask for a copy of their data and ask for
 * it to be deleted. Those rights exist in law whether or not the code helps,
 * but before this the only way to honour one was hand-written SQL across
 * eleven tables — which is how a request gets answered late, or answered
 * wrongly, or quietly not answered at all.
 *
 *   npm run data:request -- --export you@example.com --out subject.json
 *   npm run data:request -- --erase  you@example.com --confirm
 *
 * Prefer `--out` over redirecting stdout: `npm run` prints its own banner to
 * stdout, which lands in the middle of the JSON and makes the file unparseable.
 * Found the hard way.
 *
 * ERASURE ANONYMISES; IT DOES NOT DELETE THE ROW. That is deliberate and the
 * schema forces it: ten foreign keys onto `users.id` are `onDelete: cascade`,
 * including `orders`. Deleting the user would destroy the record of the sale
 * that tax law requires keeping — the exact carve-out /privacy describes. So
 * the identifying columns are overwritten irreversibly and the rows that carry
 * no personal data stay, which is the "deleted or irreversibly anonymised"
 * wording the policy already uses.
 *
 * Writes to the database. Take a backup first.
 */
import "./load-env";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { eq, or } from "drizzle-orm";
import { db } from "../src/db";
import {
  accounts,
  adminAuditLog,
  downloadLogs,
  entitlements,
  orderItems,
  orders,
  promoRedemptions,
  referralCredits,
  referrals,
  sessions,
  subscriptions,
  users,
} from "../src/db/schema";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const exportEmail = flag("export");
const eraseEmail = flag("erase");
const confirmed = args.includes("--confirm");

function usage(): never {
  console.error(`Usage:
  npm run data:request -- --export <email> [--out <file>]
  npm run data:request -- --erase  <email> --confirm

  --export  writes a JSON copy of everything held about the person to stdout
  --erase   irreversibly anonymises them; requires --confirm`);
  process.exit(1);
}

async function findUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No account with email ${email}.`);
    process.exit(1);
  }
  return user;
}

/** Everything the database holds about one person. */
async function collect(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [
    userOrders,
    userEntitlements,
    userSubscriptions,
    userDownloads,
    userPromoRedemptions,
    userReferralCredits,
    userReferrals,
    userAccounts,
  ] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, userId)),
    db.select().from(entitlements).where(eq(entitlements.userId, userId)),
    db.select().from(subscriptions).where(eq(subscriptions.userId, userId)),
    db.select().from(downloadLogs).where(eq(downloadLogs.userId, userId)),
    db.select().from(promoRedemptions).where(eq(promoRedemptions.userId, userId)),
    db.select().from(referralCredits).where(eq(referralCredits.userId, userId)),
    db
      .select()
      .from(referrals)
      .where(or(eq(referrals.referrerUserId, userId), eq(referrals.referredUserId, userId))),
    // Auth provider links. The provider's own token columns are secrets, not
    // the subject's data, so only the linkage is reported.
    db
      .select({ provider: accounts.provider, type: accounts.type })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
  ]);

  const items = userOrders.length
    ? await Promise.all(
        userOrders.map((o) =>
          db.select().from(orderItems).where(eq(orderItems.orderId, o.id)),
        ),
      )
    : [];

  return {
    exportedAt: new Date().toISOString(),
    account: user,
    authProviders: userAccounts,
    orders: userOrders,
    orderItems: items.flat(),
    entitlements: userEntitlements,
    subscriptions: userSubscriptions,
    promoRedemptions: userPromoRedemptions,
    referrals: userReferrals,
    referralCredits: userReferralCredits,
    // Included for completeness. `ipHash` is a salted SHA-256, not an address —
    // it cannot be reversed to an IP, by us or by the subject.
    downloadLog: userDownloads,
  };
}

async function doExport(email: string) {
  const user = await findUser(email);
  const data = await collect(user.id);
  const json = JSON.stringify(data, null, 2);
  const out = flag("out");

  if (out) {
    await writeFile(out, `${json}\n`, "utf8");
  } else {
    // Still supported, but npm's banner shares this stream — see the header.
    console.log(json);
  }

  console.error(
    `\nExported ${data.orders.length} order(s), ${data.entitlements.length} entitlement(s), ` +
      `${data.downloadLog.length} download(s) for ${email}` +
      (out ? ` to ${out}.` : ". Use --out <file> for a clean copy."),
  );
}

async function doErase(email: string) {
  const user = await findUser(email);

  if (!confirmed) {
    console.error(
      `This will irreversibly anonymise ${email} (id ${user.id}).\n` +
        "Run --export first and keep the output, then re-run with --confirm.",
    );
    process.exit(1);
  }

  // A stable pseudonym, so two erasures of the same account do not collide and
  // support can still correlate a row with a past request without the address.
  const pseudonym = createHash("sha256")
    .update(`${user.id}:${email}`)
    .digest("hex")
    .slice(0, 16);

  await db.transaction(async (tx) => {
    // 1. Authentication first: kill the ways back in before anything else.
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(accounts).where(eq(accounts.userId, user.id));

    // 2. Access ends, as /privacy says it does. Revoked rather than deleted so
    //    the entitlement history behind a sale stays auditable.
    await tx
      .update(entitlements)
      .set({ revokedAt: new Date() })
      .where(eq(entitlements.userId, user.id));

    // 3. The download log's whole purpose is spotting a shared account. Once
    //    the account is gone it has no purpose, and it holds a user agent
    //    string, so it goes entirely.
    await tx.delete(downloadLogs).where(eq(downloadLogs.userId, user.id));

    // 4. If they were an administrator, the audit log snapshotted their email.
    //    The entries stay — they record what was done to the catalog, which is
    //    not the subject's personal data — but the address is scrubbed.
    await tx
      .update(adminAuditLog)
      .set({ actorEmail: `erased-${pseudonym}@invalid` })
      .where(eq(adminAuditLog.actorEmail, email));

    // 5. The account itself. `.invalid` is reserved by RFC 2606 and can never
    //    be a real address, so this cannot collide with a future signup.
    //    stripeCustomerId is cleared here; erase the customer in Stripe too —
    //    this script cannot reach it. Orders keep their own Stripe references
    //    for the tax record.
    await tx
      .update(users)
      .set({
        email: `erased-${pseudonym}@invalid`,
        name: null,
        image: null,
        emailVerified: null,
        stripeCustomerId: null,
        referralCode: `ERASED${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        isAdmin: false,
        canAudit: false,
      })
      .where(eq(users.id, user.id));
  });

  console.log(`Erased ${email}.`);
  console.log(`  account anonymised as erased-${pseudonym}@invalid`);
  console.log("  sessions and provider links deleted");
  console.log("  entitlements revoked — library access has ended");
  console.log("  download log deleted");
  console.log("  audit entries kept, actor email scrubbed");
  console.log("  orders kept: the sale record tax law requires, now anonymous");
  console.log("\nStill to do by hand:");
  console.log("  • delete the customer in the Stripe dashboard");
  console.log("  • confirm your email provider holds no copy of the sign-in messages");
}

async function main() {
  if (exportEmail) return doExport(exportEmail);
  if (eraseEmail) return doErase(eraseEmail);
  usage();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
