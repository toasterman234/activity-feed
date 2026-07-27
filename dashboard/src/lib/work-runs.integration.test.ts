import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { getWorkRun, listThreadWorkRuns, queueWorkRun } from "./work-runs.ts";

const connectionString = process.env.WORK_RUN_TEST_DB_URL;

test("queueWorkRun is idempotent and queryable by thread", { skip: !connectionString }, async () => {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");
  try {
    const input = {
      idempotencyKey: `test:${crypto.randomUUID()}`,
      threadId: crypto.randomUUID(),
      channelId: crypto.randomUUID(),
      stageId: "triaged",
      repoId: crypto.randomUUID(),
      agent: {
        agentRegistryId: "agent:pi",
        agentVersion: "test",
        model: "test-model",
        workflowTemplateId: "issue",
        workflowTemplateVersion: 3,
      },
      requestPayload: { promptRef: "test" },
    };
    const first = await queueWorkRun(client, input);
    const second = await queueWorkRun(client, input);

    assert.equal(second.id, first.id);
    assert.equal(first.status, "queued");
    assert.equal(first.config_hash.length, 64);
    assert.equal((await getWorkRun(client, first.id))?.thread_id, input.threadId);
    assert.equal((await listThreadWorkRuns(client, input.threadId)).length, 1);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

