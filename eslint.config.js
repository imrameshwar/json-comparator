// ESLint flat config (ESLint 9+).
// Scope: lints the JS dev tooling (tests, config, future src/).
// The web app (json_compare.html) is intentionally NOT linted here — it stays a
// standalone single-file app openable via file:// with no build step.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "coverage/**", "dist/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
];
