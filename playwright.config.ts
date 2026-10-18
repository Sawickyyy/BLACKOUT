import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build (`next start`) in guest/local mode
// (no Supabase env vars), exercising the full client: terminal, engine,
// mission progress and localStorage persistence.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node_modules/.bin/next start -p 3100",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
