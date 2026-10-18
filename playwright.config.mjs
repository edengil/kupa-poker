import { defineConfig, devices } from "@playwright/test";

// פורט ייעודי לבדיקות קצה — 3000 תפוס לעיתים ע"י שרתים אחרים במכונת הפיתוח
const PORT = Number(process.env.E2E_PORT || 3100);

/**
 * בדיקות מקצה לקצה מול /preview (ללא Supabase / וואטסאפ).
 * מריצות next dev — NODE_ENV=development → /preview פתוח.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "he-IL",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/preview`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
