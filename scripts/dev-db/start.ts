/**
 * Start the local embedded PostgreSQL server (development/tests only).
 * Data lives in `.pgdata` (gitignored). Requires `embedded-postgres`, which is
 * installed as a devDependency (binaries are shipped via npm packages).
 *
 * Usage: npm run db:start
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.GP_DB_PORT ?? "55432");
const DB_NAME = process.env.GP_DB_NAME ?? "graduation_party";
const DB_USER = process.env.GP_DB_USER ?? "postgres";
const DB_PASSWORD = process.env.GP_DB_PASSWORD ?? "postgres";
const DATA_DIR = path.resolve(process.cwd(), ".pgdata");

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASSWORD,
    port: PORT,
    persistent: true,
    authMethod: "password",
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
  });

  // Initialise the data dir once (idempotent: initialise on an already
  // initialised dir is a no-op guarded by postmaster.pid checks below).
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log(`[dev-db] initialising cluster in ${DATA_DIR}`);
    await pg.initialise();
  }

  await pg.start();
  console.log(`[dev-db] PostgreSQL listening on 127.0.0.1:${PORT}`);

  // Create the application database if missing.
  const client = pg.getPgClient("postgres");
  await client.connect();
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (res.rowCount === 0) {
    await client.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`[dev-db] created database "${DB_NAME}"`);
  }
  await client.end();

  console.log(`[dev-db] ready — DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`);
}

main().catch((err) => {
  console.error("[dev-db] failed to start:", err);
  process.exit(1);
});
