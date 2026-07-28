import playwright from '../node_modules/playwright/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects/befc15d1-a3c9-45e0-b5f4-140771194b96', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1500);
const text = await page.textContent('body');
console.log(JSON.stringify({
  hasPrimaryBadge: text.includes('primary'),
  hasArchiveAction: text.includes('Archive'),
  hasActiveGroup: text.includes('Active (1)'),
  hasArchivedGroup: text.includes('Archived (5)'),
}, null, 2));
await browser.close();
