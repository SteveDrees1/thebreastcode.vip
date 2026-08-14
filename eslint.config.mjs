import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat config built from the underlying plugins rather than `eslint-config-next`.
 *
 * That package is still eslintrc-only and pulls in @rushstack/eslint-patch,
 * which throws under ESLint 9's flat config. Composing the same three plugin
 * sets directly gives identical coverage — Next's core-web-vitals rules,
 * typescript-eslint, and the rules-of-hooks checks — with no compatibility shim.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,

      // A leading underscore is the documented way to keep a parameter that
      // exists to describe a callback's shape.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // Scripts are operator tools: console output is the interface.
    files: ["scripts/**/*.ts", "src/db/seed.ts"],
    rules: { "no-console": "off" },
  },
];

export default config;
