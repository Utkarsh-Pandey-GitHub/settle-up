import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type {
  Dashboard,
  CreateTransaction,
  CreateSettlement,
  CreateShare,
  CreateGoal,
  Session,
} from "@settleup/contracts";
import {
  createTransactionSchema,
  settlementSchema,
  goalSchema,
  shareSchema,
} from "@settleup/contracts";
import {
  DomainError,
  splitExpense,
  obligations,
  applyRepayment,
} from "@settleup/domain";
import { analytics } from "@settleup/domain/src/analytics";
import { demoDashboard } from "@settleup/domain/src/fixtures";
import { DEMO, getTokenSession, replaceTokenSession } from "./session";
export const uuid = () => Crypto.randomUUID();
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const refreshing = new Map<string, Promise<Session>>();
export async function request<T>(
  path: string,
  options: { accountId?: string; body?: unknown; method?: string } = {},
  retried = false,
): Promise<T> {
  const session = options.accountId
    ? getTokenSession(options.accountId)
    : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  let result: any;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      signal: controller.signal,
    });
    const text = await response.text();
    try {
      result = JSON.parse(text);
    } catch {
      result = {
        code: "SERVER_ERROR",
        message: text.trim() || `Server error (${response.status})`,
      };
    }

  } catch (error) {
    if (controller.signal.aborted)
      throw new DomainError(
        "TIMEOUT",
        "The request timed out. Check your connection and try again.",
        408,
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 && session && options.accountId && !retried) {
    const id = options.accountId;
    if (!refreshing.has(id))
      refreshing.set(
        id,
        request<Session>("/auth/refresh", {
          body: { refreshToken: session.refreshToken },
        })
          .then(async (s) => {
            await replaceTokenSession(id, s);
            return s;
          })
          .finally(() => {
            refreshing.delete(id);
          }),
      );
    await refreshing.get(id);
    return request(path, options, true);
  }
  if (!response.ok)
    throw new DomainError(
      result.code ?? "NETWORK",
      result.message ?? "Unable to complete your request.",
      response.status,
    );
  return result;
}
export interface AppRepository {
  dashboard(accountId: string): Promise<Dashboard>;
  create(accountId: string, input: CreateTransaction): Promise<unknown>;
  settle(accountId: string, input: CreateSettlement): Promise<unknown>;
  action(
    accountId: string,
    id: string,
    action: string,
    version: number,
    reason: string,
  ): Promise<unknown>;
  deleteTransactions(accountId: string, ids: string[]): Promise<unknown>;
  createGoal(accountId: string, input: CreateGoal): Promise<unknown>;
  share(
    accountId: string,
    input: CreateShare,
  ): Promise<{ id: string; url: string; expiresAt: string }>;
}
const cache = new Map<string, Dashboard>();
async function demoLoad(id: string) {
  if (!cache.has(id)) {
    const raw = await AsyncStorage.getItem(`settleup.demo.v1.${id}`);
    cache.set(id, raw ? JSON.parse(raw) : demoDashboard(id));
  }
  return cache.get(id)!;
}
async function save(id: string, data: Dashboard) {
  cache.set(id, data);
  await AsyncStorage.setItem(`settleup.demo.v1.${id}`, JSON.stringify(data));
}
const requestKeys = new Map<string, string>();
const originalDebts = new Map<string, { id: string; amountMinor: number }[]>();
const demoShares = new Map<
  string,
  {
    id: string;
    ownerId: string;
    expiresAt: string;
    revoked: boolean;
    payload: unknown;
  }
