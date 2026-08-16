/**
 * Environment loading for the CLI scripts, matching what Next.js does.
 *
 * `import "dotenv/config"` reads `.env` and nothing else. The README tells you
 * to `cp .env.example .env.local`, and Next.js reads `.env.local` — so every
 * script that used the bare import failed for anyone who followed the setup
 * instructions:
 *
 *     [db] DATABASE_URL is not set — database access will fail.
 *     Error: connect ENETUNREACH 255.255.255.255:5432
 *
 * (255.255.255.255 is the unroutable sentinel `src/db/index.ts` falls back to
 * when DATABASE_URL is absent, so the failure surfaces as a connection error
 * rather than a crash at import time.)
 *
 * Order matters: dotenv keeps the first definition it sees and does not
 * overwrite, so listing `.env.local` first gives it precedence over `.env`,
 * which is the precedence Next.js applies. Variables already present in the
 * real environment always win over both — that is dotenv's default and it is
 * what lets CI inject secrets without a file on disk.
 *
 * Import this for its side effect, before anything that reads process.env:
 *
 *     import "./load-env";
 */
import { config } from "dotenv";

config({
  path: [".env.local", ".env"],
  // dotenv v17 prints a banner to stdout on every load. These scripts have
  // parseable output, so keep it quiet.
  quiet: true,
});
