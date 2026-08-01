import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3011";
const artifactRoot = "tmp-qa/mobile-qa";

const mobileProjects: PlaywrightTestConfig["projects"] = [
  {
    name: "webkit-320x568",
    use: { browserName: "webkit", viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  },
  {
    name: "webkit-375x667",
    use: { browserName: "webkit", viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  },
  {
    name: "webkit-390x844",
    use: { browserName: "webkit", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  },
  {
    name: "webkit-393x852",
    use: { browserName: "webkit", viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  },
  {
    name: "webkit-430x932",
    use: { browserName: "webkit", viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  },
  {
    name: "chromium-390x844",
    use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  },
];

export default defineConfig({
  testDir: "./tests/mobile",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: `${artifactRoot}/html-report`, open: "never" }],
    ["json", { outputFile: `${artifactRoot}/results.json` }],
  ],
  outputDir: `${artifactRoot}/test-results`,
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/New_York",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  webServer: {
    command: "npm run dev:tailscale",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: mobileProjects,
});