>();
export class DemoRepository implements AppRepository {
  async dashboard(id: string) {
    const d: Dashboard = JSON.parse(JSON.stringify(await demoLoad(id)));
    d.goals.forEach((g) => {
      g.spentMinor = analytics(d, g).spendingMinor;
    });
    return d;
  }
  async create(id: string, raw: CreateTransaction) {
    const input = createTransactionSchema.parse(raw);
    const d = await demoLoad(id);
    const key = `${id}:${input.idempotencyKey}`,
      hash = JSON.stringify(input);
    if (requestKeys.has(key)) {
      if (requestKeys.get(key) !== hash)
        throw new Error("Request key already used.");
      const existing = d.transactions.find(
        (t) =>
          (t as any).idempotencyKey === input.idempotencyKey &&
          t.type !== "REVERSAL",
      );
      if (existing) return { id: existing.id };
      throw new Error(
        "This request has already been used. Start a new expense.",
      );
    }
    const ledger = input.ledgerId
      ? d.ledgers.find((l) => l.id === input.ledgerId && !l.archived)
      : null;
    if (input.ledgerId && (!ledger || ledger.currency !== input.currency))
      throw new Error("Choose an active ledger with this currency.");
    if (
      input.participants.some(
        (p) => !ledger?.members.some((m) => m.id === p.userId),
      )
    )
      throw new Error("Choose ledger members.");
    const splits =
      input.type === "SHARED_EXPENSE"
        ? splitExpense(input.amountMinor, input.participants, input.splitMethod)
        : [];
    const transactionId = uuid();
    d.transactions.unshift({
      ...input,
      id: transactionId,
      sourceId: id,
      destinationId: input.type === "ADJUSTMENT" ? id : input.destinationId,
      allocations: splits,
      version: 1,
    });
    const debts =
      input.type === "SHARED_EXPENSE"
        ? obligations(id, splits, input.currency)
        : input.type === "LOAN"
          ? [
              {
                debtorId: input.destinationId!,
                creditorId: id,
                amountMinor: input.amountMinor,
                remainingMinor: input.amountMinor,
                currency: input.currency,
              },
            ]
          : [];
    const created = debts.map((debt) => ({
      ...debt,
      id: uuid(),
      ledgerId: input.ledgerId!,
    }));
    d.obligations.push(...created);
    originalDebts.set(
      transactionId,
      created.map((o) => ({ id: o.id, amountMinor: o.amountMinor })),
    );
    d.activity.unshift({
      id: uuid(),
      message: `You added ${input.title}`,
      createdAt: new Date().toISOString(),
      ledgerId: input.ledgerId,
    });
    requestKeys.set(key, hash);
    await save(id, d);
    return { id: transactionId };
  }
  async settle(id: string, raw: CreateSettlement) {
    const input = settlementSchema.parse(raw);
    if (input.debtorId !== id)
      throw new Error("Switch to the paying account to record a repayment.");
    const key = `${id}:${input.idempotencyKey}`,
      hash = JSON.stringify(input);
    if (requestKeys.has(key)) {
      if (requestKeys.get(key) !== hash)
        throw new Error("Request key already used.");
      return;
    }
    const d = await demoLoad(id);
    const payments = applyRepayment(
      d.obligations.filter((o) => o.ledgerId === input.ledgerId),
      input.debtorId,
      input.creditorId,
      input.amountMinor,
      input.currency,
    );
    payments.forEach((p) => {
      d.obligations.find((o) => o.id === p.obligationId)!.remainingMinor -=
        p.amountMinor;
    });
    const txid = uuid();
    originalDebts.set(
      txid,
      payments.map((p) => ({
        id: p.obligationId,
        amountMinor: -p.amountMinor,
      })),
    );
    d.transactions.unshift({
      id: txid,
      title: "Settlement",
      amountMinor: input.amountMinor,
      currency: input.currency,
      type: "SETTLEMENT",
      status: "SETTLED",
      occurredAt: new Date().toISOString(),
      sourceId: id,
      destinationId: input.creditorId,
      ledgerId: input.ledgerId,
      tagIds: [],
      allocations: [],
      version: 1,
    });
    requestKeys.set(key, hash);
    d.activity.unshift({
      id: uuid(),
      message: "You recorded a repayment",
      createdAt: new Date().toISOString(),
      ledgerId: input.ledgerId,
    });
    await save(id, d);
  }
  async action(
    id: string,
    txid: string,
    action: string,
    version: number,
    reason: string,
  ) {
    const d = await demoLoad(id);
    const t = d.transactions.find((t) => t.id === txid);
    if (!t || t.version !== version)
      throw new Error("Refresh this record and try again.");
    if (action === "complete") {
      if (t.status !== "PENDING")
        throw new Error("Only pending payments can be completed.");
      t.status = "SETTLED";
    }
    if (action === "dispute") {
      if (!["SETTLED", "PENDING_LOAN"].includes(t.status))
        throw new Error("Only posted entries can be disputed.");
      t.status = "DISPUTED";
    }
    if (action === "resolve") {
      if (t.status !== "DISPUTED") throw new Error("There is no open dispute.");
      t.status = t.type === "LOAN" ? "PENDING_LOAN" : "SETTLED";
    }
    if (action === "reverse") {
      if (["REVERSED", "DISPUTED"].includes(t.status) || t.type === "REVERSAL")
        throw new Error("This entry cannot be reversed.");
      if (
        (t.type === "SHARED_EXPENSE" ||
          t.type === "LOAN" ||
          t.type === "SETTLEMENT") &&
        !originalDebts.has(txid)
      )
        throw new Error(
          "Seeded demo financial records are read-only. Create a new entry to try reversals.",
        );
      for (const original of originalDebts.get(txid) ?? []) {
        const debt = d.obligations.find((o) => o.id === original.id)!;
        if (
          original.amountMinor > 0 &&
          debt.remainingMinor !== debt.amountMinor
        )
          throw new Error("Reverse repayments first.");
      }
      for (const original of originalDebts.get(txid) ?? []) {
        const debt = d.obligations.find((o) => o.id === original.id)!;
        debt.remainingMinor =
          original.amountMinor > 0
            ? 0
            : debt.remainingMinor - original.amountMinor;
      }
      t.status = "REVERSED";
      d.transactions.unshift({
        ...t,
        id: uuid(),
        title: `Reversal: ${t.title}`,
        type: "REVERSAL",
        status: "SETTLED",
        notes: reason,
        occurredAt: new Date().toISOString(),
        allocations: [],
        tagIds: [],
      });
    }
    t.version++;
    d.activity.unshift({
      id: uuid(),
      message: `${action}: ${t.title} — ${reason}`,
      createdAt: new Date().toISOString(),
      ledgerId: t.ledgerId,
    });
    await save(id, d);
  }
  async deleteTransactions(id: string, ids: string[]) {
    const d = await demoLoad(id);
    d.transactions = d.transactions.filter((t) => !ids.includes(t.id));
    await save(id, d);
  }
  async createGoal(id: string, input: CreateGoal) {
    const goal = goalSchema.parse(input);
    const d = await demoLoad(id);
    d.goals.push({ ...goal, id: uuid(), spentMinor: 0 });
    await save(id, d);
  }
  async share(id: string, input: CreateShare) {
    const s = shareSchema.parse(input);
    if (s.recipientPhone)
      throw new Error(
        "Private phone-verified sharing requires API mode. Public demo previews work on this device.",
      );
    const d = await this.dashboard(id);
    const shareId = uuid(),
      token = uuid(),
      expiresAt = new Date(
        Date.now() + s.expiresInHours * 3600000,
      ).toISOString();
    const a = analytics(d, s);
    demoShares.set(token, {
      id: shareId,
      ownerId: id,
      expiresAt,
      revoked: false,
      payload: {
        owner: d.account.name,
        coverage: { start: s.start, end: s.end },
        expiresAt,
        currency: s.currency,
        spendingMinor: a.spendingMinor,
        outgoingMinor: a.outgoingMinor,
        incomingMinor: a.incomingMinor,
        categories: a.byTag.map((t) => ({
          name: d.tags.find((g) => g.id === t.id)?.name ?? "Uncategorized",
          amountMinor: t.amountMinor,
        })),
      },
    });
    return { id: shareId, url: `/shared/${token}`, expiresAt };
  }
  async extra(
    id: string,
    path: string,
    body?: any,
    method?: string,
  ): Promise<any> {
    const d = await demoLoad(id);
    if (path === "/groups") {
      const selected = new Set<string>(body.memberIds ?? []);
      for (const contact of body.contacts ?? []) {
        let peer = d.peers.find(p => p.phone === contact.phone);
        if (!peer) { peer = { ...contact, id: uuid() }; d.peers.push(peer!); }
        selected.add(peer!.id);
      }
      const groupId = uuid();
      d.ledgers.push({
        id: groupId,
        groupId,
        name: body.name,
        description: body.description,
        currency: body.currency,
        members: [
          { id, name: d.account.name, role: "OWNER" },
          ...d.peers
            .filter((p) => selected.has(p.id))
            .map((p) => ({ ...p, role: "MEMBER" })),
        ],
        archived: false,
      });
    } else if (path === "/tags")
      d.tags.push({ id: uuid(), ...body, archived: false });
    else if (path.startsWith("/tags/")) {
      const t = d.tags.find((t) => t.id === path.split("/")[2]);
      if (t) Object.assign(t, body);
    } else if (path.startsWith("/goals/"))
      d.goals = d.goals.filter((g) => g.id !== path.split("/")[2]);
    else if (path.startsWith("/ledgers/")) {
      const l = d.ledgers.find((l) => l.id === path.split("/")[2]);
      if (l) Object.assign(l, body);
    } else if (path === "/peers") d.peers.push({ id: uuid(), ...body });
    else if (path === "/profile") Object.assign(d.account, body);
    else if (path === "/notifications") {
      if (!body) return d.activity;
    } else if (path === "/shares")
      return [...demoShares.values()]
        .filter((s) => s.ownerId === id)
        .map((s) => ({
          id: s.id,
          expiresAt: s.expiresAt,
          revokedAt: s.revoked ? new Date().toISOString() : null,
        }));
    else if (path.startsWith("/shares/") && method === "DELETE") {
      for (const s of demoShares.values())
        if (s.ownerId === id && s.id === path.split("/")[2]) s.revoked = true;
    } else if (path === "/account/export")
      return { data: d, exportedAt: new Date().toISOString() };
    else if (path === "/account" && method === "DELETE") {
      await AsyncStorage.removeItem(`settleup.demo.v1.${id}`);
      cache.delete(id);
      const photoKeys = (await AsyncStorage.getAllKeys()).filter((key) =>
        key.startsWith(`settleup.demo.bill.${id}.`),
      );
      if (photoKeys.length) await AsyncStorage.multiRemove(photoKeys);
      return { ok: true };
    } else if (path === "/sessions") return [];
    else throw new Error("This security feature requires API mode.");
    await save(id, d);
    return { ok: true };
  }
}
class ApiRepository implements AppRepository {
  dashboard = (accountId: string) =>
    request<Dashboard>("/dashboard", { accountId });
  create = (accountId: string, body: CreateTransaction) =>
    request("/transactions", { accountId, body });
  settle = (accountId: string, body: CreateSettlement) =>
    request("/settlements", { accountId, body });
  action = (
    accountId: string,
    id: string,
    action: string,
    version: number,
    reason: string,
  ) =>
    request(`/transactions/${id}/actions`, {
      accountId,
      body: { action, version, reason },
    });
  deleteTransactions = (accountId: string, ids: string[]) =>
    request("/transactions/delete", {
      accountId,
      body: { ids },
      method: "POST",
    });
  createGoal = (accountId: string, body: CreateGoal) =>
    request("/goals", { accountId, body });
  share = (accountId: string, body: CreateShare) =>
    request<{ id: string; url: string; expiresAt: string }>("/shares", {
      accountId,
      body,
    });
}
export const repository: AppRepository = DEMO
  ? new DemoRepository()
  : new ApiRepository();
