import { describe, it, expect } from "vitest";
import {
  splitExpense,
  obligations,
  applyRepayment,
  simplifyBalances,
  parseMoney,
  parseUpi,
  parseSms,
  periodRange,
  goalProgress,
  normalizePhone,
  assertShareAccess,
  SMS_TTL_MS,
  type Debt,
} from "@settleup/domain";
import { analytics } from "@settleup/domain/src/analytics";
import { demoDashboard, ids } from "@settleup/domain/src/fixtures";
const members = ["A", "B", "C", "D"].map((userId) => ({ userId }));
describe("integer money & allocations", () => {
  it("stores decimal input exactly in minor units", () => {
    expect(parseMoney("10.29")).toBe(1029);
    expect(parseMoney("1200", "JPY")).toBe(1200);
    expect(parseMoney("1.234", "KWD")).toBe(1234);
    expect(() => parseMoney("1.001")).toThrow();
    expect(() => parseMoney("-1")).toThrow();
    expect(() => parseMoney("Infinity")).toThrow();
  });
  it("splits ₹100 four ways without a self-debt", () => {
    const split = splitExpense(10000, members, "EQUAL");
    expect(split.map((s) => s.amountMinor)).toEqual([2500, 2500, 2500, 2500]);
    expect(obligations("A", split, "INR")).toEqual(
      ["B", "C", "D"].map((debtorId) => ({
        debtorId,
        creditorId: "A",
        amountMinor: 2500,
        remainingMinor: 2500,
        currency: "INR",
      })),
    );
  });
  it("allocates remainder deterministically", () => {
    expect(
      splitExpense(101, members, "EQUAL").map((s) => s.amountMinor),
    ).toEqual([26, 25, 25, 25]);
  });
  it("reconciles exact and rejects mismatch", () => {
    expect(
      splitExpense(
        100,
        [
          { userId: "a", value: 17 },
          { userId: "b", value: 83 },
        ],
        "EXACT",
      ).map((s) => s.amountMinor),
    ).toEqual([17, 83]);
    expect(() =>
      splitExpense(101, [{ userId: "a", value: 100 }], "EXACT"),
    ).toThrow();
  });
  it("supports basis point percentages", () => {
    expect(
      splitExpense(
        101,
        [
          { userId: "a", value: 3333 },
          { userId: "b", value: 6667 },
        ],
        "PERCENTAGE",
      ).map((s) => s.amountMinor),
    ).toEqual([34, 67]);
    expect(() =>
      splitExpense(100, [{ userId: "a", value: 33 }], "PERCENTAGE"),
    ).toThrow();
  });
  it("supports shares and zero allocations", () => {
    expect(
      splitExpense(
        10,
        [
          { userId: "a", value: 1 },
          { userId: "b", value: 2 },
          { userId: "c", value: 0 },
        ],
        "SHARES",
      ).map((s) => s.amountMinor),
    ).toEqual([3, 7, 0]);
  });
  it("reconciles varied totals and never mutates participants", () => {
    for (let n = 1; n <= 50; n++)
      for (const total of [1, 7, 103, 999999999999]) {
        const m = Array.from({ length: n }, (_, i) => ({
          userId: String(i),
          value: i + 1,
        }));
        const snapshot = JSON.stringify(m);
        const s = splitExpense(total, m, "SHARES");
        expect(s.reduce((a, b) => a + b.amountMinor, 0)).toBe(total);
        expect(s.every((a) => a.amountMinor >= 0)).toBe(true);
        expect(JSON.stringify(m)).toBe(snapshot);
      }
  });
  it("rejects duplicate users and unsafe amounts", () => {
    expect(() =>
      splitExpense(10, [{ userId: "a" }, { userId: "a" }], "EQUAL"),
    ).toThrow();
    expect(() =>
      splitExpense(Number.MAX_SAFE_INTEGER, members, "EQUAL"),
    ).toThrow();
  });
});
describe("repayments & simplification", () => {
  const debts: Debt[] = [
    {
      id: "one",
      debtorId: "b",
      creditorId: "a",
      amountMinor: 100,
      remainingMinor: 100,
      currency: "INR",
    },
    {
      id: "two",
      debtorId: "b",
      creditorId: "a",
      amountMinor: 50,
      remainingMinor: 50,
      currency: "INR",
    },
    {
      id: "three",
      debtorId: "b",
      creditorId: "c",
      amountMinor: 70,
      remainingMinor: 70,
      currency: "INR",
    },
  ];
  it("applies partial repayment to the correct pair", () =>
    expect(applyRepayment(debts, "b", "a", 125, "INR")).toEqual([
      { obligationId: "one", amountMinor: 100 },
      { obligationId: "two", amountMinor: 25 },
    ]));
  it("settles fully and rejects overpayment and wrong currency", () => {
    expect(applyRepayment(debts, "b", "a", 150, "INR")).toHaveLength(2);
    expect(() => applyRepayment(debts, "b", "a", 151, "INR")).toThrow();
    expect(() => applyRepayment(debts, "b", "a", 10, "USD")).toThrow();
    expect(() => applyRepayment(debts, "a", "a", 10, "INR")).toThrow();
  });
  it("simplifies without changing net balances or history", () => {
    const before = JSON.stringify(debts);
    const result = simplifyBalances(debts, "INR");
    const net = (
      d: { debtorId: string; creditorId: string; amountMinor: number }[],
    ) =>
      d.reduce(
        (acc, v) => {
          acc[v.debtorId] = (acc[v.debtorId] ?? 0) - v.amountMinor;
          acc[v.creditorId] = (acc[v.creditorId] ?? 0) + v.amountMinor;
          return acc;
        },
        {} as Record<string, number>,
      );
    expect(net(result)).toEqual(net(debts));
    expect(JSON.stringify(debts)).toBe(before);
  });
});
describe("imports & UPI security", () => {
  it("extracts and canonicalizes only supported UPI parameters", () => {
    const p = parseUpi(
      "upi://pay?pa=cafe@okbank&pn=Little%20Cafe&am=120.50&cu=INR&tn=Coffee&url=https://evil.example",
    );
    expect(p.amountMinor).toBe(12050);
    expect(p.payeeName).toBe("Little Cafe");
    expect(p.uri).not.toContain("evil");
  });
  it("preserves a valid UPI transaction reference", () => {
    const p = parseUpi(
      "upi://pay?pa=cafe@okbank&pn=Little%20Cafe&am=120.50&cu=INR&tr=172001234567890",
    );
    expect(new URL(p.uri).searchParams.get("tr")).toBe("172001234567890");
    expect(p.fixedAmount).toBe(true);
  });
  it("preserves standard merchant routing fields without callback URLs", () => {
    const p = parseUpi(
      "upi://pay?pa=shop@bank&pn=Shop&mc=5411&tid=SALE123&tr=172001234567890&am=42.00&mam=40.00&cu=INR&mode=02&purpose=00&orgid=000000&sign=abc123&url=https://evil.example",
    );
    const query = new URL(p.uri).searchParams;
    expect(query.get("mc")).toBe("5411");
    expect(query.get("tid")).toBe("SALE123");
    expect(query.get("mode")).toBe("02");
    expect(query.get("sign")).toBe("abc123");
    expect(query.has("url")).toBe(false);
  });
  it.each([
    "https://evil.example",
    "upi://pay?pa=a@b",
    "upi://pay?pa=cafe@bank&am=-10",
    "upi://pay?pa=cafe@bank&am=10&am=20",
    "upi://pay?pa=cafe@bank&cu=USD",
    "upi://pay/evil?pa=cafe@bank",
  ])("rejects unsafe QR %s", (uri) => expect(() => parseUpi(uri)).toThrow());
  it("parses debit and credit suggestions, excludes OTP", () => {
    expect(
      parseSms(
        "INR 1,234.50 debited from a/c XX1234 at CORNER CAFE Ref ABC12345",
        100000,
      )?.amountMinor,
    ).toBe(123450);
    expect(parseSms("Rs 10 credited to your account", 100000)?.direction).toBe(
      "CREDIT",
    );
    expect(parseSms("OTP 321222 for INR 500 paid", 100000)).toBeNull();
  });
  it("uses exactly seven days of handled-message retention", () =>
    expect(SMS_TTL_MS).toBe(604800000));
});
describe("sharing authorization", () => {
  const now = new Date("2026-09-09T10:00:00Z");
  const valid = {
    expiresAt: new Date(+now + 1000),
    revokedAt: null,
    privatePhone: null,
  };
  it("allows a valid public snapshot", () =>
    expect(() => assertShareAccess(valid, null, now)).not.toThrow());
  it("expires at the boundary and honors revocation", () => {
    expect(() =>
      assertShareAccess({ ...valid, expiresAt: now }, null, now),
    ).toThrow();
    expect(() =>
      assertShareAccess({ ...valid, revokedAt: now }, null, now),
    ).toThrow();
  });
  it("requires the exact verified recipient without disclosing the phone", () => {
    const link = { ...valid, privatePhone: "+919876543210" };
    expect(() => assertShareAccess(link, "+919876543211", now)).toThrow(
      "unavailable",
    );
    expect(() => assertShareAccess(link, null, now)).toThrow();
    expect(() => assertShareAccess(link, "+919876543210", now)).not.toThrow();
  });
  it("normalizes Indian phones", () =>
    expect(normalizePhone("98765 43210")).toBe("+919876543210"));
});
describe("analytics & goal periods", () => {
  it("uses local month boundaries in UTC", () =>
    expect(
      periodRange("MONTH", "Asia/Kolkata", new Date("2026-09-09T12:00:00Z")),
    ).toEqual({
      start: "2026-08-31T18:30:00.000Z",
      end: "2026-09-30T18:30:00.000Z",
    }));
  it("handles daylight savings without assuming 24 hour days", () => {
    const p = periodRange(
      "DAY",
      "America/New_York",
      new Date("2026-03-08T12:00:00Z"),
    );
    expect(Date.parse(p.end) - Date.parse(p.start)).toBe(23 * 3600000);
  });
  it("uses Monday week starts and prior month boundaries", () => {
    const p = periodRange("PREVIOUS_WEEK", "UTC", new Date("2026-09-09"));
    expect(p).toEqual({
      start: "2026-08-31T00:00:00.000Z",
      end: "2026-09-07T00:00:00.000Z",
    });
  });
  it("counts personal shares, not full shared totals or loans", () => {
    const d = demoDashboard();
    d.transactions = [
      {
        id: "t",
        title: "Shared",
        amountMinor: 10000,
        currency: "INR",
        sourceId: ids.Utkarsh,
        type: "SHARED_EXPENSE",
        status: "SETTLED",
        occurredAt: "2026-09-09T10:00:00.000Z",
        allocations: [{ userId: ids.Utkarsh, amountMinor: 2500 }],
        tagIds: [],
        version: 1,
      },
    ];
    const f = {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
      currency: "INR",
    };
    expect(analytics(d, f).spendingMinor).toBe(2500);
    d.transactions[0].status = "REVERSED";
    expect(analytics(d, f).spendingMinor).toBe(0);
    d.transactions[0].status = "DISPUTED";
    expect(analytics(d, f).spendingMinor).toBe(0);
  });
  it("uses half-open ranges", () => {
    const d = demoDashboard();
    const t = d.transactions[0];
    d.transactions = [t];
    expect(
      analytics(d, {
        start: new Date(Date.parse(t.occurredAt) - 1000).toISOString(),
        end: t.occurredAt,
        currency: t.currency,
      }).spendingMinor,
    ).toBe(0);
  });
  it("calculates budget thresholds and projected overspend", () => {
    const p = goalProgress(
      10000,
      8000,
      "2026-09-01T00:00:00Z",
      "2026-10-01T00:00:00Z",
      new Date("2026-09-16T00:00:00Z"),
    );
    expect(p).toMatchObject({
      percentage: 80,
      remaining: 2000,
      projectedOverspend: 6000,
      status: "ACTIVE",
    });
  });
});
