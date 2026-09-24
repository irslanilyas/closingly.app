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
    exclude: ["node_modules/**", ".next/**", ".open-next/**", ".wrangler/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
      // The real package throws outside a React Server Components build, which
      // is its whole job. Tests import server modules directly, so it is a
      // no-op here.
      "server-only": path.resolve(dirname, "test/server-only-stub.ts"),
    },
  },
});
