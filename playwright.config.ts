import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './tests', testMatch: 'browser.spec.ts', fullyParallel: false,
 use: { baseURL: 'http://localhost:8081', trace: 'retain-on-failure', reducedMotion: 'reduce' },
 projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }, { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
 webServer: { command: 'npm run dev', url: 'http://localhost:8081', reuseExistingServer: true, timeout: 120000 },
});
