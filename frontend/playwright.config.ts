import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "..\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: path.resolve(import.meta.dirname, "../backend"),
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
      env: { DATA_DIR: path.resolve(import.meta.dirname, "../.playwright-data") },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      cwd: path.resolve(import.meta.dirname),
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
