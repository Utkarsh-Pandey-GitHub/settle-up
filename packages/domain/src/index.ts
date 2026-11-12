import { DateTime } from "luxon";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const MAX_MONEY = 1_000_000_000_000;
export function minor(value: number, allowZero = false): number {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > MAX_MONEY
  )
    throw new DomainError(
      "INVALID_MONEY",
      "Enter a valid positive amount within the supported limit.",
    );
  return value;
}
export function currencyDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency))
    throw new DomainError("CURRENCY", "Unsupported ISO 4217 currency.");
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    throw new DomainError("CURRENCY", "Unsupported ISO 4217 currency.");
  }
}
export function parseMoney(
  text: string,
  currency = "INR",
  allowZero = false,
): number {
  const digits = currencyDigits(currency);
  if (
    !new RegExp(`^\\d{1,13}(?:\\.\\d{1,${Math.max(1, digits)}})?$`).test(
      text.trim(),
    ) ||
    (digits === 0 && text.includes("."))
  )
    throw new DomainError("AMOUNT", `Use at most ${digits} decimal places.`);
  const [whole, fraction = ""] = text.trim().split(".");
  return minor(
    Number(
      BigInt(whole) * 10n ** BigInt(digits) +
        BigInt(fraction.padEnd(digits, "0") || "0"),
    ),
    allowZero,
  );
}
export const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: currencyDigits(currency),
  }).format(amount / 10 ** currencyDigits(currency));
