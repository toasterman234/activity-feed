import playwright from '../node_modules/playwright/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1500);
const text = await page.textContent('body');
console.log(JSON.stringify({
  hasSummaryStrip: text.includes('active work threads') && text.includes('AIWG scaffolded'),
  hasCardActive: text.includes('1 active'),
  hasCardArchived: text.includes('5 archived'),
  hasCardAiwg: text.includes('AIWG'),
}, null, 2));
await browser.close();
