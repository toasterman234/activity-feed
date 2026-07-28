import assert from "node:assert/strict";
import test from "node:test";
import { collectProjectGrounding, evaluatePlanApproval } from "./plan-review-guard.ts";

test("Activity Dashboard grounding reports its real database and service worker", async () => {
  const grounding = await collectProjectGrounding(process.cwd());

  assert.equal(grounding.database, "PostgreSQL (pg)");
  assert.equal(grounding.serviceWorker, "src/app/sw.ts (Serwist)");
  assert.equal(grounding.prismaSchema, false);
  assert.ok(grounding.evidence.includes("package.json"));
});

test("a plan with unresolved architecture decisions cannot be approved", () => {
  const result = evaluatePlanApproval({
    decisionsNeeded: ["Choose the delivery mechanism"],
    groundingEvidence: ["package.json shows pg"],
    unverifiedAssumptions: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.error || "", /Resolve 1 open decision/);
});

test("a grounded plan with no open decisions can be approved", () => {
  assert.deepEqual(
    evaluatePlanApproval({
      decisionsNeeded: [],
      groundingEvidence: ["package.json shows pg"],
      unverifiedAssumptions: [],
    }),
    { ok: true },
  );
});

test("a plan without grounding evidence cannot be approved", () => {
  const result = evaluatePlanApproval({
    decisionsNeeded: [],
    groundingEvidence: [],
    unverifiedAssumptions: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.error || "", /grounding evidence/i);
});
