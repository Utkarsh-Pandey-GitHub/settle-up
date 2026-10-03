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
  periodRange,
} from "@settleup/domain";
import { analytics } from "@settleup/domain/src/analytics";
import { demoDashboard } from "@settleup/domain/src/fixtures";
import { DEMO, getTokenSession, replaceTokenSession } from "./session";
export const uuid = () => Crypto.randomUUID();

// Keep explicit device routing: USB uses localhost with adb reverse;
// emulator users can configure 10.0.2.2 in their environment.
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");
const dashboardCacheKey = (accountId: string) =>
  `settleup.dashboard.v1.${accountId}`;
type DashboardListener = (accountId: string, dashboard: Dashboard) => void;
const dashboardListeners = new Set<DashboardListener>();
const dashboardMemory = new Map<string, Dashboard>();
const dashboardReads = new Map<string, Promise<Dashboard | undefined>>();
const dashboardWrites = new Map<string, Promise<void>>();
const dashboardRevisions = new Map<string, number>();
export function subscribeCachedDashboard(listener: DashboardListener) {
  dashboardListeners.add(listener);
  return () => {
    dashboardListeners.delete(listener);
  };
}
async function writeCachedDashboard(accountId: string, dashboard: Dashboard) {
  dashboardMemory.set(accountId, dashboard);
  dashboardRevisions.set(
    accountId,
    (dashboardRevisions.get(accountId) ?? 0) + 1,
  );
  dashboardListeners.forEach((listener) => listener(accountId, dashboard));
  const previous = dashboardWrites.get(accountId) ?? Promise.resolve();
  const write = previous
    .catch(() => {})
    .then(() =>
      AsyncStorage.setItem(
        dashboardCacheKey(accountId),
        JSON.stringify(dashboard),
      ),
    )
    .finally(() => {
      if (dashboardWrites.get(accountId) === write)
        dashboardWrites.delete(accountId);
    });
  dashboardWrites.set(accountId, write);
  await write;
}
export async function readCachedDashboard(accountId: string) {
  const memory = dashboardMemory.get(accountId);
  if (memory) return memory;
  const pending = dashboardReads.get(accountId);
  if (pending) return pending;
  const read = AsyncStorage.getItem(dashboardCacheKey(accountId))
    .then(async (value) => {
      if (!value) return undefined;
      try {
        const dashboard = JSON.parse(value) as Dashboard;
        dashboardMemory.set(accountId, dashboard);
        return dashboard;
      } catch {
        await AsyncStorage.removeItem(dashboardCacheKey(accountId));
        return undefined;
      }
    })
    .finally(() => dashboardReads.delete(accountId));
  dashboardReads.set(accountId, read);
  return read;
}
export const peekCachedDashboard = (accountId: string) =>
  dashboardMemory.get(accountId);
export const clearCachedDashboard = async (accountId: string) => {
  dashboardMemory.delete(accountId);
  dashboardReads.delete(accountId);
  dashboardRevisions.delete(accountId);
  await AsyncStorage.removeItem(dashboardCacheKey(accountId));
};

type QueuedMutation = {
  id: string;
  accountId: string;
  path: string;
  method: string;
  body?: unknown;
  createdAt: string;
};
const mutationQueueKey = (accountId: string) =>
  `settleup.mutations.v1.${accountId}`;
const queueChanges = new Map<string, Promise<void>>();
const retryable = (error: unknown) =>
  error instanceof DomainError &&
  (["NETWORK_ERROR", "TIMEOUT"].includes(error.code) || error.status >= 500);
