import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(root, "ops/migrations/005-iii-session-binds.sql");

const client = new Client({ connectionString });
await client.connect();
try {
  const sql = await readFile(sqlPath, "utf8");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("iii_session_binds schema applied");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
