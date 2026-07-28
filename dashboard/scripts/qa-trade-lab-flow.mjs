import { chromium } from "playwright";

const url = process.env.FINANCE_URL ?? "https://ovh-vps.taila1553c.ts.net:8446/finance";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => {
  const detail = error.stack || error.message;
  if (detail && !detail.includes("Failed to register a ServiceWorker")) pageErrors.push(detail);
});

try {
  await page.goto(`${url}?qa-trade=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Screener", exact: true }).waitFor();
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Screener", exact: true }).click();
  await page.getByRole("button", { name: "Run screen", exact: true }).click();
  await page.locator("tbody tr").first().waitFor({ timeout: 45_000 });
  await page.locator("tbody tr").first().click();
  await page.getByRole("button", { name: "Create trade", exact: true }).click();
  await page.getByText("Trade Lab · paper only", { exact: true }).waitFor();
  await page.getByText("Expiration payoff", { exact: true }).waitFor();
  await page.getByRole("radio", { name: /^Select / }).first().waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Save paper plan", exact: true }).click();
  await page.getByText("Paper plan saved locally.", { exact: true }).waitFor();

  const plans = await page.evaluate(() => JSON.parse(localStorage.getItem("finance-paper-trade-plans-v1") ?? "[]"));
  if (!plans.length || plans[0].structure !== "csp" || !plans[0].contractSymbol) {
    throw new Error("saved paper plan is incomplete");
  }
  if (process.env.TRADE_LAB_SCREENSHOT) {
    await page.getByText("Expiration payoff", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.TRADE_LAB_SCREENSHOT, fullPage: false });
  }
  if (pageErrors.length) {
    throw new Error(`Trade Lab crashed: ${pageErrors.join("\n")}`);
  }
  console.log("PASS candidate creates analyzed CSP paper plan");
} catch (error) {
  console.error("PAGE_ERRORS", pageErrors.join("\n"));
  console.error("BODY", (await page.locator("body").innerText()).slice(0, 4000));
  throw error;
} finally {
  await browser.close();
}
