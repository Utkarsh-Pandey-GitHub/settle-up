import { afterEach, describe, expect, it, vi } from "vitest";
import { StytchOtpProvider } from "../apps/api/src/auth/stytch";
afterEach(() => vi.unstubAllEnvs());
function setup() {
  vi.stubEnv("STYTCH_PROJECT_ID", "project-test-example");
  vi.stubEnv("STYTCH_SECRET", "test-secret");
  const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<Response>>();
  return { fetcher, provider: new StytchOtpProvider(fetcher) };
}
describe("Stytch SMS", () => {
  it("uses the test environment and a five-minute expiry", async () => {
    const { provider, fetcher } = setup();
    fetcher.mockResolvedValue(Response.json({ phone_id: "phone-test" }));
    expect(await provider.send("+919876543210")).toBe("phone-test");
    expect(fetcher.mock.calls[0][0]).toBe("https://test.stytch.com/v1/otps/sms/login_or_create");
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({ phone_number: "+919876543210", expiration_minutes: 5 });
  });
  it("reports bad server credentials separately from an incorrect OTP", async () => {
    const { provider, fetcher } = setup();
    fetcher.mockResolvedValue(Response.json({ error_message: "private provider detail" }, { status: 401 }));
    await expect(provider.verify("phone-test", "123456")).rejects.toMatchObject({ code: "OTP_CONFIG", status: 503 });
    fetcher.mockResolvedValue(Response.json({}, { status: 400 }));
    await expect(provider.verify("phone-test", "123456")).rejects.toMatchObject({ code: "OTP_INVALID" });
  });
  it("rejects ambiguous verification flags and another method's phone", async () => {
    const { provider, fetcher } = setup();
    for (const phone of [
      { phone_id: "phone-test", phone_number: "+919876543210", verified: "true" },
      { phone_id: "other", phone_number: "+919876543210", verified: true },
    ]) {
      fetcher.mockResolvedValue(Response.json({ user: { phone_numbers: [phone] } }));
      await expect(provider.verify("phone-test", "123456")).rejects.toMatchObject({ code: "OTP_INVALID" });
    }
  });
});
