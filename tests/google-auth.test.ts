import { afterEach, describe, expect, it } from "vitest";
import { AuthService } from "../apps/api/src/auth/service";

const googleKeys = [
  "GOOGLE_ANDROID_CLIENT_ID",
  "GOOGLE_IOS_CLIENT_ID",
  "GOOGLE_WEB_CLIENT_ID",
] as const;
const originals = Object.fromEntries(
  googleKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of googleKeys) {
    const original = originals[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("Google authentication boundary", () => {
  it("stays disabled until an allowed OAuth audience is configured", async () => {
    for (const key of googleKeys) delete process.env[key];
    await expect(new AuthService().signInWithGoogle("untrusted"))
      .rejects.toMatchObject({ code: "GOOGLE_DISABLED", status: 503 });
  });

  it("rejects an unsigned or malformed identity token", async () => {
    process.env.GOOGLE_ANDROID_CLIENT_ID =
      "test-client.apps.googleusercontent.com";
    await expect(new AuthService().signInWithGoogle("untrusted"))
      .rejects.toMatchObject({ code: "GOOGLE_INVALID", status: 401 });
  });
});
