import assert from "node:assert/strict";
import test from "node:test";
import { workRunBranch } from "./worktree-manager.ts";

test("work-run branches are stable, bounded, and use the codex namespace", () => {
  assert.equal(
    workRunBranch("A5B7E229-8C40-4E83-919B-1689D30E917B"),
    "codex/work-run-a5b7e2298c404e83",
  );
});

test("work-run branch creation rejects unusable identifiers", () => {
  assert.throws(() => workRunBranch("---"), /letters or numbers/);
});
