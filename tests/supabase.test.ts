import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { SupabaseOtpProvider } from "../apps/api/src/auth/supabase";
import { validateConfig } from "../apps/api/src/auth/service";
const phone = "+919876543210";
const profile = { id: "supabase-user", phone: "919876543210", phone_confirmed_at: "2026-09-14T00:00:00Z" };
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("Supabase SMS provider", () => {
  it("lets Supabase generate OTP without passing an application-generated code", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    await new SupabaseOtpProvider(fetcher).send(phone);
    expect(fetcher.mock.calls[0][0]).toBe("https://test.supabase.co/auth/v1/otp");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ phone, channel: "sms", create_user: true });
    expect(fetcher.mock.calls[0][1]!.headers).toEqual({ apikey: "test-publishable", "Content-Type": "application/json" });
  });
  it("returns only the confirmed matching phone, never provider tokens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ user: profile, access_token: "private", refresh_token: "private" }));
    expect(await new SupabaseOtpProvider(fetcher).verify(phone, "123456")).toBe(phone);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ phone, token: "123456", type: "sms" });
  });
  it.each([{ ...profile, phone_confirmed_at: undefined }, { ...profile, phone_confirmed_at: "bad" }, { ...profile, phone: "919876543211" }, undefined])("rejects unconfirmed/mismatched provider identities", async user => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ user }));
    await expect(new SupabaseOtpProvider(fetcher).verify(phone, "123456")).rejects.toMatchObject({ code: "OTP_INVALID" });
  });
  it("reports wrong codes, limits, and provider outages without exposing their bodies", async () => {
    for (const [status, code] of [[400, "OTP_INVALID"], [429, "RATE_LIMIT"], [500, "OTP_DELIVERY"]] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: "secret provider internals" }, { status }));
      await expect(new SupabaseOtpProvider(fetcher).verify(phone, "123456")).rejects.toMatchObject({ code });
    }
  });
  it("aborts a stalled request and reports a retryable error", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const result = expect(new SupabaseOtpProvider(fetcher).send(phone)).rejects.toMatchObject({ code: "OTP_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(10000);
    await result;
  });
  it("refuses insecure URLs and missing credentials before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubEnv("SUPABASE_URL", "http://test.supabase.co");
    await expect(new SupabaseOtpProvider(fetcher).send(phone)).rejects.toMatchObject({ code: "OTP_CONFIG" });
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", ""); vi.stubEnv("SUPABASE_ANON_KEY", "");
    await expect(new SupabaseOtpProvider(fetcher).send(phone)).rejects.toMatchObject({ code: "OTP_CONFIG" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("prevents production from using development OTP or default signing secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    expect(validateConfig).toThrow("unique JWT_SECRET");
    vi.stubEnv("JWT_SECRET", "j".repeat(40)); vi.stubEnv("OTP_PEPPER", "p".repeat(40)); vi.stubEnv("OTP_PROVIDER", "development");
    expect(validateConfig).toThrow("Production requires");
    vi.stubEnv("OTP_PROVIDER", "supabase");
    expect(validateConfig).not.toThrow();
  });
});
