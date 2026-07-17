import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const browserGlobals = {
  Blob: "readonly",
  document: "readonly",
  EventSource: "readonly",
  File: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  HTMLButtonElement: "readonly",
  HTMLDivElement: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLTextAreaElement: "readonly",
  KeyboardEvent: "readonly",
  localStorage: "readonly",
  MouseEvent: "readonly",
  navigator: "readonly",
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  window: "readonly",
};

const runtimeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  crypto: "readonly",
  Deno: "readonly",
  fetch: "readonly",
  globalThis: "readonly",
  process: "readonly",
  ReadableStream: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
};

export default defineConfig([
  globalIgnores([
    ".next/**",
    ".wrangler/**",
    "build/**",
    "dist/**",
    "local-preview/dist/**",
    "next-env.d.ts",
    "node_modules/**",
    "out/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...browserGlobals,
        ...runtimeGlobals,
      },
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
]);
