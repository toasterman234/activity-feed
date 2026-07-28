import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;
const connectionString =
  process.env.ACTIVITY_DB_URL ||
  "postgres://activity:activity@localhost:5433/activity_log";

const releaseId = process.env.DEPLOY_RELEASE_ID || "";
const gitSha = process.env.DEPLOY_GIT_SHA || "";
const dirty = process.env.DEPLOY_DIRTY === "true";
const actor = process.env.DEPLOY_ACTOR || "deploy";

if (!releaseId) {
  console.warn("emit-deploy-graph-event: DEPLOY_RELEASE_ID missing; skip");
  process.exit(0);
}

const client = new Client({ connectionString });
await client.connect();
try {
  const id = randomUUID();
  await client.query(
    `INSERT INTO graph_events (id, channel_id, thread_id, kind, actor, payload, caused_by, created_at)
     VALUES ($1, 'ops', NULL, 'deploy.activated', $2, $3, NULL, $4)`,
    [
      id,
      actor,
      JSON.stringify({ releaseId, gitSha, dirty }),
      new Date().toISOString(),
    ],
  );
  console.log(`deploy graph event written: ${releaseId}`);
} finally {
  await client.end();
}
