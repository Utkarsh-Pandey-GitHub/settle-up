import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../apps/api/src/app";
import { db } from "../apps/api/src/infra/database";
import { cleanup } from "../apps/api/src/worker";
import { ids } from "@settleup/domain/src/fixtures";
import type { Session } from "@settleup/contracts";
const enabled = process.env.RUN_DB_TESTS === "1";
describe.runIf(enabled)("PostgreSQL API integration", () => {
  let app: Awaited<ReturnType<typeof createApp>>,
    a: Session,
    b: Session,
    c: Session;
  let txid: string, share: { id: string; url: string }, settlementId: string;
  const key = randomUUID();
  const started = new Date().toISOString();
  const post = (url: string, payload: any, session?: Session) =>
    app.inject({
      method: "POST",
      url,
      payload,
      headers: session
        ? { authorization: `Bearer ${session.accessToken}` }
        : {},
    });
  async function login(phone: string) {
    const otp = await post("/auth/otp", { phone });
    expect(otp.statusCode).toBe(200);
    const challenge = otp.json();
    const r = await post("/auth/verify", {
      challengeId: challenge.challengeId,
      code: challenge.developmentCode,
    });
    expect(r.statusCode).toBe(200);
    return r.json() as Session;
  }
  beforeAll(async () => {
    app = await createApp();
    a = await login("+919876543210");
    b = await login("+919876543211");
    c = await login("+919876543212");
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.$disconnect();
  });
  const input = () => ({
    idempotencyKey: key,
    title: "Integration shared expense",
    amountMinor: 10003,
    currency: "INR",
    type: "SHARED_EXPENSE",
    status: "SETTLED",
    occurredAt: started,
    ledgerId: ids.goa,
    participants: [ids.Utkarsh, ids.rohan, ids.meera, ids.kabir].map(
      (userId) => ({ userId }),
    ),
  });
  it("requires authentication", async () =>
    expect((await app.inject("/dashboard")).statusCode).toBe(401));
  it("creates one reconciled expense and three obligations under concurrent duplicate requests", async () => {
    const results = await Promise.all([
      post("/transactions", input(), a),
      post("/transactions", input(), a),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json().id).toBe(results[1].json().id);
    txid = results[0].json().id;
    const t = await db.transaction.findUniqueOrThrow({
      where: { id: txid },
      include: { splits: true, obligations: true },
    });
    expect(t.splits.reduce((s, p) => s + p.amountMinor, 0n)).toBe(10003n);
    expect(t.obligations).toHaveLength(3);
    expect(t.obligations.every((o) => o.debtorId !== o.creditorId)).toBe(true);
  });
  it("persists item rows atomically, reconciles totals and isolates them", async () => {
    const bill = {
      ...input(),
      idempotencyKey: randomUUID(),
      type: "PERSONAL_EXPENSE",
      ledgerId: undefined,
      participants: [],
      amountMinor: 28000,
      items: [
        { name: "Coffee", quantity: 2, amountMinor: 16000 },
        { name: "Sandwich", quantity: 1, amountMinor: 12000 },
      ],
    };
    const created = await post("/transactions", bill, a);
    expect(created.statusCode).toBe(200);
    expect((await post("/transactions", bill, a)).json().id).toBe(
      created.json().id,
    );
    const rows = await db.transactionItem.findMany({
      where: { transactionId: created.json().id },
      orderBy: { position: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].quantity)).toBe(2);
    const mine = await app.inject({
      url: "/dashboard",
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(
      mine.json().transactions.find((t: any) => t.id === created.json().id)
        .items,
    ).toEqual(bill.items);
    const other = await app.inject({
      url: "/dashboard",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(
      other.json().transactions.some((t: any) => t.id === created.json().id),
    ).toBe(false);
    const rejected = await post(
      "/transactions",
      { ...bill, idempotencyKey: randomUUID(), amountMinor: 28001 },
      a,
    );
    expect(rejected.statusCode).toBe(400);
  });
  it("rejects reused idempotency key with different content", async () =>
    expect(
      (await post("/transactions", { ...input(), amountMinor: 99 }, a))
        .statusCode,
    ).toBe(409));
  it("rejects injected source account, invalid foreign ledger, and another account’s tags", async () => {
    const own = await post(
      "/transactions",
      {
        idempotencyKey: randomUUID(),
        title: "Personal",
        amountMinor: 100,
        currency: "INR",
        type: "PERSONAL_EXPENSE",
        occurredAt: started,
        sourceId: ids.rohan,
      },
      a,
    );
    expect(own.statusCode).toBe(200);
    expect(own.json().sourceId).toBe(ids.Utkarsh);
    expect(
      (
        await post(
          "/transactions",
          { ...input(), idempotencyKey: randomUUID(), ledgerId: randomUUID() },
          a,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          "/transactions",
          { ...input(), idempotencyKey: randomUUID(), tagIds: [ids.food] },
          b,
        )
      ).statusCode,
    ).toBe(400);
  });
  it("isolates personal transactions across accounts", async () => {
    const personal = await post(
      "/transactions",
      {
        idempotencyKey: randomUUID(),
        title: "Private only",
        amountMinor: 600,
        currency: "INR",
        type: "PERSONAL_EXPENSE",
        occurredAt: started,
      },
      a,
    );
    const view = await app.inject({
      url: "/dashboard",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(
      view.json().transactions.some((t: any) => t.id === personal.json().id),
    ).toBe(false);
    expect(
      (
        await post(
          `/transactions/${personal.json().id}/actions`,
          { action: "reverse", version: 1, reason: "not mine" },
          b,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("authorizes specific debtor and records partial repayment atomically", async () => {
    const body = {
      idempotencyKey: randomUUID(),
      ledgerId: ids.goa,
      debtorId: ids.rohan,
      creditorId: ids.Utkarsh,
      amountMinor: 123,
      currency: "INR",
    };
    expect((await post("/settlements", body, a)).statusCode).toBe(403);
    const before = await db.obligation.aggregate({
      where: {
        ledgerId: ids.goa,
        debtorId: ids.rohan,
        creditorId: ids.Utkarsh,
      },
      _sum: { remainingMinor: true },
    });
    const settled = await post("/settlements", body, b);
    expect(settled.statusCode).toBe(200);
    settlementId = settled.json().id;
    const after = await db.obligation.aggregate({
      where: {
        ledgerId: ids.goa,
        debtorId: ids.rohan,
        creditorId: ids.Utkarsh,
      },
      _sum: { remainingMinor: true },
    });
    expect(before._sum.remainingMinor! - after._sum.remainingMinor!).toBe(123n);
    expect((await post("/settlements", body, b)).json().id).toBe(settlementId);
  });
  it("reverses repayments with history intact", async () => {
    const before = await db.obligation.aggregate({
      where: {
        ledgerId: ids.goa,
        debtorId: ids.rohan,
        creditorId: ids.Utkarsh,
      },
      _sum: { remainingMinor: true },
    });
    expect(
      (
        await post(
          `/transactions/${settlementId}/actions`,
          { action: "reverse", version: 1, reason: "Recorded by mistake" },
          b,
        )
      ).statusCode,
    ).toBe(200);
    const after = await db.obligation.aggregate({
      where: {
        ledgerId: ids.goa,
        debtorId: ids.rohan,
        creditorId: ids.Utkarsh,
      },
      _sum: { remainingMinor: true },
    });
    expect(after._sum.remainingMinor! - before._sum.remainingMinor!).toBe(123n);
    expect(
      await db.transaction.count({
        where: { correctsId: settlementId, type: "REVERSAL" },
      }),
    ).toBe(1);
  });
  it("enforces dispute lifecycle and original versions", async () => {
    expect(
      (
        await post(
          `/transactions/${txid}/actions`,
          {
            action: "dispute",
            version: 1,
            reason: "Please confirm this amount",
          },
          b,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await post(
          `/transactions/${txid}/actions`,
          { action: "resolve", version: 2, reason: "Payer dismissal" },
          a,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          `/transactions/${txid}/actions`,
          { action: "resolve", version: 2, reason: "Confirmed with receipt" },
          b,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await post(
          `/transactions/${txid}/actions`,
          { action: "reverse", version: 1, reason: "Stale request" },
          a,
        )
      ).statusCode,
    ).toBe(409);
  });
  it("binds private snapshots to verified phones and projects out internal IDs", async () => {
    const response = await post(
      "/shares",
      {
        start: "2026-01-01T00:00:00.000Z",
        end: "2027-01-01T00:00:00.000Z",
        currency: "INR",
        recipientPhone: "+919876543211",
        includeTransactions: true,
        showDescriptions: false,
      },
      a,
    );
    expect(response.statusCode).toBe(200);
    share = response.json();
    const token = share.url.split("/").pop();
    expect((await app.inject(`/shared/${token}`)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          url: `/shared/${token}`,
          headers: { authorization: `Bearer ${c.accessToken}` },
        })
      ).statusCode,
    ).toBe(404);
    const allowed = await app.inject({
      url: `/shared/${token}`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).not.toContain(ids.Utkarsh);
    expect(allowed.body).not.toContain("+919876543211");
    expect(
      allowed.json().transactions.every((t: any) => !("description" in t)),
    ).toBe(true);
  });
  it("revokes links and records denied access", async () => {
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/shares/${share.id}`,
          headers: { authorization: `Bearer ${a.accessToken}` },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: `/shared/${share.url.split("/").pop()}`,
          headers: { authorization: `Bearer ${b.accessToken}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      await db.sharedLinkAccessEvent.count({
        where: { linkId: share.id, allowed: false },
      }),
    ).toBeGreaterThan(0);
  });
  it("deduplicates SMS fingerprints and removes expired records", async () => {
    const fingerprint = "a".repeat(64);
    await post("/imports/handled", { fingerprint, decision: "REJECTED" }, a);
    await post("/imports/handled", { fingerprint, decision: "REJECTED" }, a);
    expect(
      await db.smsImportRecord.count({
        where: { ownerId: a.account.id, fingerprint },
      }),
    ).toBe(1);
    await db.smsImportRecord.updateMany({
      where: { ownerId: a.account.id, fingerprint },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await cleanup();
    expect(
      await db.smsImportRecord.count({
        where: { ownerId: a.account.id, fingerprint },
      }),
    ).toBe(0);
  });
  it("consumes OTP once and limits failed attempts", async () => {
    const otp = (await post("/auth/otp", { phone: "+919876543213" })).json();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await post("/auth/verify", {
            challengeId: otp.challengeId,
            code: "000000",
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await post("/auth/verify", {
          challengeId: otp.challengeId,
          code: otp.developmentCode,
        })
      ).statusCode,
    ).toBe(401);
  });
  it("refreshes an existing monitoring link after financial changes", async () => {
    const result = await post(
      "/shares",
      {
        start: "2026-01-01T00:00:00.000Z",
        end: "2027-01-01T00:00:00.000Z",
        currency: "INR",
        includeTransactions: true,
        showDescriptions: true,
      },
      a,
    );
    const path = `/shared/${result.json().url.split("/").pop()}`;
    const before = (await app.inject(path)).json();
    await post(
      "/transactions",
      {
        idempotencyKey: randomUUID(),
        title: "Not in existing snapshot",
        amountMinor: 6543,
        currency: "INR",
        type: "PERSONAL_EXPENSE",
        occurredAt: started,
      },
      a,
    );
    const after = (await app.inject(path)).json();
    expect(after.spendingMinor).toBe(before.spendingMinor + 6543);
    expect(after.transactions.some((entry: any) => entry.description === "Not in existing snapshot")).toBe(true);
  });
  it("records incoming adjustments without creating false spending or debt", async () => {
    const result = await post(
      "/transactions",
      {
        idempotencyKey: randomUUID(),
        title: "Income test",
        amountMinor: 900,
        currency: "INR",
        type: "ADJUSTMENT",
        occurredAt: started,
      },
      a,
    );
    expect(result.statusCode).toBe(200);
    expect(result.json().destinationId).toBe(a.account.id);
    expect(
      await db.obligation.count({ where: { transactionId: result.json().id } }),
    ).toBe(0);
  });
  it("rotates refresh tokens and revokes the family on replay", async () => {
    const refreshed = await post("/auth/refresh", {
      refreshToken: c.refreshToken,
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().refreshToken).not.toBe(c.refreshToken);
    expect(
      (await post("/auth/refresh", { refreshToken: c.refreshToken }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: "/dashboard",
          headers: { authorization: `Bearer ${refreshed.json().accessToken}` },
        })
      ).statusCode,
    ).toBe(401);
  });
});