async function queuedMutations(accountId: string) {
  const raw = await AsyncStorage.getItem(mutationQueueKey(accountId));
  if (!raw) return [] as QueuedMutation[];
  try {
    return JSON.parse(raw) as QueuedMutation[];
  } catch {
    await AsyncStorage.removeItem(mutationQueueKey(accountId));
    return [] as QueuedMutation[];
  }
}
async function enqueueMutation(
  accountId: string,
  path: string,
  body?: unknown,
  method = "POST",
) {
  const previous = queueChanges.get(accountId) ?? Promise.resolve();
  const change = previous
    .catch(() => {})
    .then(async () => {
      const queue = await queuedMutations(accountId);
      queue.push({
        id: uuid(),
        accountId,
        path,
        method,
        body,
        createdAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem(
        mutationQueueKey(accountId),
        JSON.stringify(queue),
      );
    })
    .finally(() => {
      if (queueChanges.get(accountId) === change)
        queueChanges.delete(accountId);
    });
  queueChanges.set(accountId, change);
  await change;
}
export async function syncPendingMutations(accountId: string) {
  const active = queueSyncs.get(accountId);
  if (active) return active;
  const sync = drainPendingMutations(accountId).finally(() => {
    if (queueSyncs.get(accountId) === sync) queueSyncs.delete(accountId);
  });
  queueSyncs.set(accountId, sync);
  return sync;
}
const queueSyncs = new Map<string, Promise<number | null>>();
async function drainPendingMutations(accountId: string) {
  const queue = await queuedMutations(accountId);
  if (!queue.length) return null;
  const remaining: QueuedMutation[] = [];
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    try {
      await request(item.path, {
        accountId: item.accountId,
        body: item.body,
        method: item.method,
      });
    } catch (error) {
      if (retryable(error)) {
        remaining.push(...queue.slice(index));
        break;
      }
      // Invalid/conflicting queued work must not permanently block newer work.
    }
  }
  if (remaining.length)
    await AsyncStorage.setItem(
      mutationQueueKey(accountId),
      JSON.stringify(remaining),
    );
  else await AsyncStorage.removeItem(mutationQueueKey(accountId));
  return remaining.length;
}
async function queueWhenOffline<T>(
  accountId: string,
  path: string,
  body?: unknown,
  method?: string,
): Promise<T | { queued: true }> {
  const effectiveMethod = method ?? (body === undefined ? "GET" : "POST");
  try {
    return await request<T>(path, { accountId, body, method: effectiveMethod });
  } catch (error) {
    if (!retryable(error) || effectiveMethod === "GET") throw error;
    await enqueueMutation(accountId, path, body, effectiveMethod);
    return { queued: true };
  }
}
async function updateCachedDashboard(
  accountId: string,
  update: (dashboard: Dashboard) => void,
) {
  const dashboard = await readCachedDashboard(accountId);
  if (!dashboard) return;
  update(dashboard);
  await writeCachedDashboard(accountId, dashboard);
}
export async function optimisticDashboardMutation<T>(
  accountId: string,
  update: (dashboard: Dashboard) => void,
  operation: () => Promise<T>,
) {
  const previous = await readCachedDashboard(accountId);
  let persistence: Promise<void> | undefined;
  if (previous) {
    const optimistic = JSON.parse(JSON.stringify(previous)) as Dashboard;
    update(optimistic);
    persistence = writeCachedDashboard(accountId, optimistic);
  }
  try {
    const result = await operation();
    await persistence;
    return result;
  } catch (error) {
    if (previous) await writeCachedDashboard(accountId, previous);
    throw error;
  }
}

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
  // A sleeping hosted API can need a minute to start, before provider verification.
  const timeoutMs =
    path === "/bill/extract"
      ? 65000
      : path.startsWith("/payment-links")
        ? 75000
        : path === "/auth/truecaller"
          ? 30000
          : path.startsWith("/auth/")
            ? 90000
            : 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        message: `The sign-in server returned an unexpected response (${response.status}). Please try again shortly.`,
      };
    }
  } catch (error) {
    if (controller.signal.aborted)
      throw new DomainError(
        "TIMEOUT",
        "The server took too long to respond. Please try again shortly.",
        408,
      );
    throw new DomainError(
      "NETWORK_ERROR",
      "Cannot reach the SettleUp server. Check your connection and try again.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 && session && options.accountId && !retried) {
    const id = options.accountId;
    const latest = getTokenSession(id);
    // Another request may already have rotated this refresh token. Retrying
    // with the newer access token avoids treating a harmless race as replay.
    if (latest && latest.accessToken !== session.accessToken)
      return request(path, options, true);
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
    _reason: string,
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
      ? d.ledgers.find((l) => l.id === input.ledgerId)
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
    if (action !== "complete" || t.status !== "PENDING")
      throw new Error("Only pending payments can be completed.");
    t.status = "SETTLED";
    t.version++;
    d.activity.unshift({
      id: uuid(),
      message: `${t.title} marked completed`,
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
    const weekly = analytics(d, {
      ...periodRange("WEEK", "Asia/Kolkata"),
      currency: s.currency,
      ledgerIds: s.ledgerIds,
      tagIds: s.tagIds,
    });
    const monthly = analytics(d, {
      ...periodRange("MONTH", "Asia/Kolkata"),
      currency: s.currency,
      ledgerIds: s.ledgerIds,
      tagIds: s.tagIds,
    });
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
        weeklySpendingMinor: weekly.spendingMinor,
        monthlySpendingMinor: monthly.spendingMinor,
        byDay: a.byDay,
        updatedAt: new Date().toISOString(),
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
    const transactionMatch = path.match(/^\/transactions\/([^/]+)$/);
    if (transactionMatch && method === "PATCH") {
      const transaction = d.transactions.find(
        (entry) => entry.id === transactionMatch[1],
      );
      if (!transaction) throw new Error("Transaction unavailable.");
      const input = body.transaction as CreateTransaction;
      Object.assign(transaction, {
        ...input,
        id: transaction.id,
        sourceId: transaction.sourceId,
        version: transaction.version + 1,
        allocations:
          input.type === "SHARED_EXPENSE"
            ? splitExpense(
                input.amountMinor,
                input.participants,
                input.splitMethod,
              )
            : [],
      });
      d.activity.unshift({
        id: uuid(),
        ledgerId: transaction.ledgerId,
        message: `${transaction.title} was edited`,
        createdAt: new Date().toISOString(),
      });
    } else if (path === "/groups") {
      const selected = new Set<string>(body.memberIds ?? []);
      for (const contact of body.contacts ?? []) {
        const existing = d.savedContacts.find(
          (entry) => entry.phone === contact.phone,
        );
        const saved = existing ?? { ...contact, id: uuid(), verified: false };
        if (!existing) d.savedContacts.push(saved);
        selected.add(saved.id);
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
          ...d.savedContacts
            .filter((p) => selected.has(p.id))
            .map((p) => ({ ...p, role: "MEMBER" })),
        ],
      });
    } else if (path === "/transactions/assign-group") {
      const ledger = d.ledgers.find((entry) => entry.id === body.ledgerId);
      if (!ledger) throw new Error("Group unavailable.");
      const selected = new Set(body.ids);
      d.transactions.forEach((transaction) => {
        if (selected.has(transaction.id)) transaction.ledgerId = ledger.id;
      });
      d.activity.unshift(
        ...d.transactions
          .filter((transaction) => selected.has(transaction.id))
          .map((transaction) => ({
            id: uuid(),
            ledgerId: ledger.id,
            message: `${transaction.title} moved to ${ledger.name}`,
            createdAt: new Date().toISOString(),
          })),
      );
    } else if (path.match(/^\/groups\/[^/]+$/) && method === "DELETE") {
      const groupId = path.split("/")[2];
      const ledger = d.ledgers.find((entry) => entry.groupId === groupId);
      if (ledger) ledger.deleted = true;
    } else if (path.match(/^\/contacts\/[^/]+$/) && method === "DELETE") {
      const contactId = path.split("/")[2];
      d.savedContacts = d.savedContacts.filter(
        (contact) => contact.id !== contactId,
      );
    } else if (path.match(/^\/contacts\/[^/]+$/) && method === "PATCH") {
      const contactId = path.split("/")[2];
      const contact = d.savedContacts.find((entry) => entry.id === contactId);
      if (contact) contact.name = body.name;
    } else if (path === "/tags")
      d.tags.push({ id: uuid(), ...body, archived: false });
    else if (path.startsWith("/tags/")) {
      const t = d.tags.find((t) => t.id === path.split("/")[2]);
      if (t) Object.assign(t, body);
    } else if (path.startsWith("/goals/"))
      d.goals = d.goals.filter((g) => g.id !== path.split("/")[2]);
    else if (path.match(/^\/groups\/[^/]+\/members$/) && method !== "DELETE") {
      const groupId = path.split("/")[2];
      const ledger = d.ledgers.find((entry) => entry.groupId === groupId);
      if (ledger) {
        const next = [
          ...(body.memberIds ?? [])
            .map((memberId: string) =>
              d.savedContacts.find((item) => item.id === memberId),
            )
            .filter(Boolean),
          ...(body.contacts ?? []).map(
            (contact: { name: string; phone: string }) => {
              const existing = d.savedContacts.find(
                (item) => item.phone === contact.phone,
              );
              const saved = existing ?? {
                ...contact,
                id: uuid(),
                verified: false,
              };
              if (!existing) d.savedContacts.push(saved);
              return saved;
            },
          ),
        ];
        for (const member of next)
          if (!ledger.members.some((item) => item.id === member.id))
            ledger.members.push({
              id: member.id,
              name: member.name,
              role: "MEMBER",
            });
      }
    } else if (path.includes("/members/") && method === "DELETE") {
      const [, , groupId, , memberId] = path.split("/");
      const ledger = d.ledgers.find((entry) => entry.groupId === groupId);
      if (ledger) {
        const member = ledger.members.find((entry) => entry.id === memberId);
        ledger.members = ledger.members.filter(
          (entry) => entry.id !== memberId,
        );
        d.activity.unshift({
          id: uuid(),
          ledgerId: ledger.id,
          message: `${member?.name ?? "A member"} was removed from the group`,
          createdAt: new Date().toISOString(),
        });
      }
    } else if (path.startsWith("/ledgers/")) {
      const l = d.ledgers.find((l) => l.id === path.split("/")[2]);
      if (l) Object.assign(l, body);
    } else if (path === "/blocks") return { ok: true };
    else if (path === "/profile") {
      Object.assign(d.account, body);
      for (const ledger of d.ledgers) {
        const member = ledger.members.find((entry) => entry.id === id);
        if (member)
          Object.assign(member, {
            name: d.account.name,
            avatar: d.account.avatar,
          });
      }
    } else if (path === "/notifications") {
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
      return { ok: true };
    } else if (path === "/sessions") return [];
    else throw new Error("This security feature requires API mode.");
    await save(id, d);
    return { ok: true };
  }
}
class ApiRepository implements AppRepository {
  private dashboardRequests = new Map<string, Promise<Dashboard>>();
  dashboard = (accountId: string) => {
    const active = this.dashboardRequests.get(accountId);
    if (active) return active;
    const loading = this.loadDashboard(accountId).finally(() => {
      if (this.dashboardRequests.get(accountId) === loading)
        this.dashboardRequests.delete(accountId);
    });
    this.dashboardRequests.set(accountId, loading);
    return loading;
  };
  private loadDashboard = async (accountId: string) => {
    try {
      await syncPendingMutations(accountId);
      const revision = dashboardRevisions.get(accountId) ?? 0;
      const dashboard = await request<Dashboard>("/dashboard", { accountId });
      if ((dashboardRevisions.get(accountId) ?? 0) !== revision)
        return peekCachedDashboard(accountId) ?? dashboard;
      await writeCachedDashboard(accountId, dashboard);
      return dashboard;
    } catch (error) {
      const cached = await readCachedDashboard(accountId);
      if (cached && retryable(error)) return cached;
      throw error;
    }
  };
  create = async (accountId: string, body: CreateTransaction) => {
    return optimisticDashboardMutation(
      accountId,
      (dashboard) => {
        if (
          dashboard.transactions.some(
            (entry) => entry.id === body.idempotencyKey,
          )
        )
          return;
        const allocations =
          body.type === "SHARED_EXPENSE"
            ? splitExpense(
                body.amountMinor,
                body.participants,
                body.splitMethod,
              )
            : [];
        dashboard.transactions.unshift({
          ...body,
          id: body.idempotencyKey,
          sourceId: accountId,
          version: 1,
          allocations,
        });
      },
      () => queueWhenOffline(accountId, "/transactions", body),
    );
  };
  settle = async (accountId: string, body: CreateSettlement) => {
    return optimisticDashboardMutation(
      accountId,
      (dashboard) => {
        let payments: ReturnType<typeof applyRepayment> = [];
        try {
          payments = applyRepayment(
            dashboard.obligations.filter(
              (item) => item.ledgerId === body.ledgerId,
            ),
            body.debtorId,
            body.creditorId,
            body.amountMinor,
            body.currency,
          );
        } catch {
          // The server remains authoritative when the cached balance is stale.
        }
        for (const payment of payments) {
          const debt = dashboard.obligations.find(
            (item) => item.id === payment.obligationId,
          );
          if (debt) debt.remainingMinor -= payment.amountMinor;
        }
        dashboard.transactions.unshift({
          id: body.idempotencyKey,
          title: "Settlement",
          amountMinor: body.amountMinor,
          currency: body.currency,
          type: "SETTLEMENT",
          status: "SETTLED",
          occurredAt: new Date().toISOString(),
          sourceId: body.debtorId,
          destinationId: body.creditorId,
          ledgerId: body.ledgerId,
          tagIds: [],
          allocations: [],
          version: 1,
        });
      },
      () => queueWhenOffline(accountId, "/settlements", body),
    );
  };
  action = async (
    accountId: string,
    id: string,
    action: string,
    version: number,
    reason: string,
  ) => {
    return optimisticDashboardMutation(
      accountId,
      (dashboard) => {
        const transaction = dashboard.transactions.find(
          (item) => item.id === id,
        );
        if (!transaction) return;
        if (action === "complete") transaction.status = "SETTLED";
        transaction.version += 1;
      },
      () =>
        queueWhenOffline(accountId, `/transactions/${id}/actions`, {
          action,
          version,
          reason,
        }),
    );
  };
  deleteTransactions = async (accountId: string, ids: string[]) => {
    return optimisticDashboardMutation(
      accountId,
      (dashboard) => {
        const selected = new Set(ids);
        dashboard.transactions = dashboard.transactions.filter(
          (entry) => !selected.has(entry.id),
        );
      },
      () =>
        queueWhenOffline(accountId, "/transactions/delete", {
          ids,
        }),
    );
  };
  createGoal = async (accountId: string, body: CreateGoal) => {
    const localId = uuid();
    const result = await optimisticDashboardMutation(
      accountId,
      (dashboard) => {
        dashboard.goals.push({
          ...body,
          id: localId,
          spentMinor: 0,
        });
      },
      () => queueWhenOffline<{ id?: string }>(accountId, "/goals", body),
    );
    if ("id" in result && result.id)
      await updateCachedDashboard(accountId, (dashboard) => {
        const goal = dashboard.goals.find((entry) => entry.id === localId);
        if (goal) goal.id = result.id!;
      });
    return result;
  };
  share = (accountId: string, body: CreateShare) =>
    request<{ id: string; url: string; expiresAt: string }>("/shares", {
      accountId,
      body,
    });
}
export const repository: AppRepository = DEMO
  ? new DemoRepository()
  : new ApiRepository();
