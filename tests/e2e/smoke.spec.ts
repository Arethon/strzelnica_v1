import { expect, test } from "@playwright/test";

// Placeholder potwierdzający, że infrastruktura Playwright (dev server +
// przeglądarka) działa. Właściwy flow rezerwacji e2e przychodzi z kolejnym
// ticketem (PRD §5).
test("każdy z trzech route'ów renderuje się bez błędów", async ({ page }) => {
  await page.goto("/book?range=demo-strzelnica");
  await expect(page.getByRole("heading", { name: "Rezerwacja terminu" })).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Panel Personelu — logowanie" })).toBeVisible();

  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: "Panel Personelu" })).toBeVisible();
});
