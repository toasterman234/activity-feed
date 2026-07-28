import playwright from "../node_modules/playwright/index.js";

const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://ovh-vps.taila1553c.ts.net:8446/channels/b50301b6-2742-4546-97b4-0f604cee40cd", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(3000);
const text = await page.textContent("body");
console.log(JSON.stringify({ count: (text.match(/Work: graph-continuity-b-c-d/g) || []).length, excerpt: text.slice(0, 900) }, null, 2));
await browser.close();
