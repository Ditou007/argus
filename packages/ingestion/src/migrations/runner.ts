import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, ".");

export const createMigrationRunner = (pool: pg.Pool) => {
  const ensureMigrationsTable = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(256) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  };

  const getAppliedMigrations = async (): Promise<Set<string>> => {
    const result = await pool.query("SELECT filename FROM schema_migrations ORDER BY filename");
    return new Set(result.rows.map((r) => r.filename));
  };

  const run = async () => {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const files = await readdir(MIGRATIONS_DIR);
    const sqlFiles = files
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let migrationsRun = 0;

    for (const file of sqlFiles) {
      if (applied.has(file)) continue;

      const sql = await readFile(resolve(MIGRATIONS_DIR, file), "utf-8");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log(`Migration applied: ${file}`);
        migrationsRun++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed: ${file} — ${err}`);
      } finally {
        client.release();
      }
    }

    if (migrationsRun === 0) {
      console.log("Database schema up to date");
    } else {
      console.log(`Applied ${migrationsRun} migration(s)`);
    }
  };

  return { run };
};
