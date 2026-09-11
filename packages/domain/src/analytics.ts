import type {
  Dashboard,
  Analytics,
  TransactionView,
} from "@settleup/contracts";
import { DateTime } from "luxon";
import { DomainError } from "./index";
export type AnalyticsFilter = {
  start: string;
  end: string;
  currency: string;
  tagIds?: string[];
  ledgerIds?: string[];
  peerId?: string;
  type?: string;
  status?: string;
  zone?: string;
};
export function filterTransactions(
  data: Dashboard,
  f: AnalyticsFilter,
): TransactionView[] {
  return data.transactions.filter(
    (t) =>
      t.currency === f.currency &&
      t.occurredAt >= f.start &&
      t.occurredAt < f.end &&
      (!f.tagIds?.length || t.tagIds.some((id) => f.tagIds!.includes(id))) &&
      (!f.ledgerIds?.length ||
        (!!t.ledgerId && f.ledgerIds.includes(t.ledgerId))) &&
      (!f.type || t.type === f.type) &&
      (!f.status || t.status === f.status) &&
      (!f.peerId ||
        t.sourceId === f.peerId ||
        t.destinationId === f.peerId ||
        t.allocations.some((a) => a.userId === f.peerId)),
  );
}
export function personalSpend(t: TransactionView, userId: string): number {
  if (t.status !== "SETTLED") return 0;
  if (t.type === "PERSONAL_EXPENSE")
    return t.sourceId === userId ? t.amountMinor : 0;
  if (t.type === "SHARED_EXPENSE")
    return t.allocations.find((a) => a.userId === userId)?.amountMinor ?? 0;
  return 0;
}
export function analytics(data: Dashboard, f: AnalyticsFilter): Analytics {
  if (
    !DateTime.fromISO(f.start).isValid ||
    !DateTime.fromISO(f.end).isValid ||
    f.start >= f.end ||
    !DateTime.now().setZone(f.zone ?? "Asia/Kolkata").isValid
  )
    throw new DomainError("PERIOD", "Choose a valid time zone and date range.");
  const txs = filterTransactions(data, f);
  const uid = data.account.id;
  const byTag = new Map<string, number>(),
    byDay = new Map<string, number>(),
    byPeer = new Map<string, number>(),
    byLedger = new Map<string, number>();
  let spendingMinor = 0,
    incomingMinor = 0,
    outgoingMinor = 0;
  for (const t of txs) {
    const spent = personalSpend(t, uid);
    spendingMinor += spent;
    if (
      t.type !== "REVERSAL" &&
      (t.status === "SETTLED" || t.status === "PENDING_LOAN")
    ) {
      if (t.sourceId === uid && t.type !== "ADJUSTMENT")
        outgoingMinor += t.amountMinor;
      if (t.destinationId === uid) incomingMinor += t.amountMinor;
    }
    // Tags are multi-valued: category amounts may overlap and are labeled accordingly.
    if (spent) {
      for (const id of t.tagIds.length ? t.tagIds : ["uncategorized"])
        byTag.set(id, (byTag.get(id) ?? 0) + spent);
      const day = DateTime.fromISO(t.occurredAt)
        .setZone(f.zone ?? "Asia/Kolkata")
        .toISODate()!;
      byDay.set(day, (byDay.get(day) ?? 0) + spent);
      if (t.ledgerId)
        byLedger.set(t.ledgerId, (byLedger.get(t.ledgerId) ?? 0) + spent);
      const peer = t.sourceId === uid ? t.destinationId : t.sourceId;
      if (peer) byPeer.set(peer, (byPeer.get(peer) ?? 0) + spent);
    }
  }
  const duration = Date.parse(f.end) - Date.parse(f.start);
  const previousSpendingMinor = filterTransactions(data, {
    ...f,
    start: new Date(Date.parse(f.start) - duration).toISOString(),
    end: f.start,
  }).reduce((s, t) => s + personalSpend(t, uid), 0);
  const debts = data.obligations.filter(
    (d) =>
      d.currency === f.currency &&
      (!f.ledgerIds?.length || f.ledgerIds.includes(d.ledgerId)),
  );
  return {
    currency: f.currency,
    spendingMinor,
    incomingMinor,
    outgoingMinor,
    owedMinor: debts
      .filter((d) => d.debtorId === uid)
      .reduce((s, d) => s + d.remainingMinor, 0),
    receivableMinor: debts
      .filter((d) => d.creditorId === uid)
      .reduce((s, d) => s + d.remainingMinor, 0),
    byTag: [...byTag].map(([id, amountMinor]) => ({ id, amountMinor })),
    byDay: [...byDay]
      .sort()
      .map(([date, amountMinor]) => ({ date, amountMinor })),
    byPeer: [...byPeer].map(([id, amountMinor]) => ({ id, amountMinor })),
    byLedger: [...byLedger].map(([id, amountMinor]) => ({ id, amountMinor })),
    previousSpendingMinor,
  };
}
