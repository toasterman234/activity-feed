import playwright from '../node_modules/playwright/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(2000);
const projectsText = await page.textContent('body');
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects/befc15d1-a3c9-45e0-b5f4-140771194b96', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(2000);
const detailText = await page.textContent('body');
console.log(JSON.stringify({
  hasOpenProject: projectsText.includes('Open project'),
  hasAiwgDocs: detailText.includes('AIWG docs'),
  hasWorkspace: detailText.includes('WORKSPACE.md'),
  hasActiveThread: detailText.includes('Open active thread'),
  hasPromotionHistory: detailText.includes('Promotion history'),
}, null, 2));
await browser.close();
