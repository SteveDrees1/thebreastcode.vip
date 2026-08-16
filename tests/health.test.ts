/**
 * The configuration check behind /api/health.
 *
 * The property that matters most here is negative: this feeds an HTTP
 * response, so it must report *which* variables are absent and never what any
 * of them contain.
 */
import { describe, expect, it } from "vitest";
import { checkConfig, degradedAreas, isConfigHealthy } from "@/lib/health";

/** A fully-configured environment, with recognisable secret values. */
const COMPLETE: Record<string, string> = {
  DATABASE_URL: "postgresql://u:SECRET-DB-PASSWORD@host:5432/db",
  AUTH_SECRET: "SECRET-AUTH-VALUE",
  STRIPE_SECRET_KEY: "sk_live_SECRET-STRIPE-KEY",
  STRIPE_WEBHOOK_SECRET: "whsec_SECRET-WEBHOOK",
  STRIPE_SUBSCRIPTION_PRICE_ID: "price_123",
  S3_ENDPOINT: "https://x.r2.cloudflarestorage.com",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY_ID: "AKIASECRET",
  S3_SECRET_ACCESS_KEY: "SECRET-S3-VALUE",
  EMAIL_SERVER_HOST: "smtp.example.test",
  EMAIL_SERVER_USER: "user",
  EMAIL_SERVER_PASSWORD: "SECRET-SMTP-PASSWORD",
  EMAIL_FROM: "no-reply@example.test",
};

describe("checkConfig", () => {
  it("reports every area healthy when nothing is missing", () => {
    const report = checkConfig(COMPLETE);
    expect(isConfigHealthy(report)).toBe(true);
    expect(degradedAreas(report)).toEqual([]);
  });

  it("names the missing variable and marks only its area unhealthy", () => {
    const { STRIPE_SECRET_KEY: _omitted, ...withoutStripe } = COMPLETE;
    const report = checkConfig(withoutStripe);

    expect(report.payments).toEqual({ ok: false, missing: ["STRIPE_SECRET_KEY"] });
    expect(report.database.ok).toBe(true);
    expect(report.storage.ok).toBe(true);
    expect(degradedAreas(report)).toEqual(["payments"]);
    expect(isConfigHealthy(report)).toBe(false);
  });

  it("treats an empty or whitespace value as missing", () => {
    // A variable set to "" in a dashboard is the classic way a deploy looks
    // configured and is not.
    expect(checkConfig({ ...COMPLETE, AUTH_SECRET: "" }).auth.missing).toEqual([
      "AUTH_SECRET",
    ]);
    expect(checkConfig({ ...COMPLETE, AUTH_SECRET: "   " }).auth.missing).toEqual([
      "AUTH_SECRET",
    ]);
  });

  it("reports every missing variable in an area, not just the first", () => {
    const { S3_BUCKET: _a, S3_ACCESS_KEY_ID: _b, ...partial } = COMPLETE;
    expect(checkConfig(partial).storage.missing).toEqual([
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
    ]);
  });

  it("reports an empty environment as entirely degraded", () => {
    const report = checkConfig({});
    expect(isConfigHealthy(report)).toBe(false);
    expect(degradedAreas(report).sort()).toEqual(
      ["auth", "database", "email", "payments", "storage"].sort(),
    );
  });

  it("never includes a configured value anywhere in its output", () => {
    // The whole report is serialised into an HTTP response for admins. If a
    // value can reach it, a secret can leak.
    const serialised = JSON.stringify(checkConfig(COMPLETE));
    for (const value of Object.values(COMPLETE)) {
      expect(serialised).not.toContain(value);
    }
    expect(serialised).not.toContain("SECRET");
  });

  it("never leaks values when reporting a partially configured area", () => {
    const { STRIPE_SECRET_KEY: _omitted, ...partial } = COMPLETE;
    const serialised = JSON.stringify(checkConfig(partial));
    expect(serialised).not.toContain("SECRET-WEBHOOK");
    expect(serialised).not.toContain("SECRET-DB-PASSWORD");
    // The *name* of the absent one is expected and useful.
    expect(serialised).toContain("STRIPE_SECRET_KEY");
  });
});
