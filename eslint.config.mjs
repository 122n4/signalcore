import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}", "lib/**/*.{js,jsx,ts,tsx}"],
    ignores: ["lib/investing/research/index.ts", "lib/investing/research/canonical.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/investing/research/canonical",
              message: "Production code must use the I5 research barrel; canonical.ts contains internal/test-only admission helpers.",
            },
            {
              name: "./canonical",
              message: "Production code must use the I5 research barrel; canonical.ts contains internal/test-only admission helpers.",
            },
            {
              name: "./research/canonical",
              message: "Production code must use the I5 research barrel; canonical.ts contains internal/test-only admission helpers.",
            },
            {
              name: "../research/canonical",
              message: "Production code must use the I5 research barrel; canonical.ts contains internal/test-only admission helpers.",
            },
            {
              name: "../lib/investing/research/canonical",
              message: "Production code must use the I5 research barrel; canonical.ts contains internal/test-only admission helpers.",
            },
          ],
          patterns: [
            {
              group: ["**/lib/investing/research/canonical"],
              message: "Production code must use the I5 research barrel; canonical.ts contains internal/test-only admission helpers.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".codex-chrome-profile/**",
    "artifacts/site-backups/**",
    "qa_*.mjs",
  ]),
]);

export default eslintConfig;
