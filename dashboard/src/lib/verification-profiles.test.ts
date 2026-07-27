import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVerificationCommands } from "./verification-profiles.ts";

test("verification commands are normalized with required checks by default", () => {
  assert.deepEqual(
    normalizeVerificationCommands([
      { key: "unit", label: "Unit tests", command: "npm test" },
      { key: "lint", label: "Lint", command: "npm run lint", required: false },
    ]),
    [
      { key: "unit", label: "Unit tests", command: "npm test", required: true },
      { key: "lint", label: "Lint", command: "npm run lint", required: false },
    ],
  );
});

test("verification command keys are unique and shell commands cannot be blank", () => {
  assert.throws(
    () => normalizeVerificationCommands([{ key: "bad key", label: "Bad", command: "true" }]),
    /invalid key/,
  );
  assert.throws(
    () =>
      normalizeVerificationCommands([
        { key: "test", label: "One", command: "true" },
        { key: "test", label: "Two", command: "true" },
      ]),
    /duplicate command key/,
  );
  assert.throws(
    () => normalizeVerificationCommands([{ key: "test", label: "Test", command: " " }]),
    /requires label and command/,
  );
});
