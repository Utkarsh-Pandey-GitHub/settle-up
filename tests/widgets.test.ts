import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import type { Dashboard, TransactionView } from "@settleup/contracts";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-modules-core", () => ({ requireOptionalNativeModule: vi.fn() }));
import { createWidgetSnapshot } from "../apps/mobile/modules/home-widgets/client";

const now = DateTime.fromISO("2026-09-13T12:00:00+05:30");
function transaction(patch: Partial<TransactionView> = {}): TransactionView {
  return {
    id: "expense",
    title: "Private title",
    notes: "Private notes",
    amountMinor: 12000,
    currency: "INR",
    type: "PERSONAL_EXPENSE",
    status: "SETTLED",
    occurredAt: "2026-09-12T20:00:00Z",
    sourceId: "me",
    tagIds: [],
    allocations: [],
    version: 1,
    ...patch,
  };
}
function dashboard(transactions: TransactionView[]): Dashboard {
  return {
    account: {
      id: "me",
      name: "Sam Rao",
      currency: "INR",
      avatar: "SR",
      phone: "+919876543210",
    },
    transactions,
    ledgers: [],
    tags: [],
    goals: [],
    savedContacts: [],
    activity: [],
    obligations: [],
  };
}
describe("Home widget snapshots", () => {
  it("uses IST dates and only the active account's settled personal share", () => {
    const data = dashboard([
      transaction(),
      transaction({
        type: "SHARED_EXPENSE",
        amountMinor: 90000,
        sourceId: "other",
        allocations: [
          { userId: "me", amountMinor: 30000 },
          { userId: "other", amountMinor: 60000 },
        ],
      }),
      transaction({ sourceId: "other" }),
      transaction({ status: "PENDING" }),
      transaction({ type: "LOAN" }),
      transaction({ currency: "USD" }),
      transaction({ occurredAt: "2026-09-14T00:00:00Z" }),
      transaction({ occurredAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(createWidgetSnapshot(data, now).days).toEqual({
      "2026-09-13": 42000,
    });
  });
  it("keeps active budgets in the selected currency and preserves overspending", () => {
    const data = dashboard([]);
    const goal = {
      id: "goal",
      name: "Food",
      amountMinor: 10000,
      spentMinor: 13000,
      currency: "INR",
      start: "2026-09-01T00:00:00Z",
      end: "2026-10-01T00:00:00Z",
      period: "MONTH" as const,
      tagIds: [],
      ledgerIds: [],
      thresholds: [100],
    };
    data.goals = [
      goal,
      { ...goal, end: "2026-09-12T00:00:00Z" },
      { ...goal, start: "2026-09-14T00:00:00Z" },
      { ...goal, currency: "USD" },
    ];
    expect(createWidgetSnapshot(data, now).goals).toEqual([
      {
        name: "Food",
        limit: 10000,
        spent: 13000,
        period: "MONTH",
        end: Date.parse(goal.end),
      },
    ]);
  });
  it("does not export transaction details, phone numbers, contact identities or credentials", () => {
    const snapshot = createWidgetSnapshot(dashboard([transaction()]), now);
    const json = JSON.stringify(snapshot);
    for (const privateText of [
      "Private title",
      "Private notes",
      "+919876543210",
      "sourceId",
      "allocations",
      "accessToken",
      "refreshToken",
    ])
      expect(json).not.toContain(privateText);
    expect(snapshot.name).toBe("Sam");
  });
  it("supports currencies without fractional minor units and an empty account", () => {
    const data = dashboard([]);
    data.account.currency = "JPY";
    expect(createWidgetSnapshot(data, now)).toMatchObject({
      currency: "JPY",
      digits: 0,
      days: {},
      goals: [],
    });
  });
});
