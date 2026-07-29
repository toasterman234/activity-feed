import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const client = new Client({ connectionString });
await client.connect();

try {
  const sql = readFileSync(join(__dirname, "..", "ops", "migrations", "006-notifications.sql"), "utf-8");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("notification subsystem schema applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
