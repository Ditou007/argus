import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Repo-root vitest config. Node by default; the dashboard's React tests opt into
// jsdom via environmentMatchGlobs. The `@` alias + automatic JSX serve the
// dashboard (harmless for the node packages, which use neither). Lives at the
// root (outside packages/) so it isn't a per-package source file.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./packages/dashboard/src", import.meta.url)) },
  },
  test: {
    globals: true,
    // React component tests (.tsx) need a DOM; node packages use plain .ts → node.
    environmentMatchGlobs: [["**/*.tsx", "jsdom"]],
  },
});
