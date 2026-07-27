import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  claimNextWorkRun,
  finishWorkRun,
  getWorkRun,
  heartbeatWorkRun,
  interruptExpiredWorkRuns,
  listThreadWorkRuns,
  queueWorkRun,
  startWorkRun,
} from "./work-runs.ts";

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

test("a request-bound worker can start only its queued attempt", { skip: !connectionString }, async () => {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");
  try {
    const queued = await queueWorkRun(client, {
      idempotencyKey: `test:${crypto.randomUUID()}`,
      threadId: crypto.randomUUID(),
      channelId: crypto.randomUUID(),
      stageId: "open",
      agent: { agentRegistryId: "agent:pi" },
    });
    const started = await startWorkRun(client, {
      runId: queued.id,
      workerId: "dashboard:test",
      workerHost: "test-host",
      now: new Date("2026-07-27T00:00:00.000Z"),
    });

    assert.equal(started?.id, queued.id);
    assert.equal(started?.status, "running");
    assert.equal(
      await startWorkRun(client, {
        runId: queued.id,
        workerId: "dashboard:other",
        workerHost: "other-host",
      }),
      null,
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("workers claim, renew, finish, and interrupt expired attempts", { skip: !connectionString }, async () => {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");
  try {
    const threadId = crypto.randomUUID();
    const queued = await queueWorkRun(client, {
      idempotencyKey: `test:${crypto.randomUUID()}`,
      threadId,
      channelId: crypto.randomUUID(),
      stageId: "in_progress",
      agent: { agentRegistryId: "agent:pi" },
    });
    const startedAt = new Date("2026-07-27T00:00:00.000Z");
    const claimed = await claimNextWorkRun(client, {
      workerId: "worker:test",
      workerHost: "test-host",
      leaseMs: 60_000,
      now: startedAt,
    });
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.status, "running");

    const renewed = await heartbeatWorkRun(client, {
      runId: queued.id,
      workerId: "worker:test",
      leaseMs: 120_000,
      now: new Date("2026-07-27T00:00:30.000Z"),
    });
    assert.ok(renewed?.lease_expires_at);
    assert.equal(renewed.lease_expires_at.toISOString(), "2026-07-27T00:02:30.000Z");

    const finished = await finishWorkRun(client, {
      runId: queued.id,
      workerId: "worker:test",
      status: "succeeded",
      resultPayload: { replyMessageId: "message:test" },
      now: new Date("2026-07-27T00:01:00.000Z"),
    });
    assert.equal(finished?.status, "succeeded");

    const stale = await queueWorkRun(client, {
      idempotencyKey: `test:${crypto.randomUUID()}`,
      threadId,
      channelId: crypto.randomUUID(),
      stageId: "in_progress",
      agent: { agentRegistryId: "agent:pi" },
    });
    await claimNextWorkRun(client, {
      workerId: "worker:stale",
      workerHost: "test-host",
      leaseMs: 1_000,
      now: startedAt,
    });
    const interrupted = await interruptExpiredWorkRuns(
      client,
      new Date("2026-07-27T00:00:02.000Z"),
    );
    assert.equal(interrupted.some((run) => run.id === stale.id), true);
    assert.equal((await getWorkRun(client, stale.id))?.status, "interrupted");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
