import { afterEach, describe, expect, it } from "vitest";
import { AuthService } from "../apps/api/src/auth/service";

const original = process.env.GOOGLE_CLIENT_IDS;

afterEach(() => {
  if (original === undefined) delete process.env.GOOGLE_CLIENT_IDS;
  else process.env.GOOGLE_CLIENT_IDS = original;
});

describe("Google authentication boundary", () => {
  it("stays disabled until an allowed OAuth audience is configured", async () => {
    delete process.env.GOOGLE_CLIENT_IDS;
    await expect(new AuthService().signInWithGoogle("untrusted"))
      .rejects.toMatchObject({ code: "GOOGLE_DISABLED", status: 503 });
  });

  it("rejects an unsigned or malformed identity token", async () => {
    process.env.GOOGLE_CLIENT_IDS = "test-client.apps.googleusercontent.com";
    await expect(new AuthService().signInWithGoogle("untrusted"))
      .rejects.toMatchObject({ code: "GOOGLE_INVALID", status: 401 });
  });
});
