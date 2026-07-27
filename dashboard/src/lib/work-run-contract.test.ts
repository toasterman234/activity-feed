import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryWorkRun,
  canonicalJson,
  hashWorkRunConfig,
  isTerminalWorkRunStatus,
  leaseExpiry,
  registryAgentIdForHandle,
} from "./work-run-contract.ts";

test("configuration hashes are stable across object key order", () => {
  const left = {
    agentRegistryId: "agent:pi",
    model: "deepseek/v4",
    skills: ["debug", "test"],
    workflowTemplateVersion: 3,
  };
  const right = {
    workflowTemplateVersion: 3,
    skills: ["debug", "test"],
    model: "deepseek/v4",
    agentRegistryId: "agent:pi",
  };

  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(hashWorkRunConfig(left), hashWorkRunConfig(right));
});

test("channel handles resolve to stable Registry agent identities", () => {
  assert.equal(registryAgentIdForHandle("pi"), "agent:pi");
  assert.equal(registryAgentIdForHandle("claude-code"), "agent:claude");
  assert.equal(registryAgentIdForHandle("codex/gpt-5.4"), "agent:codex");
  assert.equal(registryAgentIdForHandle("cursor"), "agent:cursor");
  assert.equal(registryAgentIdForHandle("unknown-handle"), "agent:pi");
});

test("retry is limited to failed or interrupted attempts below the cap", () => {
  assert.equal(canRetryWorkRun("failed", 1, 3), true);
  assert.equal(canRetryWorkRun("interrupted", 2, 3), true);
  assert.equal(canRetryWorkRun("failed", 3, 3), false);
  assert.equal(canRetryWorkRun("succeeded", 1, 3), false);
});

test("terminal and lease rules are conservative", () => {
  assert.equal(isTerminalWorkRunStatus("succeeded"), true);
  assert.equal(isTerminalWorkRunStatus("cancelled"), true);
  assert.equal(isTerminalWorkRunStatus("failed"), false);
  assert.equal(leaseExpiry(new Date("2026-07-27T00:00:00.000Z"), 60_000), "2026-07-27T00:01:00.000Z");
  assert.throws(() => leaseExpiry(new Date(), 0), /positive finite/);
});
