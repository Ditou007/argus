import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to the monorepo root (3 levels up from this file)
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

export const config = {
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME ?? "argus",
    user: process.env.DB_USER ?? "argus",
    password: process.env.DB_PASSWORD ?? "argus_dev",
  },
  tetragon: {
    exportPath: process.env.TETRAGON_EXPORT_PATH ?? resolve(repoRoot, "data/tetragon/tetragon.log"),
  },
} as const;
