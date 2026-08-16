import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json so tests import modules by
    // the same specifier the app uses.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // These are unit tests: no database, no network, no credentials. The
    // integration coverage lives in scripts/verify-*.ts, which needs a real
    // Postgres and is run separately.
    env: {
      // Unroutable on purpose. Importing lib/catalog.ts pulls in the Drizzle
      // connection; postgres-js is lazy so nothing dials out, but leaving this
      // unset prints a "DATABASE_URL is not set" warning into every run.
      DATABASE_URL: "postgresql://unused@255.255.255.255:5432/unused",
      NEXT_PUBLIC_SITE_URL: "https://example.test",
      AUTH_SECRET: "test-secret-not-a-real-one",
      S3_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
      S3_REGION: "auto",
      S3_BUCKET: "test-bucket",
      S3_ACCESS_KEY_ID: "AKIAtesttesttesttest",
      S3_SECRET_ACCESS_KEY: "test-secret-key-value-not-real",
      DOWNLOAD_URL_TTL_SECONDS: "300",
    },
  },
});