export function normalizePhone(input: string): string {
  const phone = parsePhoneNumberFromString(input, "IN");
  if (!phone?.isValid())
    throw new DomainError(
      "PHONE",
      "Enter a valid phone number, including country code.",
    );
  return phone.number;
}
export type SplitMethod = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
export type Allocation = { userId: string; amountMinor: number };
export function splitExpense(
  total: number,
  members: { userId: string; value?: number }[],
  method: SplitMethod,
): Allocation[] {
  minor(total);
  if (
    !members.length ||
    members.length > 100 ||
    new Set(members.map((m) => m.userId)).size !== members.length
  )
    throw new DomainError("MEMBERS", "Choose 1–100 distinct participants.");
  if (method === "EXACT") {
    const allocations = members.map((m) => ({
      userId: m.userId,
      amountMinor: minor(m.value ?? -1, true),
    }));
    if (allocations.reduce((s, a) => s + a.amountMinor, 0) !== total)
      throw new DomainError(
        "SPLIT_TOTAL",
        "Exact shares must add up to the expense.",
      );
    return allocations;
  }
  const weights = members.map((m) => (method === "EQUAL" ? 1 : (m.value ?? 0)));
  if (
    weights.some((v) => !Number.isSafeInteger(v) || v < 0 || v > 1_000_000) ||
    !weights.some((v) => v > 0)
  )
    throw new DomainError(
      "WEIGHTS",
      "Use positive whole share weights or basis points.",
    );
  const denominator = weights.reduce((s, v) => s + v, 0);
  if (method === "PERCENTAGE" && denominator !== 10_000)
    throw new DomainError(
      "PERCENTAGE",
      "Percentages must total 100% (10,000 basis points).",
    );
  const raw = weights.map((w, i) => ({
    i,
    amount: (BigInt(total) * BigInt(w)) / BigInt(denominator),
    remainder: (BigInt(total) * BigInt(w)) % BigInt(denominator),
  }));
  let remainder = total - raw.reduce((s, r) => s + Number(r.amount), 0);
  for (const item of [...raw].sort((a, b) =>
    a.remainder === b.remainder
      ? a.i - b.i
      : a.remainder > b.remainder
        ? -1
        : 1,
  ))
    if (remainder-- > 0) item.amount++;
  return raw.map((r, i) => ({
    userId: members[i].userId,
    amountMinor: Number(r.amount),
  }));
}
export type Debt = {
  id: string;
  debtorId: string;
  creditorId: string;
  amountMinor: number;
  remainingMinor: number;
  currency: string;
};
export function obligations(
  payer: string,
  splits: Allocation[],
  currency: string,
): Omit<Debt, "id">[] {
  return splits
    .filter((s) => s.userId !== payer && s.amountMinor > 0)
    .map((s) => ({
      debtorId: s.userId,
      creditorId: payer,
      amountMinor: s.amountMinor,
      remainingMinor: s.amountMinor,
      currency,
    }));
}
export function applyRepayment(
  debts: Debt[],
  debtor: string,
  creditor: string,
  amount: number,
  currency: string,
): { obligationId: string; amountMinor: number }[] {
  minor(amount);
  if (debtor === creditor)
    throw new DomainError("SELF_PAYMENT", "Choose two different people.");
  const eligible = debts.filter(
    (d) =>
      d.debtorId === debtor &&
      d.creditorId === creditor &&
      d.currency === currency &&
      d.remainingMinor > 0,
  );
  if (eligible.reduce((s, d) => s + d.remainingMinor, 0) < amount)
    throw new DomainError(
      "OVERPAYMENT",
      "This exceeds the outstanding balance for this pair.",
    );
  let left = amount;
  return eligible.flatMap((d) => {
    const paid = Math.min(left, d.remainingMinor);
    left -= paid;
    return paid ? [{ obligationId: d.id, amountMinor: paid }] : [];
  });
}
function repaymentPaths(debts: Debt[], currency: string) {
  const net = new Map<string, number>();
  const outgoing = new Map<string, Debt[]>();
  for (const debt of debts) {
    if (debt.currency !== currency || debt.remainingMinor <= 0) continue;
    const { debtorId, creditorId, remainingMinor } = debt;
    net.set(debtorId, (net.get(debtorId) ?? 0) - remainingMinor);
    net.set(creditorId, (net.get(creditorId) ?? 0) + remainingMinor);
    const edges = outgoing.get(debtorId) ?? [];
    edges.push({ ...debt });
    outgoing.set(debtorId, edges);
  }
  for (const edges of outgoing.values())
    edges.sort(
      (a, b) =>
        a.creditorId.localeCompare(b.creditorId) || a.id.localeCompare(b.id),
    );

  const paths = [];
  // Decompose the original debts into payable paths between net debtors and creditors.
  for (const debtorId of [...net.keys()].sort()) {
    while (net.get(debtorId)! < 0) {
      const queue = [debtorId];
      const previous = new Map<string, Debt>();
      let creditorId: string | undefined;
      for (const person of queue) {
        if (net.get(person)! > 0) {
          creditorId = person;
          break;
        }
        for (const edge of outgoing.get(person) ?? []) {
          if (
            edge.remainingMinor <= 0 ||
            edge.creditorId === debtorId ||
            previous.has(edge.creditorId)
          )
            continue;
          previous.set(edge.creditorId, edge);
          queue.push(edge.creditorId);
        }
      }
      if (!creditorId)
        throw new DomainError("BALANCE", "Could not reconcile this balance.");
      const edges: Debt[] = [];
      let amountMinor = Math.min(-net.get(debtorId)!, net.get(creditorId)!);
      for (let person = creditorId; person !== debtorId;) {
        const edge = previous.get(person)!;
        edges.push(edge);
        amountMinor = Math.min(amountMinor, edge.remainingMinor);
        person = edge.debtorId;
      }
      for (const edge of edges) edge.remainingMinor -= amountMinor;
      net.set(debtorId, net.get(debtorId)! + amountMinor);
      net.set(creditorId, net.get(creditorId)! - amountMinor);
      paths.push({
        debtorId,
        creditorId,
        amountMinor,
        currency,
        obligationIds: edges.map((edge) => edge.id),
      });
    }
  }
  return paths;
}

export function simplifyBalances(debts: Debt[], currency: string) {
  const balances = new Map<
    string,
    Omit<ReturnType<typeof repaymentPaths>[number], "obligationIds">
  >();
  for (const { obligationIds, ...path } of repaymentPaths(debts, currency)) {
    const key = JSON.stringify([path.debtorId, path.creditorId]);
    const balance = balances.get(key);
    if (balance) balance.amountMinor += path.amountMinor;
    else balances.set(key, path);
  }
  return [...balances.values()];
}

