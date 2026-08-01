import { test, expect, type Page, type TestInfo } from "@playwright/test";
import {
  captureRouteArtifacts,
  collectLayoutAudit,
  CORE_ROUTES,
  expectStableScreenshot,
  followFirstLink,
  freezeMotion,
  routeSlug,
  settle,
  writeAudit,
} from "./helpers";

async function auditCurrentPage(page: Page, testInfo: TestInfo, slug: string) {
  await freezeMotion(page);
  await settle(page);
  const audit = await collectLayoutAudit(page);
  await writeAudit(testInfo, slug, audit);
  await captureRouteArtifacts(page, testInfo, slug);
  expect(audit.hasHorizontalOverflow, `${slug} has horizontal overflow`).toBeFalsy();
  await expectStableScreenshot(page, `${slug}.png`);
}

test.describe.configure({ mode: "serial" });

test("mobile shell drawer opens and closes", async ({ page }, testInfo) => {
  await page.goto("/mobile-v2");
  await settle(page);
  const menu = page.locator("header button").first();
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(500);
    const sheet = page.locator('[data-slot="sheet-content"]');
    await captureRouteArtifacts(page, testInfo, "mobile-shell-drawer-open");
    if (await sheet.isVisible().catch(() => false)) {
      const inboxLink = sheet.getByRole("link", { name: "Inbox" });
      if (await inboxLink.isVisible().catch(() => false)) {
        await inboxLink.click();
        await expect(page).toHaveURL(/\/mobile-v2\/inbox$/);
      }
    }
  }
});

for (const route of CORE_ROUTES) {
  test(`route audit ${route}`, async ({ page }, testInfo) => {
    await page.goto(route);
    await auditCurrentPage(page, testInfo, routeSlug(route));
  });
}

test("inbox focused input state", async ({ page }, testInfo) => {
  await page.goto("/mobile-v2/inbox");
  await settle(page);
  const input = page.getByPlaceholder("Search").first();
  await input.click();
  await input.fill("research");
  await auditCurrentPage(page, testInfo, "mobile-v2__inbox-search-focus");
});

test("inbox channel detail and thread detail", async ({ page }, testInfo) => {
  await page.goto("/mobile-v2/inbox");
  await settle(page);

  const channelHref = await page.evaluate(async () => {
    const [overviewRes, activityRes] = await Promise.all([
      fetch("/api/home/overview", { cache: "no-store" }).then((res) => res.json().catch(() => null)),
      fetch("/api/channels/activity?viewer=you", { cache: "no-store" }).then((res) => res.json().catch(() => null)),
    ]);

    const issues = (overviewRes?.channels || []).find((item: { channelName?: string; channelId?: string }) => /issues/i.test(item.channelName || ""));
    if (issues?.channelId) return `/mobile-v2/inbox/${issues.channelId}`;

    const first = (activityRes?.channels || []).find((item: { channelId?: string }) => !!item.channelId);
    return first?.channelId ? `/mobile-v2/inbox/${first.channelId}` : null;
  });

  test.skip(!channelHref, "No channel detail links available");
  await page.goto(channelHref!);
  await auditCurrentPage(page, testInfo, routeSlug(channelHref!));

  const allTab = page.getByRole("tab", { name: /^All$/i });
  if (await allTab.isVisible().catch(() => false)) {
    await allTab.click();
    await auditCurrentPage(page, testInfo, `${routeSlug(channelHref!)}__all-tab`);
  }

  const threadHref = await followFirstLink(page.locator('a[href^="/mobile-v2/inbox/"][href*="/"]').filter({ hasText: /./ }));
  if (!threadHref || threadHref === channelHref) return;
  await page.goto(threadHref);
  await auditCurrentPage(page, testInfo, routeSlug(threadHref));
});

test("projects tududi project detail", async ({ page }, testInfo) => {
  await page.goto("/mobile-v2/projects");
  await settle(page);
  const projectHref = await followFirstLink(page.locator('a[href^="/mobile-v2/projects/tududi/"]'));
  test.skip(!projectHref, "No Tududi project links available");
  await page.goto(projectHref!);
  await auditCurrentPage(page, testInfo, routeSlug(projectHref!));
});


test("projects selection does not flash fake empty state", async ({ page }) => {
  await page.route("**/api/tududi?project_uid=*", async (route) => {
    await page.waitForTimeout(900);
    await route.continue();
  });

  await page.goto("/mobile-v2/projects");
  await settle(page);

  const projectCount = page.getByText(/projects$/i).first();
  await expect(projectCount).not.toHaveText(/^0 projects$/i, { timeout: 15000 });

  const projectButton = page.locator("button").filter({ hasText: /Ops \/ Incidents/i }).first();
  await expect(projectButton).toBeVisible();
  await projectButton.click();

  await expect(page.getByText("Loading tasks…").first()).toBeVisible();
  await expect(page.getByText("No tasks in this project yet.")).toHaveCount(0);

  await expect(page.getByText("View all tasks").first()).toBeVisible();
  await expect(page.getByText(/6 open/).first()).toBeVisible();
});

test("portfolio analytics income tab loads", async ({ page }, testInfo) => {
  await page.goto("/personal");
  await settle(page);

  // Click the Analytics tab
  const analyticsTab = page.getByRole("button", { name: "Analytics" });
  await expect(analyticsTab).toBeVisible();
  await analyticsTab.click();
  await settle(page);

  // Verify the Income sub-tab renders
  await expect(page.getByText("Net Daily Theta")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Realized P&L")).toBeVisible();

  // Audit layout
  await auditCurrentPage(page, testInfo, "personal__analytics-income");

  // Click Risk sub-tab
  const riskTab = page.getByRole("button", { name: "Risk" });
  await riskTab.click();
  await settle(page);
  await expect(page.getByText("Risk Status")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Stress Test Matrix")).toBeVisible();

  // Audit risk view layout
  await auditCurrentPage(page, testInfo, "personal__analytics-risk");
});
