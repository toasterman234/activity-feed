import { chromium } from "playwright";

const url = process.env.FINANCE_URL ?? "https://ovh-vps.taila1553c.ts.net:8446/finance";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));

try {
  await page.goto(`${url}?qa=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Screener", exact: true }).waitFor();
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Screener", exact: true }).click();
  await page.getByRole("button", { name: "Run screen", exact: true }).waitFor();
  await page.getByRole("button", { name: "Run screen" }).click();
  await page.locator("tbody tr").first().waitFor({ timeout: 45_000 });
  pageErrors.length = 0;
  await page.locator("tbody tr").first().click();
  await page.getByText("Candidate snapshot", { exact: true }).waitFor({ timeout: 10_000 });
  await page.getByText("Why it may be wrong", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Open live chain", exact: true }).click();
  await page.getByText("Live option chain", { exact: true }).waitFor({ timeout: 10_000 });
  await page.locator(".fixed.inset-0 tbody tr").first().waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const compareBoxes = page.getByRole("checkbox", { name: /^Compare / });
  await compareBoxes.nth(0).check();
  await compareBoxes.nth(1).check();
  await page.getByText("Compare selected · 2", { exact: true }).waitFor();

  const crashed = await page.getByText("This page couldn’t load", { exact: false }).count();
  if (crashed || pageErrors.length) {
    throw new Error(`row click crashed: ${pageErrors.join("\n") || "error boundary visible"}`);
  }
  console.log("PASS screener inspect, compare, and live-chain flow");
} catch (error) {
  console.error("PAGE_ERRORS", pageErrors.join("\n"));
  console.error("BODY", (await page.locator("body").innerText()).slice(0, 3000));
  throw error;
} finally {
  await browser.close();
}
