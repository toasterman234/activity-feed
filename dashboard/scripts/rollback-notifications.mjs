import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const client = new Client({ connectionString });
await client.connect();

try {
  const sql = readFileSync(join(__dirname, "rollback-notifications.sql"), "utf-8");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("notification subsystem rolled back");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
