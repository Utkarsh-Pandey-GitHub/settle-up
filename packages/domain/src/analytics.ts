import type {
  Dashboard,
  Analytics,
  TransactionView,
} from "@settleup/contracts";
import { DateTime } from "luxon";
import { DomainError, simplifyScopedBalances } from "./index";
export type AnalyticsFilter = {
  start: string;
  end: string;
  currency: string;
  tagIds?: string[];
  ledgerIds?: string[];
  contactId?: string;
  type?: string;
  status?: string;
  zone?: string;
};
export function filterTransactions(
  data: Dashboard,
  f: AnalyticsFilter,
): TransactionView[] {
  const start = Date.parse(f.start);
  const end = Date.parse(f.end);
  return data.transactions.filter((t) => {
    const time = Date.parse(t.occurredAt);
    return (
      t.currency === f.currency &&
      time >= start &&
      time < end &&
      (!f.tagIds?.length || t.tagIds.some((id) => f.tagIds!.includes(id))) &&
      (!f.ledgerIds?.length ||
        (!!t.ledgerId && f.ledgerIds.includes(t.ledgerId))) &&
      (!f.type || t.type === f.type) &&
      (!f.status || t.status === f.status) &&
      (!f.contactId ||
        t.sourceId === f.contactId ||
        t.destinationId === f.contactId ||
        t.allocations.some((a) => a.userId === f.contactId))
    );
  });
}
export function previousPeriod(f: AnalyticsFilter): AnalyticsFilter {
  const zone = f.zone ?? "Asia/Kolkata";
  const start = DateTime.fromISO(f.start, { zone });
  const end = DateTime.fromISO(f.end, { zone });
  const calendarMonths = end.diff(start, "months").months;
  const previousStart =
    start.day === 1 && end.day === 1 && Number.isInteger(calendarMonths)
      ? start.minus({ months: calendarMonths })
      : start.minus(end.diff(start, ["days", "milliseconds"]));
  return { ...f, start: previousStart.toUTC().toISO()!, end: f.start };
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
    Date.parse(f.start) >= Date.parse(f.end) ||
    !DateTime.now().setZone(f.zone ?? "Asia/Kolkata").isValid
  )
    throw new DomainError("PERIOD", "Choose a valid time zone and date range.");
  const txs = filterTransactions(data, f);
  const uid = data.account.id;
  const byTag = new Map<string, number>(),
    byDay = new Map<string, number>(),
    byContact = new Map<string, number>(),
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
      const contact = t.sourceId === uid ? t.destinationId : t.sourceId;
      if (contact)
        byContact.set(contact, (byContact.get(contact) ?? 0) + spent);
    }
  }
  const previousSpendingMinor = filterTransactions(
    data,
    previousPeriod(f),
  ).reduce((s, t) => s + personalSpend(t, uid), 0);
  const activeLedgerIds = new Set(
    data.ledgers.filter((ledger) => !ledger.deleted).map((ledger) => ledger.id),
  );
  const debts = data.obligations.filter(
    (d) =>
      d.currency === f.currency &&
      (!d.ledgerId || activeLedgerIds.has(d.ledgerId)) &&
      (!f.ledgerIds?.length ||
        (!!d.ledgerId && f.ledgerIds.includes(d.ledgerId))),
  );
  const balances = simplifyScopedBalances(debts);
  return {
    currency: f.currency,
    spendingMinor,
    incomingMinor,
    outgoingMinor,
    owedMinor: balances
      .filter((balance) => balance.debtorId === uid)
      .reduce((sum, balance) => sum + balance.amountMinor, 0),
    receivableMinor: balances
      .filter((balance) => balance.creditorId === uid)
      .reduce((sum, balance) => sum + balance.amountMinor, 0),
    byTag: [...byTag].map(([id, amountMinor]) => ({ id, amountMinor })),
    byDay: [...byDay]
      .sort()
      .map(([date, amountMinor]) => ({ date, amountMinor })),
    byContact: [...byContact].map(([id, amountMinor]) => ({ id, amountMinor })),
    byLedger: [...byLedger].map(([id, amountMinor]) => ({ id, amountMinor })),
    previousSpendingMinor,
  };
}
