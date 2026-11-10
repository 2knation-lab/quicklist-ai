import { test, expect } from "@playwright/test";
test("mobile demo draft can be edited, saved, reopened, and reviewed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Demo workspace", { exact: true })).toBeVisible();
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#66746b";
    ctx.fillRect(0, 0, 200, 200);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "part.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  });
  await page.getByRole("button", { name: /Generate listing draft/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your photos were not analyzed",
  );
  await page.getByLabel(/Listing title/).fill("Verified racing part");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Used part with visible wear.");
  await page.getByLabel("Price (USD)", { exact: true }).fill("125");
  await page.getByLabel("Enable Best Offer").check();
  await page.getByRole("button", { name: "Auction", exact: true }).click();
  await expect(page.getByLabel("Duration")).toHaveValue("7");
  await expect(page.getByLabel("Enable Best Offer")).toHaveCount(0);
  for (const name of [
    "Length (in)",
    "Width (in)",
    "Height (in)",
    "Weight (lb)",
  ])
    await page.getByLabel(name, { exact: true }).fill("5");
  await expect(
    page.getByRole("button", { name: "Export reviewed draft" }),
  ).toBeDisabled();
  await page.getByLabel(/I verified/).check();
  await expect(
    page.getByRole("button", { name: "Export reviewed draft" }),
  ).toBeEnabled();
  await page.getByLabel("Weight (lb)", { exact: true }).fill("-1");
  await page.getByLabel(/I verified/).check();
  await expect(
    page.getByRole("button", { name: "Export reviewed draft" }),
  ).toBeDisabled();
  await page.getByLabel("Weight (lb)", { exact: true }).fill("5");
  await page.getByLabel(/I verified/).check();
  await page.getByRole("button", { name: /Save draft/ }).click();
  await expect(page.getByRole("status")).toContainText("saved in this browser");
  await page.reload();
  await page.getByRole("button", { name: /Verified racing part/ }).click();
  await expect(page.getByLabel(/Listing title/)).toHaveValue(
    "Verified racing part",
  );
  await expect(page.getByAltText("Part view 1")).toBeVisible();
  await page.getByLabel(/Listing title/).fill("Changed");
  await expect(page.getByLabel(/I verified/)).not.toBeChecked();
  await page.screenshot({
    path: "test-results/quicklist-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("demo endpoint explicitly identifies the template", async ({
  request,
}) => {
  const r = await request.post("/api/analyze", { data: { photos: [] } });
  expect(r.ok()).toBeTruthy();
  expect((await r.json()).mode).toBe("demo");
});
