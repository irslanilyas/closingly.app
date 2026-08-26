import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit tests only, on purpose — pure functions with no I/O. Nothing here
 * spins up Next's dev server, hits Supabase, or calls a real AI API; that
 * tier of testing is a separate, later investment.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
});
