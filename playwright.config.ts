import { defineConfig, devices } from "@playwright/test";

if (!process.env.DATABASE_URL?.match(/\/panaderia_e2e_[0-9a-f]{16}(?:\?|$)/) || !process.env.SEED_ADMIN_PASSWORD) {
  throw new Error("Usa npm run test:e2e para ejecutar Playwright en una base temporal.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  reporter: "list",
  forbidOnly: Boolean(process.env.CI),
  timeout: 55_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:15174",
    trace: "off",
  },
  webServer: [
    { command: "node server/dist/index.js", url: "http://127.0.0.1:13000/readyz", reuseExistingServer: false },
    { command: "node ../node_modules/vite/bin/vite.js", cwd: "./client", url: "http://127.0.0.1:15174/", reuseExistingServer: false },
  ],
});
