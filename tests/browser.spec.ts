import { test, expect, type Page } from "@playwright/test";
const invalidTextWarnings = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const warnings: string[] = [];
  invalidTextWarnings.set(page, warnings);
  page.on("console", (message) => {
    if (message.text().includes("Unexpected text node:"))
      warnings.push(message.text());
  });
});
test.afterEach(({ page }) => {
  expect(
    invalidTextWarnings.get(page) ?? [],
    "Views must not contain raw text, including empty strings",
  ).toEqual([]);
});
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});
test("shared expense, account isolation, and accessible responsive home", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hi, Utkarsh" }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/home-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByLabel("Amount · INR", { exact: true }).fill("100");
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Browser split check");
  await page
    .getByRole("button", { name: "Split with friends", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose a group", exact: true })
    .click();
  await page
    .getByRole("radio", { name: /Goa, here we come/ })
    .click();
  await expect(page.getByText("₹25.00", { exact: true })).toHaveCount(4);
  await page
    .getByRole("button", { name: "Save & split expense", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Browser split check, ₹100.00, SETTLED",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Account switcher", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch", exact: true }).click();
  await expect(
    page.getByText("₹4,669", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Design software/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Browser split check/ }),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(page.locator("body")).not.toHaveText(/Something went wrong/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("manual entry survives reload and can be reversed with a reason", async ({
  page,
}) => {
  await page.goto("/add");
  await page.getByLabel("Amount · INR", { exact: true }).fill("219.75");
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Browser coffee check");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Browser coffee check, ₹219.75, SETTLED",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Reason or resolution")
    .fill("Duplicate personal entry");
  await page
    .getByRole("button", { name: "Reverse entry", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create corrected entry", exact: true }),
  ).toBeVisible();
});
test("UPI confirmation never presents app launch as success", async ({
  page,
}) => {
  await page.goto("/scan");
  await page
    .getByLabel("Or paste a UPI payment link")
    .fill("upi://pay?pa=cafe@okbank&pn=Test%20Cafe&am=120.50&cu=INR");
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Test Cafe", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByText(/Opening the UPI app is not proof of payment/),
  ).toBeVisible();
});

test("bill photo and itemisation persist, with scan centred in the phone tray", async ({
  page,
}, info) => {
  await page.goto("/add");
  if (info.project.name === "phone") {
    const scan = page.getByRole("button", { name: "Scan & pay", exact: true });
    const box = await scan.boundingBox();
    expect(
      Math.abs(box!.x + box!.width / 2 - page.viewportSize()!.width / 2),
    ).toBeLessThan(12);
    await expect(
      page.getByRole("button", { name: "Add", exact: true }),
    ).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Start with the bill" }),
  ).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 800, 800);
    ctx.fillStyle = "#000";
    ctx.font = "32px monospace";
    [
      "PIP CAFE",
      "",
      "2 x Coffee          160.00",
      "Sandwich            120.00",
      "Subtotal            280.00",
      "CGST                  7.00",
      "SGST                  7.00",
      "Discount             14.00",
      "GRAND TOTAL         280.00",
    ].forEach((line, i) => ctx.fillText(line, 30, 65 + i * 65));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose bill photo", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "bill.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("img", { name: "Selected bill photo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item 1", { exact: true }).fill("Coffee");
  await page.getByLabel("Quantity 1", { exact: true }).fill("2");
  await page.getByLabel("Line total 1 · INR", { exact: true }).fill("160");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item 2", { exact: true }).fill("Sandwich");
  await page.getByLabel("Line total 2 · INR", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Amount · INR", { exact: true }).fill("280");
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Itemised cafe bill");
  await expect(page.getByText("Everything adds up.")).toBeVisible();
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Itemised cafe bill, ₹280.00, SETTLED",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(page.getByText("2 × Coffee", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Saved bill photo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/bill-${info.project.name}.png`,
    fullPage: true,
  });
});

test("reads an actual bill image locally and keeps OCR behind review", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "The OCR browser engine is shared across viewport sizes.",
  );
  test.setTimeout(120000);
  await page.goto("/add");
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1000, 700);
    ctx.fillStyle = "black";
    ctx.font = "40px monospace";
    [
      "PIP CAFE",
      "2 x Coffee       160.00",
      "Sandwich         120.00",
      "GRAND TOTAL      280.00",
    ].forEach((line, i) => ctx.fillText(line, 50, 90 + i * 110));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose bill photo", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "ocr-bill.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page
    .getByRole("button", { name: "Read total & items", exact: true })
    .click();
  await expect(
    page.getByText("Detected total: ₹280.00", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.getByLabel("Amount · INR", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Use scanned details", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Amount · INR", { exact: true })).toHaveValue(
    "280",
  );
  await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
    "Coffee",
  );
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("2");
  await expect(page.getByText("Everything adds up.")).toBeVisible();
});

test.describe("camera capture", () => {
  test("captures a JPEG bill and closes the camera", async ({ page }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "Browser camera plumbing is shared.",
    );
    await page.goto("/add");
    await page.getByRole("button", { name: "Add bill", exact: true }).click();
    await page
      .getByRole("button", { name: "Take bill photo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Capture bill", exact: true })
      .click();
    const image = page.getByRole("img", { name: "Selected bill photo" });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", /^data:image\/jpeg/);
    await expect(
      page.getByRole("button", { name: "Capture bill", exact: true }),
    ).toHaveCount(0);
  });
});

test("wallet summaries, illustrated onboarding, and repayment confirmation work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Your spending this month", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Owed to you", { exact: true })).toBeVisible();
  await expect(page.getByText("You owe", { exact: true })).toBeVisible();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("Your spending this month", { exact: true }),
  ).toBeVisible();
  await page.goto("/settle");
  await page
    .getByRole("button", { name: /^Repay / })
    .first()
    .click();
  await page.getByLabel("Amount paid", { exact: true }).fill("1");
  await page
    .getByRole("button", {
      name: "I paid this amount · record repayment",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Repayment recorded", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("₹1.00", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `artifacts/repayment-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to balances", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A clean slate feels good." }),
  ).toBeVisible();
});

test("analytics filters stay grouped and group contacts have a fallback", async ({
  page,
}, info) => {
  await page.goto("/analytics");
  await expect(
    page.getByRole("button", { name: "This week", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Period: month", exact: true })
    .click();
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Period: week", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Category: All categories", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "This week", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/analytics-${info.project.name}.png`,
  });
  await page.goto("/groups");
  await page.screenshot({ path: `artifacts/groups-${info.project.name}.png` });
  await page
    .getByRole("button", { name: "Create a group", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose a phone contact", exact: true })
    .click();
  await expect(
    page.getByText(/This browser cannot open phone contacts/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage contacts and invitations" }),
  ).toBeVisible();
});
