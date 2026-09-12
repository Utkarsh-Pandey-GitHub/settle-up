import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-id" }));
vi.mock("../apps/mobile/src/data/session", () => ({
  DEMO: false,
  getTokenSession: vi.fn(),
  replaceTokenSession: vi.fn(),
}));
import { request } from "../apps/mobile/src/data/repository";
const timeoutDescriptor = Object.getOwnPropertyDescriptor(
  AbortSignal,
  "timeout",
);
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: undefined,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (timeoutDescriptor)
    Object.defineProperty(AbortSignal, "timeout", timeoutDescriptor);
});
it("can log in without AbortSignal.timeout and clears the timer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ challengeId: "challenge" })),
  );
  await expect(
    request("/auth/otp", { body: { phone: "+919876543210" } }),
  ).resolves.toEqual({ challengeId: "challenge" });
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts stalled login requests and gives a readable timeout", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    ),
  );
  const pending = expect(
    request("/auth/truecaller", { body: { code: "test" } }),
  ).rejects.toThrow("The request timed out");
  await vi.advanceTimersByTimeAsync(15000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up when the network fails immediately", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Network request failed")),
  );
  await expect(request("/auth/otp")).rejects.toThrow("Network request failed");
  expect(vi.getTimerCount()).toBe(0);
});
