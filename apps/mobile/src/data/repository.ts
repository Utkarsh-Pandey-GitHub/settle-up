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
  applySimplifiedRepayment,
  goalCadenceLimits,
  periodRange,
} from "@settleup/domain";
import { analytics } from "@settleup/domain/src/analytics";
import { demoDashboard, ids } from "@settleup/domain/src/fixtures";
import { DEMO, getTokenSession, replaceTokenSession } from "./session";
export const uuid = () => Crypto.randomUUID();

// Keep explicit device routing: USB uses localhost with adb reverse;
// emulator users can configure 10.0.2.2 in their environment.
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "https://api.settleup.tinkrs.space"
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
  await changeQueue(accountId, async (queue) => {
    queue.push({
      id: uuid(),
      accountId,
      path,
      method,
      body,
      createdAt: new Date().toISOString(),
    });
    return queue;
  });
}
async function changeQueue(
  accountId: string,
  update: (queue: QueuedMutation[]) => Promise<QueuedMutation[]>,
) {
  const previous = queueChanges.get(accountId) ?? Promise.resolve();
  const change = previous
    .catch(() => {})
    .then(async () => {
      const queue = await update(await queuedMutations(accountId));
      if (queue.length)
        await AsyncStorage.setItem(
          mutationQueueKey(accountId),
          JSON.stringify(queue),
        );
      else await AsyncStorage.removeItem(mutationQueueKey(accountId));
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
  await queueChanges.get(accountId);
  const queue = await queuedMutations(accountId);
  if (!queue.length) return null;
  const processed = new Set<string>();
  for (const item of queue) {
    try {
      await request(item.path, {
        accountId: item.accountId,
        body: item.body,
        method: item.method,
      });
    } catch (error) {
      if (retryable(error)) break;
      // Invalid/conflicting queued work must not permanently block newer work.
    }
    processed.add(item.id);
  }
  let remaining = 0;
  await changeQueue(accountId, async (latest) => {
    const pending = latest.filter((item) => !processed.has(item.id));
    remaining = pending.length;
    return pending;
  });
  return remaining;
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
      : path === "/sms/classify"
        ? 30000
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
        ...(options.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
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
      `${result.message ?? "Unable to complete your request."}${path === "/bill/extract" && /^[a-zA-Z0-9-]{6,80}$/.test(String(result.requestId ?? "")) ? ` Reference: ${result.requestId}` : ""}`,
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
function expenseAllocations(input: CreateTransaction) {
  return input.type === "SHARED_EXPENSE"
    ? splitExpense(input.amountMinor, input.participants, input.splitMethod)
    : [];
}
function expenseWeights(input: CreateTransaction) {
  return Object.fromEntries(
    input.participants.flatMap(({ userId, value }) =>
      value === undefined ? [] : [[userId, value]],
    ),
  );
}
function touchLedger(dashboard: Dashboard, id?: string | null) {
  const ledger = dashboard.ledgers.find((entry) => entry.id === id);
  if (ledger) ledger.updatedAt = new Date().toISOString();
}
function applyDashboardRepayment(
  dashboard: Dashboard,
  input: CreateSettlement,
) {
  if (
    input.ledgerId &&
    !dashboard.ledgers.some(
      (ledger) => ledger.id === input.ledgerId && !ledger.deleted,
    )
  )
    throw new Error("This group is unavailable.");
  const debts = dashboard.obligations.filter(
    (debt) =>
      (debt.ledgerId ?? null) === (input.ledgerId ?? null) &&
      (!input.simplified ||
        !!input.ledgerId ||
        (debt.debtorId === input.debtorId &&
          debt.creditorId === input.creditorId) ||
        (debt.debtorId === input.creditorId &&
          debt.creditorId === input.debtorId)),
  );
  const payments = (
    input.simplified ? applySimplifiedRepayment : applyRepayment
  )(debts, input.debtorId, input.creditorId, input.amountMinor, input.currency);
  const paid = new Map(
    payments.map((payment) => [payment.obligationId, payment.amountMinor]),
  );
  const affected = new Set<string>();
  for (const debt of debts) {
    const amount = paid.get(debt.id);
    if (!amount) continue;
    debt.remainingMinor -= amount;
    if (debt.transactionId) affected.add(debt.transactionId);
  }
  for (const transaction of dashboard.transactions) {
    if (
      transaction.status === "PENDING_LOAN" &&
      affected.has(transaction.id) &&
      !debts.some(
        (debt) =>
          debt.transactionId === transaction.id && debt.remainingMinor > 0,
      )
    ) {
      transaction.status = "SETTLED";
      transaction.version++;
    }
  }
  touchLedger(dashboard, input.ledgerId);
  return payments;
}
function renameContact(dashboard: Dashboard, id: string, name: string) {
  const contact = dashboard.savedContacts.find((entry) => entry.id === id);
  if (contact) {
    contact.profileName ??= contact.name;
    contact.contactName = name;
    contact.name = name;
  }
  for (const ledger of dashboard.ledgers) {
    const member = ledger.members.find((entry) => entry.id === id);
    if (member) {
      member.profileName ??= contact?.profileName ?? member.name;
      member.name = name;
    }
  }
}
function forgetContact(dashboard: Dashboard, id: string) {
  dashboard.savedContacts = dashboard.savedContacts.filter(
    (contact) => contact.id !== id,
  );
  for (const ledger of dashboard.ledgers) {
    const member = ledger.members.find((entry) => entry.id === id);
    if (member?.profileName) member.name = member.profileName;
  }
}
function replaceSharedDebts(
  dashboard: Dashboard,
  transaction: Dashboard["transactions"][number],
) {
  dashboard.obligations = dashboard.obligations.filter(
    (debt) => debt.transactionId !== transaction.id,
  );
  if (transaction.type !== "SHARED_EXPENSE") return;
  dashboard.obligations.push(
    ...obligations(
      transaction.sourceId,
      transaction.allocations,
      transaction.currency,
    ).map((debt) => ({
      ...debt,
      id: `local:${transaction.id}:${debt.debtorId}`,
      transactionId: transaction.id,
      ledgerId: transaction.ledgerId,
    })),
  );
}
function applyExpenseEdit(
  dashboard: Dashboard,
  transaction: Dashboard["transactions"][number],
  input: CreateTransaction,
) {
  if (
    dashboard.obligations.some(
      (debt) =>
        debt.transactionId === transaction.id &&
        debt.remainingMinor < debt.amountMinor,
    )
  )
    throw new Error("A transaction with repayments cannot be edited.");
  if (
    transaction.ledgerId &&
    input.ledgerId &&
    transaction.ledgerId !== input.ledgerId
  )
    throw new Error("This transaction must stay in its original group.");
  const ledgerId = transaction.ledgerId ?? input.ledgerId;
  const createdById = transaction.createdById ?? transaction.sourceId;
  const sourceId =
    input.type === "SHARED_EXPENSE"
      ? (input.payerId ?? transaction.sourceId)
      : createdById;
  const hasLinkedDebts = dashboard.obligations.some(
    (debt) => debt.transactionId === transaction.id,
  );
  const wasShared = transaction.type === "SHARED_EXPENSE";
  Object.assign(transaction, {
    ...input,
    ledgerId,
    sourceId,
    createdById,
    version: transaction.version + 1,
    allocations: expenseAllocations(input),
    splitWeights: expenseWeights(input),
  });
  if (hasLinkedDebts || !wasShared) replaceSharedDebts(dashboard, transaction);
  touchLedger(dashboard, ledgerId);
}
const cache = new Map<string, Dashboard>();
async function demoLoad(id: string) {
  if (!cache.has(id)) {
    const raw = await AsyncStorage.getItem(`settleup.demo.v1.${id}`);
    const dashboard = (raw ? JSON.parse(raw) : demoDashboard(id)) as Dashboard;
    const edgeCaseMarker = `settleup.demo.edge-cases.v1.${id}`;
    if (id !== ids.studio && !(await AsyncStorage.getItem(edgeCaseMarker))) {
      const seeded = demoDashboard(id);
      const transactionIds = new Set(
        dashboard.transactions.map((transaction) => transaction.id),
      );
      const obligationIds = new Set(
        dashboard.obligations.map((obligation) => obligation.id),
      );
      dashboard.transactions.push(
        ...seeded.transactions.filter(
          (transaction) => !transactionIds.has(transaction.id),
        ),
      );
      dashboard.obligations.push(
        ...seeded.obligations.filter(
          (obligation) => !obligationIds.has(obligation.id),
        ),
      );
      await AsyncStorage.setItem(edgeCaseMarker, "1");
      await AsyncStorage.setItem(
        `settleup.demo.v1.${id}`,
        JSON.stringify(dashboard),
      );
    }
    cache.set(id, dashboard);
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
    if (
      input.ledgerId &&
      (!ledger || ledger.deleted || ledger.currency !== input.currency)
    )
      throw new Error("Choose an active ledger with this currency.");
    const availablePeople = ledger?.members ?? d.savedContacts;
    if (
      input.participants.some(
        ({ userId }) =>
          userId !== id &&
          !availablePeople.some((person) => person.id === userId),
      )
    )
      throw new Error(
        ledger ? "Choose group members." : "Choose saved contacts.",
      );
    if (
      input.payerId &&
      input.payerId !== id &&
      !input.participants.some(({ userId }) => userId === input.payerId)
    )
      throw new Error("Choose the creator or a participant as the payer.");
    const splits =
      input.type === "SHARED_EXPENSE"
        ? splitExpense(input.amountMinor, input.participants, input.splitMethod)
        : [];
    const transactionId = uuid();
    d.transactions.unshift({
      ...input,
      id: transactionId,
      sourceId: input.payerId ?? id,
      createdById: id,
      splitWeights: expenseWeights(input),
      destinationId: input.type === "ADJUSTMENT" ? id : input.destinationId,
      allocations: splits,
      version: 1,
    });
    const debts =
      input.type === "SHARED_EXPENSE"
        ? obligations(input.payerId ?? id, splits, input.currency)
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
      transactionId,
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
    touchLedger(d, input.ledgerId);
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
    const payments = applyDashboardRepayment(d, input);
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
    const selected = new Set(ids);
    if (
      d.transactions.some(
        (t) =>
          selected.has(t.id) &&
          (t.type === "SETTLEMENT" || t.type === "LOAN_REPAYMENT"),
      )
    )
      throw new Error("Repayments cannot be deleted.");
    if (
      d.obligations.some(
        (debt) =>
          debt.transactionId &&
          selected.has(debt.transactionId) &&
          debt.remainingMinor < debt.amountMinor,
      )
    )
      throw new Error("A transaction with repayments cannot be deleted.");
    d.obligations = d.obligations.filter(
      (debt) => !debt.transactionId || !selected.has(debt.transactionId),
    );
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
        comparisons: s.comparisonRanges.map((range) => {
          const comparison = analytics(d, {
            ...range,
            currency: s.currency,
            ledgerIds: s.ledgerIds,
            tagIds: s.tagIds,
          });
          return {
            ...range,
            spendingMinor: comparison.spendingMinor,
            byDay: comparison.byDay,
            categories: comparison.byTag.map((entry) => ({
              name:
                d.tags.find((tag) => tag.id === entry.id)?.name ??
                "Uncategorized",
              amountMinor: entry.amountMinor,
            })),
          };
        }),
        goals: s.includeGoals
          ? d.goals
              .filter((goal) => goal.active !== false)
              .map((goal) => ({
                name: goal.name,
                currency: goal.currency,
                ...goalCadenceLimits(goal),
              }))
          : undefined,
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
      applyExpenseEdit(d, transaction, input);
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
        else renameContact(d, saved.id, contact.name);
        selected.add(saved.id);
      }
      const groupId = uuid();
      d.ledgers.push({
        id: groupId,
        groupId,
        name: body.name,
        description: body.description ?? "",
        updatedAt: new Date().toISOString(),
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
    } else if (
      path.match(/^\/groups\/[^/]+\/invites$/) &&
      method !== "DELETE"
    ) {
      const token = uuid().replace(/-/g, "").slice(0, 24);
      return {
        token,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        appUrl: `settleup:///join-group/${token}`,
      };
    } else if (path.match(/^\/groups\/[^/]+\/leave$/)) {
      const groupId = path.split("/")[2];
      const ledger = d.ledgers.find((entry) => entry.groupId === groupId);
      if (!ledger) throw new Error("Group unavailable.");
      const member = ledger.members.find((entry) => entry.id === id);
      if (member?.role === "OWNER")
        throw new Error("The owner must delete the group before leaving.");
      d.ledgers = d.ledgers.filter((entry) => entry.groupId !== groupId);
    } else if (path.match(/^\/groups\/[^/]+$/) && method === "DELETE") {
      const groupId = path.split("/")[2];
      const ledger = d.ledgers.find((entry) => entry.groupId === groupId);
      if (ledger) {
        ledger.deleted = true;
        if (body?.deleteTransactions)
          d.transactions = d.transactions.filter(
            (transaction) => transaction.ledgerId !== ledger.id,
          );
      }
    } else if (path.match(/^\/contacts\/[^/]+$/) && method === "DELETE") {
      const contactId = path.split("/")[2];
      forgetContact(d, contactId);
    } else if (path.match(/^\/contacts\/[^/]+$/) && method === "PATCH") {
      const contactId = path.split("/")[2];
      renameContact(d, contactId, body.name);
    } else if (path === "/tags")
      d.tags.push({ id: uuid(), ...body, archived: false });
    else if (path.startsWith("/tags/")) {
      const t = d.tags.find((t) => t.id === path.split("/")[2]);
      if (t) Object.assign(t, body);
    } else if (path.startsWith("/goals/") && method === "PATCH") {
      const goal = d.goals.find((entry) => entry.id === path.split("/")[2]);
      if (goal) Object.assign(goal, body);
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
        const transaction = {
          ...body,
          id: body.idempotencyKey,
          sourceId: body.payerId ?? accountId,
          createdById: accountId,
          version: 1,
          allocations,
          splitWeights: expenseWeights(body),
        };
        dashboard.transactions.unshift(transaction);
        if (body.type === "SHARED_EXPENSE")
          replaceSharedDebts(dashboard, transaction);
        touchLedger(dashboard, body.ledgerId);
      },
      () => queueWhenOffline(accountId, "/transactions", body),
    );
  };
  settle = async (accountId: string, body: CreateSettlement) => {
    return optimisticDashboardMutation(
      accountId,
      (dashboard) => {
        try {
          applyDashboardRepayment(dashboard, body);
        } catch {
          // The server remains authoritative when the cached balance is stale.
          return;
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
        for (const entry of dashboard.transactions)
          if (selected.has(entry.id)) touchLedger(dashboard, entry.ledgerId);
        dashboard.obligations = dashboard.obligations.filter(
          (entry) => !entry.transactionId || !selected.has(entry.transactionId),
        );
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
      applyExpenseEdit(dashboard, transaction, input);
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
      const groupLedgers = dashboard.ledgers.filter(
        (entry) =>
          entry.groupId === deletedGroupMatch[1] ||
          entry.id === deletedGroupMatch[1],
      );
      groupLedgers.forEach((ledger) => (ledger.deleted = true));
      if (body?.deleteTransactions) {
        const ledgerIds = new Set(groupLedgers.map((ledger) => ledger.id));
        dashboard.transactions = dashboard.transactions.filter(
          (transaction) =>
            !transaction.ledgerId || !ledgerIds.has(transaction.ledgerId),
        );
      }
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
        else renameContact(dashboard, saved.id, contact.name);
        selected.add(saved.id);
      }
      const localId = `local:${uuid()}`;
      dashboard.ledgers.push({
        id: localId,
        groupId: localId,
        name: body.name,
        description: body.description ?? "",
        updatedAt: new Date().toISOString(),
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
  const leaveGroupMatch = path.match(/^\/groups\/([^/]+)\/leave$/);
  if (leaveGroupMatch && method === "POST")
    return (dashboard: Dashboard) => {
      dashboard.ledgers = dashboard.ledgers.filter(
        (entry) => entry.groupId !== leaveGroupMatch[1],
      );
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
            if (existing) {
              renameContact(dashboard, existing.id, contact.name);
              return {
                id: existing.id,
                name: existing.name,
                avatar: existing.avatar,
                role: "MEMBER",
              };
            }
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
      touchLedger(dashboard, ledger.id);
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
      touchLedger(dashboard, ledger.id);
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
    return (dashboard: Dashboard) => forgetContact(dashboard, contactMatch[1]);
  if (contactMatch && method === "PATCH")
    return (dashboard: Dashboard) =>
      renameContact(dashboard, contactMatch[1], body.name);
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
    !path.endsWith("/invites") &&
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
