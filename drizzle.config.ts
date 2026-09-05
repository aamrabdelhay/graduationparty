import { defineConfig } from "drizzle-kit";

function migrationDatabaseUrl(): string {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:55432/graduation_party";
  try {
    const url = new URL(raw);
    // Neon pooled URLs may carry startup options such as statement_timeout,
    // which are rejected by the pooler. Migrations should use DIRECT_URL when
    // available; otherwise remove only the unsupported startup-options value.
    url.searchParams.delete("options");
    return url.toString();
  } catch {
    return raw;
  }
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