function extraDashboardUpdate(
  accountId: string,
  path: string,
  body: any,
  method: string,
) {
  const transactionMatch = path.match(/^\/transactions\/([^/]+)$/);
  if (transactionMatch && method === "PATCH")
    return (dashboard: Dashboard) => {
      const transaction = dashboard.transactions.find(
        (entry) => entry.id === transactionMatch[1],
      );
      if (!transaction) return;
      const input = body.transaction as CreateTransaction;
      Object.assign(transaction, {
        ...input,
        id: transaction.id,
        sourceId: transaction.sourceId,
        version: transaction.version + 1,
        allocations:
          input.type === "SHARED_EXPENSE"
            ? splitExpense(
                input.amountMinor,
                input.participants,
                input.splitMethod,
              )
            : [],
      });
    };
  if (path === "/transactions/assign-group")
    return (dashboard: Dashboard) => {
      const selected = new Set<string>(body.ids);
      dashboard.transactions.forEach((transaction) => {
        if (selected.has(transaction.id)) transaction.ledgerId = body.ledgerId;
      });
    };
  const deletedGroupMatch = path.match(/^\/groups\/([^/]+)$/);
  if (deletedGroupMatch && method === "DELETE")
    return (dashboard: Dashboard) => {
      const ledger = dashboard.ledgers.find(
        (entry) =>
          entry.groupId === deletedGroupMatch[1] ||
          entry.id === deletedGroupMatch[1],
      );
      if (ledger) ledger.deleted = true;
    };
  if (path === "/profile" && method === "PATCH")
    return (dashboard: Dashboard) => {
      Object.assign(dashboard.account, body);
      for (const ledger of dashboard.ledgers) {
        const member = ledger.members.find((entry) => entry.id === accountId);
        if (member)
          Object.assign(member, {
            name: dashboard.account.name,
            avatar: dashboard.account.avatar,
          });
      }
    };
  if (path === "/groups" && method === "POST")
    return (dashboard: Dashboard) => {
      const selected = new Set<string>(body.memberIds ?? []);
      for (const contact of body.contacts ?? []) {
        const existing = dashboard.savedContacts.find(
          (entry) => entry.phone === contact.phone,
        );
        const saved =
          existing ??
          ({
            ...contact,
            id: `local:${contact.phone}`,
            verified: false,
          } as Dashboard["savedContacts"][number]);
        if (!existing) dashboard.savedContacts.push(saved);
        selected.add(saved.id);
      }
      const localId = `local:${uuid()}`;
      dashboard.ledgers.push({
        id: localId,
        groupId: localId,
        name: body.name,
        description: body.description ?? "",
        currency: body.currency,
        members: [
          {
            id: accountId,
            name: dashboard.account.name,
            avatar: dashboard.account.avatar,
            role: "OWNER",
          },
          ...dashboard.savedContacts
            .filter((contact) => selected.has(contact.id))
            .map((contact) => ({
              id: contact.id,
              name: contact.name,
              avatar: contact.avatar,
              role: "MEMBER",
            })),
        ],
      });
    };
  const memberMatch = path.match(/^\/groups\/([^/]+)\/members(?:\/([^/]+))?$/);
  if (memberMatch && method === "POST")
    return (dashboard: Dashboard) => {
      const ledger = dashboard.ledgers.find(
        (entry) => entry.groupId === memberMatch[1],
      );
      if (!ledger) return;
      const members = [
        ...((body?.memberIds ?? []) as string[])
          .map((id) =>
            dashboard.savedContacts.find((contact) => contact.id === id),
          )
          .filter(Boolean)
          .map((contact) => ({
            id: contact!.id,
            name: contact!.name,
            avatar: contact!.avatar,
            role: "MEMBER",
          })),
        ...((body?.contacts ?? []) as { name: string; phone: string }[]).map(
          (contact) => {
            const existing = dashboard.savedContacts.find(
              (entry) => entry.phone === contact.phone,
            );
            if (existing)
              return {
                id: existing.id,
                name: existing.name,
                avatar: existing.avatar,
                role: "MEMBER",
              };
            const saved = {
              ...contact,
              id: `local:${contact.phone}`,
              verified: false,
            };
            dashboard.savedContacts.push(saved);
            return { ...saved, role: "MEMBER" };
          },
        ),
      ];
      for (const member of members)
        if (!ledger.members.some((entry) => entry.id === member.id))
          ledger.members.push(member);
    };
  if (memberMatch?.[2] && method === "DELETE")
    return (dashboard: Dashboard) => {
      const ledger = dashboard.ledgers.find(
        (entry) => entry.groupId === memberMatch[1],
      );
      if (!ledger) return;
      const member = ledger.members.find(
        (entry) => entry.id === memberMatch[2],
      );
      ledger.members = ledger.members.filter(
        (entry) => entry.id !== memberMatch[2],
      );
      dashboard.activity.unshift({
        id: `local:${uuid()}`,
        ledgerId: ledger.id,
        message: `${member?.name ?? "A member"} was removed from the group`,
        createdAt: new Date().toISOString(),
      });
    };
  const groupMatch = path.match(/^\/groups\/([^/]+)$/);
  if (groupMatch && method === "DELETE")
    return (dashboard: Dashboard) => {
      const ledger = dashboard.ledgers.find(
        (entry) => entry.groupId === groupMatch[1],
      );
      if (ledger) ledger.deleted = true;
    };
  const contactMatch = path.match(/^\/contacts\/([^/]+)$/);
  if (contactMatch && method === "DELETE")
    return (dashboard: Dashboard) => {
      dashboard.savedContacts = dashboard.savedContacts.filter(
        (contact) => contact.id !== contactMatch[1],
      );
    };
  if (contactMatch && method === "PATCH")
    return (dashboard: Dashboard) => {
      const contact = dashboard.savedContacts.find(
        (entry) => entry.id === contactMatch[1],
      );
      if (contact) contact.name = body.name;
      for (const ledger of dashboard.ledgers) {
        const member = ledger.members.find(
          (entry) => entry.id === contactMatch[1],
        );
        if (member) member.name = body.name;
      }
    };
  if (path === "/tags" && method === "POST")
    return (dashboard: Dashboard) =>
      dashboard.tags.push({
        id: `local:${uuid()}`,
        name: body.name,
        color: body.color,
        archived: false,
      });
  const tagMatch = path.match(/^\/tags\/([^/]+)$/);
  if (tagMatch && method === "PATCH")
    return (dashboard: Dashboard) => {
      const tag = dashboard.tags.find((entry) => entry.id === tagMatch[1]);
      if (tag) Object.assign(tag, body);
    };
  const goalMatch = path.match(/^\/goals\/([^/]+)$/);
  if (goalMatch && method === "DELETE")
    return (dashboard: Dashboard) => {
      dashboard.goals = dashboard.goals.filter(
        (entry) => entry.id !== goalMatch[1],
      );
    };
  const ledgerMatch = path.match(/^\/ledgers\/([^/]+)$/);
  if (ledgerMatch && method === "PATCH")
    return (dashboard: Dashboard) => {
      const ledger = dashboard.ledgers.find(
        (entry) => entry.id === ledgerMatch[1],
      );
      if (ledger) Object.assign(ledger, body);
    };
  return undefined;
}
export const extra = async (
  accountId: string,
  path: string,
  body?: unknown,
  method?: string,
) => {
  const effectiveMethod = method ?? (body === undefined ? "GET" : "POST");
  if (DEMO)
    return (repository as DemoRepository).extra(accountId, path, body, method);
  const operation = () =>
    effectiveMethod !== "GET" &&
    /^(?:\/transactions|\/groups|\/ledgers|\/tags|\/goals|\/profile|\/blocks|\/contacts)/.test(
      path,
    )
      ? queueWhenOffline<any>(accountId, path, body, method)
      : request<any>(path, { accountId, body, method });
  const update = extraDashboardUpdate(accountId, path, body, effectiveMethod);
  const result = update
    ? await optimisticDashboardMutation(accountId, update, operation)
    : await operation();
  if (path === "/account" && method === "DELETE")
    await clearCachedDashboard(accountId);
  return result;
};
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
