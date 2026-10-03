import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-id" }));
vi.mock("../apps/mobile/src/data/session", () => ({
  DEMO: false,
  getTokenSession: vi.fn(),
  replaceTokenSession: vi.fn(),
}));
import { request } from "../apps/mobile/src/data/repository";
import {
  getTokenSession,
  replaceTokenSession,
} from "../apps/mobile/src/data/session";
const timeoutDescriptor = Object.getOwnPropertyDescriptor(
  AbortSignal,
  "timeout",
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: undefined,
  });
});
it("uses a concurrently refreshed access token without replaying the old refresh token", async () => {
  const account = {
    id: "account-1",
    name: "Test",
    phone: "+919876543210",
    currency: "INR",
    avatar: "T",
  };
  const oldSession = {
    account,
    accessToken: "old-access",
    refreshToken: "old-refresh-token-that-is-long-enough-for-validation",
    accessExpiresAt: Date.now() + 60_000,
  };
  const newSession = {
    account,
    accessToken: "new-access",
    refreshToken: "new-refresh-token-that-is-long-enough-for-validation",
    accessExpiresAt: Date.now() + 60_000,
  };
  let current = oldSession;
  vi.mocked(getTokenSession).mockImplementation(() => current);
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    if (
      (options.headers as Record<string, string>).authorization ===
      "Bearer old-access"
    ) {
      current = newSession;
      return Response.json({ code: "AUTH" }, { status: 401 });
    }
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", fetcher);

  await expect(
    request("/dashboard", { accountId: "account-1" }),
  ).resolves.toEqual({
    ok: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.some(([url]) => String(url).endsWith("/auth/refresh")),
  ).toBe(false);
  expect(replaceTokenSession).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
  ).rejects.toThrow("The server took too long to respond");
  await vi.advanceTimersByTimeAsync(90000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up when the network fails immediately", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Network request failed")),
  );
  await expect(request("/auth/otp")).rejects.toMatchObject({
    code: "NETWORK_ERROR",
  });
  expect(vi.getTimerCount()).toBe(0);
});

it("does not label a bodyless delete as JSON", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  await request("/groups/00000000-0000-4000-8000-000000000001", {
    method: "DELETE",
  });
  expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty(
    "content-type",
  );
});

it("does not display HTML from an incorrect API deployment", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<html>Cannot POST /auth/otp</html>", { status: 404 }),
      ),
  );
  await expect(request("/auth/otp")).rejects.toThrow(
    "unexpected response (404)",
  );
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  "http://127.0.0.1:4000",
  "http://localhost:4000",
  "http://10.0.2.2:4000",
])("preserves the configured Android API host %s", async (url) => {
  vi.resetModules();
  vi.doMock("react-native", () => ({ Platform: { OS: "android" } }));
  vi.stubEnv("EXPO_PUBLIC_API_URL", `${url}/`);
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetcher);
  const client = await import("../apps/mobile/src/data/repository");
  await client.request("/health");
  expect(fetcher.mock.calls[0][0]).toBe(`${url}/health`);
  expect(client.API_URL).toBe(url);
});