export const extra = (
  accountId: string,
  path: string,
  body?: unknown,
  method?: string,
) =>
  DEMO
    ? (repository as DemoRepository).extra(accountId, path, body, method)
    : request<any>(path, { accountId, body, method });
export async function sharedSnapshot(
  token: string,
  accountId?: string,
): Promise<any> {
  if (!DEMO) return request(`/shared/${token}`, { accountId });
  const s = demoShares.get(token);
  if (!s || s.revoked || s.expiresAt <= new Date().toISOString())
    throw new Error("This demo link is unavailable or expired.");
  return s.payload;
}

// Demo photos are device-local; API photos reuse the existing private attachment flow.
export async function getDemoBillPhoto(
  accountId: string,
  transactionId: string,
) {
  const d = await demoLoad(accountId);
  if (!d.transactions.some((t) => t.id === transactionId))
    throw new Error("Expense unavailable.");
  return AsyncStorage.getItem(
    `settleup.demo.bill.${accountId}.${transactionId}`,
  );
}
const billUploads = new Map<
  string,
  { id: string; uploadUrl: string; uploaded: boolean }
>();
export async function saveBillPhoto(
  accountId: string,
  transactionId: string,
  photo: { uri: string; contentType: string },
) {
  const blob = await (await fetch(photo.uri)).blob();
  if (!blob.size || blob.size > 10485760)
    throw new Error("Bill photos must be under 10 MB.");
  if (DEMO) {
    const d = await demoLoad(accountId);
    if (!d.transactions.some((t) => t.id === transactionId))
      throw new Error("Expense unavailable.");
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the photo."));
      reader.readAsDataURL(blob);
    });
    await AsyncStorage.setItem(
      `settleup.demo.bill.${accountId}.${transactionId}`,
      dataUri,
    );
    return;
  }
  const key = `${accountId}:${transactionId}`;
  let upload = billUploads.get(key);
  if (!upload) {
    upload = {
      ...(await extra(accountId, `/transactions/${transactionId}/attachments`, {
        contentType: photo.contentType,
        size: blob.size,
      })),
      uploaded: false,
    };
    billUploads.set(key, upload!);
  }
  if (!upload!.uploaded) {
    const response = await fetch(upload!.uploadUrl, {
      method: "PUT",
      headers: { "content-type": photo.contentType },
      body: blob,
    });
    if (!response.ok) {
      const checked = await extra(
        accountId,
        `/attachments/${upload!.id}/complete`,
        {},
      );
      if (checked.state !== "READY")
        throw new Error(
          "Photo upload failed. Try again, or attach a new photo from the saved expense.",
        );
    }
    upload!.uploaded = true;
  }
  const result = await extra(
    accountId,
    `/attachments/${upload!.id}/complete`,
    {},
  );
  if (result?.state !== "READY")
    throw new Error(
      result?.state === "REJECTED"
        ? "This photo was rejected. Attach a valid photo from the saved expense."
        : "The photo is awaiting its storage check. Retry shortly.",
    );
  billUploads.delete(key);
}
