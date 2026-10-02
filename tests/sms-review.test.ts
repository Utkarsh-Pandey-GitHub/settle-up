import { describe, it, expect, beforeEach, vi } from "vitest";
import { DateTime, Settings } from "luxon";
import { smsRange, smsDecisionExpiry, parseExpenseSms } from "@settleup/domain";
const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  readRange: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  PermissionsAndroid: {
    PERMISSIONS: { READ_SMS: "sms" },
    RESULTS: { GRANTED: "granted" },
    request: async () => "granted",
    check: async () => true,
  },
  Linking: {},
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({ readRange: state.readRange }),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => state.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    state.storage.set(key, value);
  },
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "salt",
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_: string, value: string) => value,
}));
vi.mock("expo-contacts", () => ({}));
import { AndroidSmsProvider } from "../apps/mobile/src/services/device";

describe("bank SMS review", () => {
  beforeEach(() => {
    state.storage.clear();
    state.readRange.mockReset();
  });
  it("uses today plus six calendar days and rejects future/reversed dates", () => {
    const zone = Settings.defaultZone;
    Settings.defaultZone = "Asia/Kolkata";
    try {
      const now = new Date("2026-09-14T04:30:00Z");
      expect(smsRange(undefined, undefined, now)).toEqual({
        start: +new Date("2026-09-07T18:30:00Z"),
        end: +now + 1,
      });
      expect(smsDecisionExpiry("2026-09-08T15:00:00+05:30")).toBe(
        +new Date("2026-09-14T18:30:00Z"),
      );
      expect(() => smsRange("2026-09-15", "2026-09-16", now)).toThrow();
      expect(() => smsRange("2026-09-12", "2026-09-10", now)).toThrow();
    } finally {
      Settings.defaultZone = zone;
    }
  });
  it("finds bank debits and credits while ignoring OTPs and failed/promotional messages", () => {
    const now = Date.now();
    expect(
      parseExpenseSms(
        "Your A/c XX1234 debited INR 450.00 at CAFE. UTR 123456789",
        now,
      )?.amountMinor,
    ).toBe(45000);
    expect(
      parseExpenseSms(
        "Bank balance INR 10,000. Your card was debited INR 450.00 at CAFE",
        now,
      )?.amountMinor,
    ).toBe(45000);
    expect(
      parseExpenseSms("Your bank account credited INR 500", now)?.direction,
    ).toBe("CREDIT");
    for (const text of [
      "OTP 123456 for INR 500 paid by card",
      "UPI payment failed: paid INR 500",
      "Bank reminder: INR 500 due",
      "I paid INR 500 at CAFE",
    ])
      expect(parseExpenseSms(text, now)).toBeNull();
  });
  it("records both decisions, isolates accounts, and ignores history for a custom search", async () => {
    const timestamp = Date.now() - 60000;
    state.readRange.mockResolvedValue([
      { id: "1", timestamp, body: "Bank A/c XX1234 debited INR 45 at CAFE" },
    ]);
    const provider = new AndroidSmsProvider("a");
    const [suggestion] = await provider.review();
    await provider.markHandled(
      suggestion.fingerprint,
      "ACCEPTED",
      suggestion.occurredAt,
    );
    expect(await provider.review()).toEqual([]);
    expect(Object.values(await provider.handled())[0].decision).toBe(
      "ACCEPTED",
    );
    const today = DateTime.now().toISODate()!;
    const before = state.storage.get("settleup.sms.a");
    expect(await provider.review({ from: today, through: today })).toHaveLength(
      1,
    );
    expect(state.storage.get("settleup.sms.a")).toBe(before);
    expect(await new AndroidSmsProvider("b").review()).toHaveLength(1);
    await provider.markHandled(
      suggestion.fingerprint,
      "REJECTED",
      suggestion.occurredAt,
    );
    expect(Object.values(await provider.handled())[0].decision).toBe(
      "REJECTED",
    );
  });
  it("purges expired records instead of retaining seven days from acceptance", async () => {
    const provider = new AndroidSmsProvider("a");
    state.storage.set(
      "settleup.sms.a",
      JSON.stringify({
        old: { decision: "ACCEPTED", occurredAt: "2020-01-01", expiresAt: 1 },
      }),
    );
    expect(await provider.handled()).toEqual({});
    await provider.markHandled("stale", "ACCEPTED", "2020-01-01");
    expect(await provider.handled()).toEqual({});
  });
});
