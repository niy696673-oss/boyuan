import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4184";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./node_modules/.cache/boyuan-playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/playwright-server.mjs",
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
