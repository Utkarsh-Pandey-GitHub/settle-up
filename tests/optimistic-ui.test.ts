import { beforeEach, expect, it, vi } from "vitest";

const values = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-id" }));
vi.mock("../apps/mobile/src/data/session", () => ({
  DEMO: false,
  getTokenSession: vi.fn(),
  replaceTokenSession: vi.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { demoDashboard, ids } from "@settleup/domain/src/fixtures";
import {
  optimisticDashboardMutation,
  readCachedDashboard,
  subscribeCachedDashboard,
} from "../apps/mobile/src/data/repository";

const key = `settleup.dashboard.v1.${ids.Utkarsh}`;

beforeEach(async () => {
  values.clear();
  await AsyncStorage.setItem(key, JSON.stringify(demoDashboard(ids.Utkarsh)));
});

it("publishes the UI change before the server operation finishes", async () => {
  let finish!: (value: { ok: true }) => void;
  const server = new Promise<{ ok: true }>((resolve) => {
    finish = resolve;
  });
  const names: string[] = [];
  const unsubscribe = subscribeCachedDashboard((_accountId, dashboard) => {
    names.push(dashboard.account.name);
  });

  const pending = optimisticDashboardMutation(
    ids.Utkarsh,
    (dashboard) => {
      dashboard.account.name = "Optimistic name";
    },
    () => server,
  );

  await vi.waitFor(() => expect(names).toContain("Optimistic name"));
  finish({ ok: true });
  await expect(pending).resolves.toEqual({ ok: true });
  expect((await readCachedDashboard(ids.Utkarsh))?.account.name).toBe(
    "Optimistic name",
  );
  unsubscribe();
});

it("restores the previous UI snapshot when the server rejects the change", async () => {
  const names: string[] = [];
  const unsubscribe = subscribeCachedDashboard((_accountId, dashboard) => {
    names.push(dashboard.account.name);
  });

  await expect(
    optimisticDashboardMutation(
      ids.Utkarsh,
      (dashboard) => {
        dashboard.account.name = "Rejected name";
      },
      async () => {
        throw new Error("Rejected by server");
      },
    ),
  ).rejects.toThrow("Rejected by server");

  expect(names).toEqual(
    expect.arrayContaining(["Rejected name", "Utkarsh Mehta"]),
  );
  expect((await readCachedDashboard(ids.Utkarsh))?.account.name).toBe(
    "Utkarsh Mehta",
  );
  unsubscribe();
});
