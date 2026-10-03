import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:8081",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    {
      name: "compact-phone",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 320, height: 568 },
      },
    },
  ],
  webServer: {
    command: "npm run web -w @settleup/mobile -- --clear",
    env: { EXPO_NO_DOTENV: "1", EXPO_PUBLIC_DEMO: "true" },
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
