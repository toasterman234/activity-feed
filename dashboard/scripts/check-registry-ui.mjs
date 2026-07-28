#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const target = process.argv[2] || "https://ovh-vps.taila1553c.ts.net:8446/fleet";
const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const shellDir = readdirSync(cache)
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .at(-1);
const executablePath = shellDir
  ? join(cache, shellDir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell")
  : undefined;

if (!executablePath || !existsSync(executablePath)) {
  throw new Error("No installed Playwright Chromium headless shell found.");
}

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Registry", exact: true }).click();
  await page.getByText(/normalized records/).waitFor();

  for (const kind of ["Skill", "Tool", "Toolset"]) {
    await page.getByRole("button", { name: new RegExp(`^${kind} \\d+$`) }).click();
    await page.waitForFunction(
      (expected) => {
        const active = document.querySelector("[data-active-kind]")?.getAttribute("data-active-kind");
        const badges = [...document.querySelectorAll("button.grid > span:last-child")].map((node) => node.textContent);
        return active === expected && badges.length > 0 && badges.every((badge) => badge === expected);
      },
      kind,
    );
    const badges = await page.locator("button.grid > span:last-child").allTextContents();
    if (!badges.length) throw new Error(`${kind}: no visible registry rows`);
    const wrong = badges.filter((badge) => badge !== kind);
    if (wrong.length) throw new Error(`${kind}: visible rows included ${[...new Set(wrong)].join(", ")}`);
  }

  await page.getByRole("button", { name: /^Agent \d+$/ }).click();
  await page.locator('[data-registry-id="agent:pi"]').waitFor();
  await page.locator('[data-registry-id="agent:claude"]').waitFor();
  const primarySystems = await page.locator('[data-active-kind="Agent"] > [data-registry-id]').count();
  if (primarySystems !== 2) throw new Error(`Agent view: expected 2 primary systems, saw ${primarySystems}`);
  await page.locator('[data-registry-id="agent:claude"]').click();
  await page.getByRole("heading", { name: "Agents", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Tools", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Skills", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Models", exact: true }).waitFor();
  await page.getByText("Evidence & evolution", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Eval suites", exact: true }).click();
  await page.getByText("Golden Incidents", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Improve", exact: true }).click();
  await page.getByText("Candidate changes require review", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: /^Tool \d+$/ }).click();
  await page.locator('[data-registry-id="tool:github"]').click();
  await page.getByRole("heading", { name: "Agents tied to this", exact: true }).waitFor();
  await page.goto(new URL("/activity?tab=collections", target).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Collections", exact: true }).waitFor();
  await page.getByText("Golden Incidents", { exact: true }).waitFor();
  console.log("registry pill filtering: PASS");
  console.log("registry bidirectional details: PASS");
  console.log("registry agent evidence: PASS");
  console.log("registry eval-set destination: PASS");
} finally {
  await browser.close();
}
