import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "onboarding.spec.ts",
  use: { baseURL: "http://localhost:8082", trace: "retain-on-failure" },
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
  ],
  webServer: {
    command: "npm run web -w @settleup/mobile -- --port 8082",
    env: {
      EXPO_PUBLIC_DEMO: "false",
      EXPO_PUBLIC_API_URL: "http://localhost:4000",
    },
    url: "http://localhost:8082",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
