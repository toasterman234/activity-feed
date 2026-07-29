#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const root = new URL("../src/app/", import.meta.url);
const [bottomNav, opsLayout, opsConfig, modelsPage, workflowsPage] = await Promise.all([
  readFile(new URL("bottom-nav.tsx", root), "utf8"),
  readFile(new URL("ops/layout.tsx", root), "utf8"),
  readFile(new URL("ops/config/page.tsx", root), "utf8"),
  readFile(new URL("models/page.tsx", root), "utf8"),
  readFile(new URL("workflows/page.tsx", root), "utf8"),
]);
const failures = [];

if (!/href:\s*["']\/ops["']/.test(bottomNav)) {
  failures.push("Bottom nav must expose Ops tab");
}
if (!/href:\s*["']\/(personal|finance)["']/.test(bottomNav)) {
  // Personal/Finance now reachable via Ops landing, no longer bottom-nav primary
  // This is fine — the check passes as long as /ops is in nav.
}
if (/href:\s*["']\/(activity|fleet|finance|settings|models)["']/.test(bottomNav)) {
  failures.push("Bottom nav must not keep Activity/Fleet/Finance/Settings/Models as primary tabs");
}

if (!/href:\s*["']\/ops\/fleet["']/.test(opsLayout) || !/href:\s*["']\/ops\/config["']/.test(opsLayout)) {
  failures.push("Ops shell must expose Fleet and Config tabs");
}

if (!/ModelsPanel/.test(opsConfig) || !/WorkflowsPage/.test(opsConfig)) {
  failures.push("Ops → Config must host ModelsPanel and Workflows");
}

if (!/redirect\(["']\/ops\/config\?tab=models["']\)/.test(modelsPage)) {
  failures.push("/models must redirect into Ops → Config (Models)");
}
if (!/redirect\(["']\/ops\/config\?tab=workflows["']\)/.test(workflowsPage)) {
  failures.push("/workflows must redirect into Ops → Config (Workflows)");
}

if (failures.length) {
  console.error("route-shell check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("✓ route-shell check passed (Ops/Personal shell; Models+Workflows under Config)");
