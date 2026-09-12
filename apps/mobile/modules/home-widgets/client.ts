import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { DateTime } from "luxon";
import type { Dashboard } from "@settleup/contracts";
import { personalSpend } from "@settleup/domain/src/analytics";
import { currencyDigits } from "@settleup/domain";

export type WidgetKind = "qr" | "transaction" | "bill" | "spending";
const bridge = Platform.OS === "android" ? requireOptionalNativeModule<{
  setAccount(id: string | null): void;
  updateSnapshot(id: string, snapshot: string): Promise<void>;
  pin(kind: WidgetKind): Promise<boolean>;
}>("HomeWidgets") : null;
export const widgetsAvailable = !!bridge;

// Only daily totals and active budgets cross into the widget's local cache.
export function createWidgetSnapshot(data: Dashboard, now = DateTime.now()) {
  const today = now.setZone("Asia/Kolkata");
  const cutoff = today.minus({ days: 62 }).startOf("day").toMillis();
  const days: Record<string, number> = {};
  for (const transaction of data.transactions) {
    if (transaction.currency !== data.account.currency) continue;
    const time = DateTime.fromISO(transaction.occurredAt).setZone("Asia/Kolkata");
    if (!time.isValid || time.toMillis() < cutoff || time.toMillis() > today.toMillis()) continue;
    const spent = personalSpend(transaction, data.account.id);
    if (spent) days[time.toISODate()!] = (days[time.toISODate()!] ?? 0) + spent;
  }
  return {
    updatedAt: today.toMillis(),
    name: data.account.name.split(" ")[0],
    currency: data.account.currency,
    digits: currencyDigits(data.account.currency),
    days,
    goals: data.goals.filter(goal => goal.currency === data.account.currency && Date.parse(goal.start) <= today.toMillis() && Date.parse(goal.end) > today.toMillis())
      .map(goal => ({ name: goal.name, limit: goal.amountMinor, spent: goal.spentMinor, period: goal.period, end: Date.parse(goal.end) })),
  };
}
export function setWidgetAccount(id: string | null) { bridge?.setAccount(id); }
export async function syncWidgets(data: Dashboard) {
  if (bridge) await bridge.updateSnapshot(data.account.id, JSON.stringify(createWidgetSnapshot(data)));
}
export async function pinWidget(kind: WidgetKind) { return bridge ? bridge.pin(kind) : false; }
