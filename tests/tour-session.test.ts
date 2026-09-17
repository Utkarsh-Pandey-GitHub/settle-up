import { beforeEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-secure-store", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../apps/mobile/src/data/session";

beforeEach(() => {
  vi.resetAllMocks();
  useSession.setState({ tourAccountId: "tour-account" });
});

it("dismisses before persistence finishes so repeat taps cannot keep the tour open", async () => {
  let finish!: () => void;
  vi.mocked(AsyncStorage.setItem).mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const pending = useSession.getState().completeTour();
  expect(useSession.getState().tourAccountId).toBeNull();
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    "settleup.tour.tour-account",
    "done",
  );
  finish();
  await pending;
});

it("does not crash or trap the user when device storage fails", async () => {
  vi.mocked(AsyncStorage.setItem).mockRejectedValue(
    new Error("Storage unavailable"),
  );
  await expect(useSession.getState().completeTour()).resolves.toBeUndefined();
  expect(useSession.getState().tourAccountId).toBeNull();
});
