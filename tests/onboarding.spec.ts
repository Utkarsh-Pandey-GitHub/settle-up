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
