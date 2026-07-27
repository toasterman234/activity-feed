#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const root = new URL("../src/app/", import.meta.url);
const [modelsPage, bottomNav, settingsLayout] = await Promise.all([
  readFile(new URL("models/page.tsx", root), "utf8"),
  readFile(new URL("bottom-nav.tsx", root), "utf8"),
  readFile(new URL("settings/layout.tsx", root), "utf8"),
]);
const failures = [];

if (!/import\s+\{\s*ModelsPanel\s*\}/.test(modelsPage) || !/<ModelsPanel\s*\/>/.test(modelsPage)) {
  failures.push("/models must render ModelsPanel directly");
}
if (/redirect\(["']\/activity/.test(modelsPage)) {
  failures.push("/models must not redirect to /activity");
}

const navigationShell = `${bottomNav}\n${settingsLayout}`;
if (!/href:\s*["']\/workflows["']/.test(navigationShell)) {
  failures.push("Workflow registry must be reachable from a visible navigation shell");
}

if (failures.length) {
  console.error("route-shell check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("✓ route-shell check passed (distinct Models page; Workflows discoverable)");
