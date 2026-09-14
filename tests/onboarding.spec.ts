import { test, expect } from "@playwright/test";
test("new user verifies, completes profile, and reaches the first action", async ({
  page,
}, info) => {
  const session = {
    accessToken: "test-access",
    refreshToken: "test-refresh",
    account: {
      id: "new-user",
      name: "New friend",
      phone: "+919876543210",
      currency: "INR",
      avatar: "NF",
    },
  };
  let checked = false,
    saved = false;
  // Keep the flow entirely local even when the developer uses a hosted API.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://localhost:8082"
      ? route.continue()
      : route.abort(),
  );
  await page.route(
    /^https?:\/\/[^/]+\/(?:auth\/(?:otp|verify)|profile)(?:\?.*)?$/,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/auth/otp")
        return route.fulfill({ json: { challengeId: "test-challenge" } });
      if (path === "/auth/verify") {
        if (route.request().postDataJSON().code !== "123456")
          return route.fulfill({
            status: 401,
            json: { message: "The code is invalid or expired." },
          });
        checked = true;
        return route.fulfill({ json: session });
      }
      if (path === "/profile") {
        expect(checked).toBe(true);
        expect(route.request().headers().authorization).toBe(
          "Bearer test-access",
        );
        expect(route.request().postDataJSON()).toEqual({
          name: "Sam",
          currency: "EUR",
        });
        saved = true;
        return route.fulfill({ json: { name: "Sam", currency: "EUR" } });
      }
      return route.fulfill({ json: {} });
    },
  );
  await page.goto("/auth");
  await expect(
    page.getByRole("button", { name: "Continue with Truecaller", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/onboarding-start-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Phone number", { exact: true }).fill("+919876543210");
  await page
    .getByRole("button", { name: "Continue with phone", exact: true })
    .click();
  await page
    .getByLabel("Six-digit verification code", { exact: true })
    .fill("000000");
  await page
    .getByRole("button", { name: "Verify & continue", exact: true })
    .click();
  await expect(
    page.getByText("The code is invalid or expired.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Six-digit verification code", { exact: true })
    .fill("123456");
  await page
    .getByRole("button", { name: "Verify & continue", exact: true })
    .click();
  await page
    .getByLabel("What should we call you?", { exact: true })
    .fill("Sam");
  await page.getByRole("button", { name: "EUR", exact: true }).click();
  await page.screenshot({
    path: `artifacts/onboarding-profile-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Make it mine", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all set, Sam." }),
  ).toBeVisible();
  expect(saved).toBe(true);
  await expect(
    page.getByRole("button", { name: "Add my first expense" }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/onboarding-ready-${info.project.name}.png`,
    fullPage: true,
  });
});

test("payment link form and bank SMS entry are reachable on a phone and desktop", async ({ page }, info) => {
  const { demoDashboard, ids } = await import("../packages/domain/src/fixtures");
  const dashboard = demoDashboard(ids.Utkarsh);
  let created = false;
  const token = "abcdefghijklmnopqrstuvwx";
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://localhost:8082" ? route.continue() : route.abort());
  await page.route(/^https?:\/\/[^/]+\/(?:auth\/(?:otp|verify)|dashboard|payment-links)(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/otp") return route.fulfill({ json: { challengeId: "test" } });
    if (path === "/auth/verify") return route.fulfill({ json: { accessToken: "test", refreshToken: "test", account: dashboard.account } });
    if (path === "/dashboard") return route.fulfill({ json: dashboard });
    expect(route.request().postDataJSON()).toEqual({ upiId: "sam@bank", payeeName: "Sam", amountMinor: 12550 });
    created = true;
    return route.fulfill({ json: { token, expiresAt: "2026-09-21T00:00:00Z" } });
  });
  await page.goto("/auth");
  await page.getByLabel("Phone number", { exact: true }).fill("+919876543210");
  await page.getByRole("button", { name: "Continue with phone", exact: true }).click();
  await page.getByLabel("Six-digit verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify & continue", exact: true }).click();
  await page.getByRole("button", { name: "Account switcher", exact: true }).click();
  await page.getByRole("button", { name: "Settings & permissions", exact: true }).click();
  await page.getByRole("button", { name: "Payment links", exact: true }).click();
  await page.getByLabel("Payee name", { exact: true }).fill("Sam");
  await page.getByLabel("UPI ID", { exact: true }).fill("sam@bank");
  await page.getByLabel("Amount · INR", { exact: true }).fill("125.50");
  await page.getByRole("button", { name: "Create payment link", exact: true }).click();
  await expect(page.getByText(new RegExp(`/p/${token}$`))).toBeVisible();
  expect(created).toBe(true);
  await page.screenshot({ path: `artifacts/payment-links-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Account switcher", exact: true }).click();
  await page.getByRole("button", { name: "Settings & permissions", exact: true }).click();
  await page.getByRole("button", { name: "Bank SMS review", exact: true }).click();
  await expect(page.getByText("SMS review is available only on supported Android development builds. It cannot access messages in a browser.")).toBeVisible();
});
