import playwright from '../node_modules/playwright/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://ovh-vps.taila1553c.ts.net:8446/projects/befc15d1-a3c9-45e0-b5f4-140771194b96', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1500);
const text = await page.textContent('body');
console.log(JSON.stringify({
  hasProjectPhase: text.includes('Project phase'),
  hasExecution: text.includes('Execution'),
  hasRecommendedNext: text.includes('Recommended next move:'),
  hasRecommendedLifecycle: text.includes('issue') || text.includes('planning') || text.includes('coding') || text.includes('research'),
}, null, 2));
await browser.close();
