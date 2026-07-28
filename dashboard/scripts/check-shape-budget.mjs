#!/usr/bin/env node
// Guardrail for ADR-001 / ADR-003: live Electric shapes hold HTTP/1.1
// long-poll connections (~6 per origin over plain HTTP). This check fails the
// build when code reintroduces the connection-starvation bug:
//
//   Rule 1: every `client.shape(` call must be inside an `acquireShape`
//           factory (the refcounted registry that closes streams on unmount).
//   Rule 2: no single file may reference more than SHAPE_BUDGET distinct
//           shape keys / getters — a page holding more starves navigation.
//
// If Rule 2 fires, do NOT raise the budget: combine shapes, or poll with
// `client.query()` (see useThreadExtras in src/app/channels/shapes.ts).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const SHAPE_BUDGET = 4;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const errors = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");

  // Rule 1 — bare client.shape() outside an acquireShape factory.
  // (The registry itself only mentions client.shape in comments.)
  const isRegistry = rel.endsWith("shape-registry.ts");
  for (const match of isRegistry ? [] : text.matchAll(/client\.shape\(/g)) {
    const before = text.slice(Math.max(0, match.index - 800), match.index);
    if (!/acquireShape\(/.test(before)) {
      const line = text.slice(0, match.index).split("\n").length;
      errors.push(
        `${rel}:${line} — client.shape() outside acquireShape(). ` +
          `All live shapes must go through src/app/shape-registry.ts (ADR-001).`,
      );
    }
  }

  // Rule 2 — per-file live-shape budget.
  const keys = new Set(
    [...text.matchAll(/acquireShape\(\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  const getters = new Set(
    [...text.matchAll(/\b(get\w+Shape)\s*\(/g)]
      .map((m) => m[1])
      .filter((name) => name !== "getCacheKeyForURL"),
  );
  const count = Math.max(keys.size, getters.size);
  if (count > SHAPE_BUDGET) {
    errors.push(
      `${rel} — references ${count} live shapes (budget ${SHAPE_BUDGET}): ` +
        `${[...(keys.size >= getters.size ? keys : getters)].join(", ")}. ` +
        `Combine shapes or poll via client.query() instead (ADR-003).`,
    );
  }
}

if (errors.length > 0) {
  console.error("✕ shape-budget check failed:\n");
  for (const e of errors) console.error("  " + e);
  console.error(
    "\nBackground: docs/decisions/ADR-001-shape-stream-lifecycle.md and ADR-003.",
  );
  process.exit(1);
}
console.log("✓ shape-budget check passed (budget: " + SHAPE_BUDGET + " live shapes/page)");
