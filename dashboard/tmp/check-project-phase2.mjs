import playwright from '../node_modules/playwright/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1500);
const projectsText = await page.textContent('body');
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects/befc15d1-a3c9-45e0-b5f4-140771194b96', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1500);
const detailText = await page.textContent('body');
console.log(JSON.stringify({
  hasNewWorkThreadOnList: projectsText.includes('New work thread'),
  hasNewWorkThreadOnDetail: detailText.includes('New work thread'),
  hasActiveGroup: detailText.includes('Active ('),
  hasArchivedGroup: detailText.includes('Archived ('),
}, null, 2));
await browser.close();
