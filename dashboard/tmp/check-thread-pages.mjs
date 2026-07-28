import playwright from "../node_modules/playwright/index.js";

const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function snapshot(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2500);
  return await page.textContent("body");
}

const issuesText = await snapshot("https://ovh-vps.taila1553c.ts.net:8446/channels/b50301b6-2742-4546-97b4-0f604cee40cd");
const archivedText = await snapshot("https://ovh-vps.taila1553c.ts.net:8446/channels/00bb8005-af84-406c-a298-b90637e5273e/1d0be305-c548-4814-81ca-2bb98f3cbe69");

console.log(JSON.stringify({
  issuesCount: (issuesText.match(/Work: graph-continuity-b-c-d/g) || []).length,
  archivedBanner: archivedText.includes("This thread was promoted to a project and is now archived (read-only)."),
  promotedCard: archivedText.includes("Promoted to project") || archivedText.includes("View in Projects"),
}, null, 2));

await browser.close();
