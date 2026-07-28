import playwright from '../node_modules/playwright/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects/befc15d1-a3c9-45e0-b5f4-140771194b96', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1500);
const marker = 'project composer verification';
await page.fill('textarea', marker);
await Promise.all([
  page.waitForURL(/\/channels\//),
  page.click('button:text("Start working")')
]);
await page.waitForTimeout(1500);
const text = await page.textContent('body');
console.log(JSON.stringify({
  url: page.url(),
  hasMessage: text.includes(marker),
  hasWorking: text.includes('_working') || text.includes('working…'),
}, null, 2));
await browser.close();