export function simplifyScopedBalances(
  debts: (Debt & { ledgerId?: string | null })[],
) {
  const scopes = new Map<string, typeof debts>();
  for (const debt of debts) {
    if (debt.remainingMinor <= 0) continue;
    const scope = debt.ledgerId ?? [debt.debtorId, debt.creditorId].sort();
    const key = JSON.stringify([scope, debt.currency]);
    const entries = scopes.get(key) ?? [];
    entries.push(debt);
    scopes.set(key, entries);
  }
  return [...scopes.values()].flatMap((scope) =>
    simplifyBalances(scope, scope[0].currency).map((balance) => ({
      ...balance,
      ledgerId: scope[0].ledgerId ?? undefined,
    })),
  );
}

export function applySimplifiedRepayment(
  debts: Debt[],
  debtorId: string,
  creditorId: string,
  amount: number,
  currency: string,
) {
  let left = minor(amount);
  const payments = new Map<string, number>();
  for (const path of repaymentPaths(debts, currency)) {
    if (path.debtorId !== debtorId || path.creditorId !== creditorId) continue;
    const paid = Math.min(left, path.amountMinor);
    for (const id of path.obligationIds)
      payments.set(id, (payments.get(id) ?? 0) + paid);
    left -= paid;
    if (!left) break;
  }
  if (left)
    throw new DomainError(
      "BALANCE_CHANGED",
      "This simplified balance has changed. Refresh before recording the repayment.",
      409,
    );
  return [...payments].map(([obligationId, amountMinor]) => ({
    obligationId,
    amountMinor,
  }));
}
export function parseUpi(input: string) {
  if (input.length > 2048) throw new DomainError("UPI", "QR code is too long.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DomainError("UPI", "Scan a valid UPI payment QR code.");
  }
  if (
    url.protocol !== "upi:" ||
    url.hostname !== "pay" ||
    !["", "/"].includes(url.pathname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new DomainError("UPI", "Only upi://pay links are supported.");
  const supportedFields = [
    "pa",
    "pn",
    "mc",
    "tid",
    "tr",
    "tn",
    "am",
    "mam",
    "cu",
    "mode",
    "purpose",
    "orgid",
    "sign",
  ] as const;
  for (const key of supportedFields)
    if (url.searchParams.getAll(key).length > 1)
      throw new DomainError(
        "UPI",
        "Duplicate payment fields are not accepted.",
      );
  const pa = url.searchParams.get("pa") ?? "";
  if (!/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/.test(pa))
    throw new DomainError("UPI", "Invalid UPI payee address.");
  const cu = url.searchParams.get("cu") ?? "INR";
  if (cu !== "INR") throw new DomainError("UPI", "UPI payments must use INR.");
  const pn = (url.searchParams.get("pn") ?? pa).slice(0, 120);
  const tn = (url.searchParams.get("tn") ?? "").slice(0, 250);
  const tr = (url.searchParams.get("tr") ?? "").slice(0, 35);
  const amountMinor = url.searchParams.has("am")
    ? parseMoney(url.searchParams.get("am")!, cu)
    : undefined;
  const minimumAmountMinor = url.searchParams.has("mam")
    ? parseMoney(url.searchParams.get("mam")!, cu)
    : undefined;
  if (
    amountMinor !== undefined &&
    minimumAmountMinor !== undefined &&
    amountMinor < minimumAmountMinor
  )
    throw new DomainError("UPI", "UPI amount is below the required minimum.");
  const signed = url.searchParams.has("sign");
  if (
    signed &&
    [...url.searchParams.keys()].some(
      (key) =>
        !supportedFields.includes(key as (typeof supportedFields)[number]),
    )
  )
    throw new DomainError(
      "UPI",
      "This signed UPI QR contains unsupported fields. Open it in your UPI app instead.",
    );
  const safe = new URL("upi://pay");
  // Preserve standard merchant fields from the scanned QR. Dropping fields such
  // as merchant category, transaction ID, mode or signature can make a valid
  // QR behave differently across PSP apps. Unknown fields (especially callback
  // URLs) remain stripped before the URI leaves SettleUp.
  for (const key of supportedFields) {
    const value = url.searchParams.get(key);
    if (value) safe.searchParams.set(key, value);
  }
  if (!safe.searchParams.has("cu")) safe.searchParams.set("cu", cu);
  return {
    payeeAddress: pa,
    payeeName: pn,
    amountMinor,
    currency: cu,
    note: tn,
    reference: tr,
    fixedAmount: amountMinor !== undefined && (!!tr || signed),
    // A signature covers the original QR fields and sometimes their encoding.
    // Rebuilding that URI can make a valid merchant QR fail in stricter PSPs.
    uri: signed ? input.trim() : safe.toString(),
  };
}
export const SMS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Calendar days, not a sliding 168-hour duration. End is exclusive.
export function smsRange(from?: string, through?: string, now = new Date()) {
  const today = DateTime.fromJSDate(now).startOf("day");
  const start = from
    ? DateTime.fromISO(from).startOf("day")
    : today.minus({ days: 6 });
  const last = through ? DateTime.fromISO(through).startOf("day") : today;
  if (!start.isValid || !last.isValid || start > last || last > today)
    throw new DomainError(
      "DATE",
      "Choose valid dates, in order, no later than today.",
    );
  return {
    start: start.toMillis(),
    end: Math.min(last.plus({ days: 1 }).toMillis(), +now + 1),
  };
}
export function smsDecisionExpiry(occurredAt: string) {
  return DateTime.fromISO(occurredAt)
    .startOf("day")
    .plus({ days: 7 })
    .toMillis();
}
export function parseExpenseSms(body: string, timestamp: number) {
  if (
    !/\b(?:bank|a\/c|acct|account|card|upi|imps|neft|rtgs|txn|transaction)\b/i.test(
      body,
    ) ||
    /\b(?:failed|declined|reversed|refunded|due|reminder|offer|cashback|will be|to be)\b/i.test(
      body,
    )
  )
    return null;
  const parsed = parseSms(body, timestamp);
  if (!parsed) return null;
  if (parsed.direction !== "DEBIT") return null;
  // Prefer the amount next to the debit verb, not an available balance elsewhere.
  const amount =
    body.match(
      /(?:debited|credited|spent|paid|received|transferred|withdrawn|purchase)[^\d₹]{0,24}?(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    )?.[1] ??
    body.match(
      /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:(?:has been|was|is)\s+)?(?:debited|credited|spent|paid|received|transferred|withdrawn|purchase)/i,
    )?.[1];
  if (!amount && (body.match(/(?:INR|Rs\.?|₹)\s*[\d,]+/gi)?.length ?? 0) > 1)
    return null;
  try {
    return amount
      ? { ...parsed, amountMinor: parseMoney(amount.replace(/,/g, "")) }
      : parsed;
  } catch {
    return null;
  }
}
export type ImportSuggestion = {
  fingerprint: string;
  title: string;
  amountMinor: number;
  occurredAt: string;
  direction: "DEBIT" | "CREDIT";
  accountSuffix?: string;
  reference?: string;
};
export interface TransactionImportProvider {
  available(): boolean;
  requestPermission(): Promise<boolean>;
  review(): Promise<ImportSuggestion[]>;
  markHandled(
    fingerprint: string,
    decision?: "ACCEPTED" | "REJECTED",
    occurredAt?: string,
  ): Promise<void>;
}
export function parseSms(
  body: string,
  timestamp: number,
): Omit<ImportSuggestion, "fingerprint"> | null {
  if (
    !/(debited|credited|spent|paid|received|transferred|withdrawn|purchase)/i.test(
      body,
    ) ||
    /\b(otp|one.time.password|verification code)\b/i.test(body)
  )
    return null;
  const amount = body.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  if (!amount) return null;
  try {
    return {
      title:
        body
          .match(
            /(?:at|to|from|towards|merchant[:\s]+)\s*([A-Za-z][A-Za-z0-9 .&-]{1,45})/i,
          )?.[1]
          ?.trim() ?? "Bank transaction",
      amountMinor: parseMoney(amount.replace(/,/g, "")),
      occurredAt: new Date(timestamp).toISOString(),
      direction: /credited|received/i.test(body) ? "CREDIT" : "DEBIT",
      accountSuffix: body.match(
        /(?:a\/c|acct|account|card)[^\d]{0,12}(\d{4})\b/i,
      )?.[1],
      reference: body.match(
        /(?:ref|utr|txn)[\s.:#-]*([A-Za-z0-9]{6,30})/i,
      )?.[1],
    };
  } catch {
    return null;
  }
}
export type Period =
  | "DAY"
  | "WEEK"
  | "MONTH"
  | "YEAR"
  | "LAST_30"
  | "PREVIOUS_WEEK"
  | "PREVIOUS_MONTH";

export type GoalCadence = {
  amountMinor: number;
  period: string;
  dailyLimitMinor?: number | null;
  weeklyLimitMinor?: number | null;
  monthlyLimitMinor?: number | null;
};

/** Resolves a goal into comparable calendar limits. Missing limits are
 * prorated from the broadest limit the user supplied. */
export function goalCadenceLimits(
  goal: GoalCadence,
  at = new Date(),
  zone = "Asia/Kolkata",
) {
  const daysInMonth = DateTime.fromJSDate(at, { zone }).daysInMonth ?? 30;
  let daily = goal.dailyLimitMinor ?? null;
  let weekly = goal.weeklyLimitMinor ?? null;
  let monthly = goal.monthlyLimitMinor ?? null;
  if (daily === null && weekly === null && monthly === null) {
    if (goal.period === "DAY") daily = goal.amountMinor;
    else if (goal.period === "WEEK") weekly = goal.amountMinor;
    else monthly = goal.amountMinor;
  }
  if (monthly !== null) {
    daily ??= Math.round(monthly / daysInMonth);
    weekly ??= Math.round((monthly / daysInMonth) * 7);
  } else if (weekly !== null) {
    daily ??= Math.round(weekly / 7);
    monthly = Math.round((weekly / 7) * daysInMonth);
  } else if (daily !== null) {
    weekly = daily * 7;
    monthly = daily * daysInMonth;
  }
  return {
    daily: daily!,
    weekly: weekly!,
    monthly: monthly!,
    explicit: {
      daily: goal.dailyLimitMinor != null || goal.period === "DAY",
      weekly: goal.weeklyLimitMinor != null || goal.period === "WEEK",
      monthly:
        goal.monthlyLimitMinor != null ||
        !["DAY", "WEEK"].includes(goal.period),
    },
    daysInMonth,
  };
}

export function periodRange(period: Period, zone: string, now = new Date()) {
  const local = DateTime.fromJSDate(now, { zone });
  if (!local.isValid)
    throw new DomainError("TIMEZONE", "Choose a valid IANA time zone.");
  let start = local.startOf(
    period === "DAY"
      ? "day"
      : period === "WEEK" || period === "PREVIOUS_WEEK"
        ? "week"
        : period === "YEAR"
          ? "year"
          : "month",
  );
  let end = start.plus(
    period === "DAY"
      ? { days: 1 }
      : period === "WEEK" || period === "PREVIOUS_WEEK"
        ? { weeks: 1 }
        : period === "YEAR"
          ? { years: 1 }
          : { months: 1 },
  );
  if (period === "LAST_30") {
    end = local.startOf("day").plus({ days: 1 });
    start = end.minus({ days: 30 });
  }
  if (period === "PREVIOUS_WEEK") {
    end = start;
    start = start.minus({ weeks: 1 });
  }
  if (period === "PREVIOUS_MONTH") {
    end = start;
    start = start.minus({ months: 1 });
  }
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}
export function goalProgress(
  limit: number,
  spent: number,
  start: string,
  end: string,
  now = new Date(),
) {
  minor(limit);
  const elapsed = Math.max(0, now.getTime() - Date.parse(start));
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0) throw new DomainError("PERIOD", "End must follow start.");
  const percentage = Math.round((spent / limit) * 100);
  return {
    spent,
    remaining: Math.max(0, limit - spent),
    percentage,
    daysRemaining: Math.max(0, Math.ceil((Date.parse(end) - +now) / 86400000)),
    projectedOverspend:
      elapsed > 0
        ? Math.max(
            0,
            Math.round(spent / Math.min(1, elapsed / duration)) - limit,
          )
        : 0,
    status:
      spent > limit
        ? "EXCEEDED"
        : +now >= Date.parse(end)
          ? "COMPLETED"
          : "ACTIVE",
  };
}
export function assertShareAccess(
  link: {
    expiresAt: Date;
    revokedAt: Date | null;
    privatePhone: string | null;
  },
  verifiedPhone: string | null,
  now = new Date(),
) {
  if (
    link.revokedAt ||
    link.expiresAt <= now ||
    (link.privatePhone && link.privatePhone !== verifiedPhone)
  )
    throw new DomainError(
      "LINK_UNAVAILABLE",
      "This link is unavailable or requires an authorized account.",
      404,
    );
}
