import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export const ARTIFACT_ROOT = path.resolve(process.cwd(), "tmp-qa/mobile-qa");

export const CORE_ROUTES = [
  "/mobile-v2",
  "/mobile-v2/inbox",
  "/mobile-v2/projects",
  "/mobile-v2/ops",
  "/mobile-v2/fleet",
  "/mobile-v2/registry",
  "/mobile-v2/runs",
  "/mobile-v2/config",
] as const;

export function routeSlug(route: string) {
  return route.replace(/^\//, "").replace(/\//g, "__") || "root";
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
}

export async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    `,
  });
}

function selectorFor(el: Element) {
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
  const className = typeof (el as HTMLElement).className === "string"
    ? "." + (el as HTMLElement).className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
    : "";
  return `${el.tagName.toLowerCase()}${id}${className}`;
}

export async function collectLayoutAudit(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);

    const visible = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });

    const overflowElements = visible
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          selector: (() => {
            const id = el.id ? `#${el.id}` : "";
            const className = typeof el.className === "string"
              ? "." + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
              : "";
            return `${el.tagName.toLowerCase()}${id}${className}`;
          })(),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.left < -1 || item.right > viewportWidth + 1)
      .slice(0, 15);

    const touchTargets = visible
      .filter((el) => el.matches("a, button, input, select, textarea, [role='button'], [role='tab'], [data-slot='select-trigger']"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          selector: (() => {
            const id = el.id ? `#${el.id}` : "";
            const className = typeof el.className === "string"
              ? "." + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
              : "";
            return `${el.tagName.toLowerCase()}${id}${className}`;
          })(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.width < 44 || item.height < 44)
      .slice(0, 20);

    const clippedText = visible
      .filter((el) => el.matches("p, span, a, button, h1, h2, h3, h4, h5, h6, div"))
      .map((el) => ({
        selector: (() => {
          const id = el.id ? `#${el.id}` : "";
          const className = typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
            : "";
          return `${el.tagName.toLowerCase()}${id}${className}`;
        })(),
        text: (el.textContent || "").trim().slice(0, 80),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }))
      .filter((item) => item.text.length > 20 && item.scrollWidth > item.clientWidth + 4)
      .slice(0, 20);

    return {
      viewportWidth,
      viewportHeight,
      scrollWidth,
      scrollHeight,
      hasHorizontalOverflow: scrollWidth > viewportWidth + 1,
      overflowElements,
      touchTargets,
      clippedText,
    };
  });
}

export async function writeAudit(testInfo: TestInfo, slug: string, audit: unknown) {
  const auditDir = path.join(ARTIFACT_ROOT, "audits", testInfo.project.name);
  await ensureDir(auditDir);
  await fs.writeFile(path.join(auditDir, `${slug}.json`), JSON.stringify(audit, null, 2));
}

export async function captureRouteArtifacts(page: Page, testInfo: TestInfo, slug: string) {
  const dir = path.join(ARTIFACT_ROOT, "screenshots", testInfo.project.name, slug);
  await ensureDir(dir);
  await page.screenshot({ path: path.join(dir, "viewport.png") });
  await page.screenshot({ path: path.join(dir, "full-page.png"), fullPage: true });
}

export async function expectStableScreenshot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name, { fullPage: false });
}

export async function openSidebarIfPresent(page: Page) {
  const menuButton = page.getByRole("button").filter({ has: page.locator("svg") }).first();
  if (await menuButton.isVisible().catch(() => false)) {
    await menuButton.click();
    await page.waitForTimeout(250);
  }
}

export async function followFirstLink(locator: Locator) {
  const count = await locator.count();
  if (count === 0) return null;
  const href = await locator.first().getAttribute("href");
  if (!href) return null;
  return href;
}
