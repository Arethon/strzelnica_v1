import { defineConfig, devices } from "@playwright/test";

// Ten ticket dostarcza wyłącznie infrastrukturę Playwright (uruchamianie,
// dev server, przeglądarka) — właściwy flow rezerwacji e2e przychodzi z
// kolejnym ticketem (PRD §5: "pełny flow rezerwacji pokryty testem e2e
// przeciw prawdziwemu projektowi Supabase TEST"). `smoke.spec.ts` to
// placeholder potwierdzający, że konfiguracja działa, nie test biznesowy.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5183",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5183",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
