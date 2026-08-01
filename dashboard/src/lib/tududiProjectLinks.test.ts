import assert from "node:assert/strict";
import test from "node:test";
import { collectRepoHints, resolveLinkedRepos } from "./tududiProjectLinks.ts";

test("collects repo hints from conventions and AD pointers", () => {
  const hints = collectRepoHints([
    { note: "[repo:activity-feed]\nsee also ad:repo:abc-123", repo: null },
    { note: "plain", repo: "other-proj" },
  ]);
  assert.ok(hints.includes("activity-feed"));
  assert.ok(hints.includes("abc-123"));
  assert.ok(hints.includes("other-proj"));
});

test("resolves linked repos and leaves orphans unmatched", () => {
  const linked = resolveLinkedRepos(
    [
      { note: "[repo:activity-feed]", repo: null },
      { note: "ad:repo:abc-123", repo: null },
    ],
    [
      { id: "abc-123", name: "activity-feed", path: "/home/ubuntu/activity-feed" },
      { id: "orphan", name: "lonely", path: "/tmp/lonely" },
    ],
  );
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, "abc-123");
  assert.ok(!linked.some((r) => r.id === "orphan"));
});

test("matches repos by path basename", () => {
  const linked = resolveLinkedRepos(
    [{ note: "[repo:chorus]", repo: null }],
    [{ id: "r1", name: "something-else", path: "/Users/ben/Projects/chorus" }],
  );
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, "r1");
});
