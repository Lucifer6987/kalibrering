import { test, expect } from "@playwright/test";
test("Dansk kalibreringsflow, grafer, PDF, Excel og mobilnavigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Styr på hver eneste måling." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Instrumenter", exact: true }).click();
  await page.getByRole("button", { name: "Opret instrument" }).click();
  await page.getByLabel("Instrumentnavn").fill("Browsertest føler");
  await page.getByLabel("Serienummer").fill("BROWSER-" + Date.now());
  await page
    .getByRole("button", { name: "Gem instrument", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Instrumentet er oprettet");
  await page
    .getByRole("row")
    .filter({ hasText: "Browsertest føler" })
    .getByRole("button", { name: "Kalibrér" })
    .click();
  await page.getByLabel("Udført af").fill("Browseroperatør");
  await page
    .getByLabel("Referenceudstyr / certifikatnummer")
    .fill("REF-BROWSER");
  for (let n = 1; n <= 5; n++)
    await page
      .getByRole("spinbutton", { name: `before punkt ${n}`, exact: true })
      .fill(String((n - 1) * 25));
  for (let n = 1; n <= 5; n++)
    await page
      .getByRole("spinbutton", { name: `after punkt ${n}`, exact: true })
      .fill(String((n - 1) * 25));
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Gem kalibrering og opret rapport" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Kalibrering gemt. Certifikat og Excel er klar.",
  );
  const row = page
    .getByRole("row")
    .filter({ hasText: "Browseroperatør" })
    .first();
  await expect(row.getByText("Godkendt")).toBeVisible();
  const download = page.waitForEvent("download");
  await row.getByRole("link", { name: "PDF-certifikat" }).click();
  expect((await download).suggestedFilename()).toMatch(/kalibrering-\d+\.pdf/);
  await page.getByRole("button", { name: "Beregnere", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "PT100 / PT1000" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overblik", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Styr på hver eneste måling." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
