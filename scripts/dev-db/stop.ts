/**
 * Stop the local embedded PostgreSQL server (development/tests only).
 * Usage: npm run db:stop
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

async function main() {
  const pidFile = path.resolve(process.cwd(), ".pgdata/postmaster.pid");
  if (!existsSync(pidFile)) {
    console.log("[dev-db] no running cluster found (no postmaster.pid)");
    return;
  }
  const content = await readFile(pidFile, "utf8");
  const pid = Number(content.split("\n")[0]);
  if (!pid || Number.isNaN(pid)) {
    console.log("[dev-db] could not parse postmaster.pid");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`[dev-db] sent SIGTERM to postgres (pid ${pid})`);
  } catch {
    console.log("[dev-db] process not running");
  }
  // Wait briefly and remove stale lock if still present.
  await new Promise((r) => setTimeout(r, 1500));
  if (existsSync(pidFile)) {
    try {
      execSync(`rm -f "${pidFile}"`);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error("[dev-db] stop failed:", err);
  process.exit(1);
});
