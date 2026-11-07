import type { Dashboard } from "@settleup/contracts";
import { simplifyScopedBalances } from "@settleup/domain";

type Obligation = Dashboard["obligations"][number];
type Balance = {
  id: string;
  personId: string;
  currency: string;
  ledgerId?: string;
  amountMinor: number;
};

export function outstandingByPerson(
  debts: Obligation[],
  accountId: string,
  direction: "outgoing" | "incoming",
  byGroup: boolean,
) {
  const net = new Map<
    string,
    {
      personId: string;
      currency: string;
      ledgerId?: string;
      amountMinor: number;
    }
  >();
  for (const debt of debts) {
    if (debt.remainingMinor <= 0) continue;
    const personId =
      debt.debtorId === accountId
        ? debt.creditorId
        : debt.creditorId === accountId
          ? debt.debtorId
          : undefined;
    if (!personId) continue;
    const ledgerId = byGroup ? (debt.ledgerId ?? undefined) : undefined;
    const id = JSON.stringify([personId, debt.currency, ledgerId]);
    const balance = net.get(id) ?? {
      personId,
      currency: debt.currency,
      ledgerId,
      amountMinor: 0,
    };
    balance.amountMinor +=
      debt.creditorId === accountId
        ? debt.remainingMinor
        : -debt.remainingMinor;
    net.set(id, balance);
  }
  return [...net.entries()]
    .filter(([, balance]) =>
      direction === "outgoing"
        ? balance.amountMinor < 0
        : balance.amountMinor > 0,
    )
    .map(([id, balance]) => ({
      id,
      personId: balance.personId,
      currency: balance.currency,
      ledgerId: balance.ledgerId,
      amountMinor: Math.abs(balance.amountMinor),
    }))
    .sort(
      (a, b) =>
        a.currency.localeCompare(b.currency) ||
        b.amountMinor - a.amountMinor ||
        a.id.localeCompare(b.id),
    );
}

export function simplifiedOutgoing(
  debts: Obligation[],
  accountId: string,
): Balance[] {
  return simplifiedForAccount(debts, accountId, "outgoing");
}

export function simplifiedIncoming(
  debts: Obligation[],
  accountId: string,
): Balance[] {
  return simplifiedForAccount(debts, accountId, "incoming");
}

function simplifiedForAccount(
  debts: Obligation[],
  accountId: string,
  direction: "outgoing" | "incoming",
): Balance[] {
  return simplifyScopedBalances(debts)
    .filter(
      (entry) =>
        (direction === "outgoing" ? entry.debtorId : entry.creditorId) ===
        accountId,
    )
    .map(({ debtorId, creditorId, ...entry }) => ({
      ...entry,
      id: JSON.stringify([
        entry.ledgerId,
        entry.currency,
        debtorId,
        creditorId,
      ]),
      personId: direction === "outgoing" ? creditorId : debtorId,
    }));
}
