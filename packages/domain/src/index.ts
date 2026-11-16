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
  // Allow up to 0.01% rounding per person (e.g. 33.33% × 3); shares are
  // still allocated proportionally and always add up to the total.
  if (
    method === "PERCENTAGE" &&
    Math.abs(denominator - 10_000) > members.length
  )
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
/**
 * Debts for an expense several people paid. Each person's net is what they
 * paid minus their share; people who underpaid owe people who overpaid,
 * largest first, so the number of debts stays small and deterministic.
 */
export function multiPayerObligations(
  payers: Allocation[],
  splits: Allocation[],
  currency: string,
): Omit<Debt, "id">[] {
  const net = new Map<string, number>();
  for (const p of payers) net.set(p.userId, (net.get(p.userId) ?? 0) + p.amountMinor);
  for (const s of splits) net.set(s.userId, (net.get(s.userId) ?? 0) - s.amountMinor);
  const owe = [...net]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, left: -v }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const get = [...net]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, left: v }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const debts: Omit<Debt, "id">[] = [];
  let i = 0;
  let j = 0;
  while (i < owe.length && j < get.length) {
    const amount = Math.min(owe[i].left, get[j].left);
    if (amount > 0)
      debts.push({
        debtorId: owe[i].id,
        creditorId: get[j].id,
        amountMinor: amount,
        remainingMinor: amount,
        currency,
      });
    owe[i].left -= amount;
    get[j].left -= amount;
    if (!owe[i].left) i++;
    if (!get[j].left) j++;
  }
  return debts;
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

/**
 * Debts that cancel each other out (A owes B and B owes A, or A→B→C→A).
 * Nobody's net balance depends on them, so after a repayment they are
 * closed as offsets instead of lingering forever and blocking members from
 * leaving. Returns the amount to clear per obligation.
 */
export function offsettingCycles(debts: Debt[], currency: string) {
  const working = debts
    .filter((d) => d.currency === currency && d.remainingMinor > 0)
    .map((d) => ({ ...d }));
  const used = new Map<string, number>();
  for (const path of repaymentPaths(working, currency)) {
    // repaymentPaths mutates its own copies; recompute usage from paths.
    for (const id of path.obligationIds)
      used.set(id, (used.get(id) ?? 0) + path.amountMinor);
  }
  return working
    .map((d) => ({
      obligationId: d.id,
      amountMinor: d.remainingMinor - (used.get(d.id) ?? 0),
    }))
    .filter((o) => o.amountMinor > 0);
}
/** True when this person still owes or is owed anything net. */
export function hasNetBalance(debts: Debt[], personId: string) {
  const currencies = [...new Set(debts.map((d) => d.currency))];
  return currencies.some((currency) =>
    simplifyBalances(debts, currency).some(
      (b) => b.amountMinor > 0 && (b.debtorId === personId || b.creditorId === personId),
    ),
  );
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
  const supportedFields = UPI_FIELDS;
  for (const key of supportedFields)
    if (url.searchParams.getAll(key).length > 1)
      throw new DomainError(
        "UPI",
        "Duplicate payment fields are not accepted.",
      );
  const pa = url.searchParams.get("pa") ?? "";
  if (!isUpiId(pa))
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
        !supportedFields.includes(key as UpiField),
    )
  )
    throw new DomainError(
      "UPI",
      "This signed UPI QR contains unsupported fields. Open it in your UPI app instead.",
    );
  // Preserve standard merchant fields from the scanned QR. Dropping fields such
  // as merchant category, transaction ID, mode or signature can make a valid
  // QR behave differently across PSP apps. Unknown fields (especially callback
  // URLs) remain stripped before the URI leaves SettleUp.
  const fields: Partial<Record<UpiField, string>> = {};
  for (const key of supportedFields) {
    const value = url.searchParams.get(key);
    if (value) fields[key] = value;
  }
  fields.cu ??= cu;
  return {
    fields,
    signed,
    payeeAddress: pa,
    payeeName: pn,
    amountMinor,
    currency: cu,
    note: tn,
    reference: tr,
    fixedAmount: amountMinor !== undefined && (!!tr || signed),
    // A signature covers the original QR fields and sometimes their encoding.
    // Rebuilding that URI can make a valid merchant QR fail in stricter PSPs.
    uri: signed ? input.trim() : serializeUpi(fields),
  };
}
const UPI_FIELDS = [
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
type UpiField = (typeof UPI_FIELDS)[number];
/**
 * Serializes UPI fields with RFC 3986 percent-encoding. `URLSearchParams`
 * writes spaces as `+`, which several PSP apps (Paytm among them) do not
 * decode, so payee names and notes arrive as "Little+Cafe".
 */
export function serializeUpi(fields: Partial<Record<UpiField, string>>) {
  const query = UPI_FIELDS.filter((key) => fields[key])
    .map((key) => `${key}=${encodeURIComponent(fields[key]!)}`)
    .join("&");
  return `upi://pay?${query}`;
}
/** Validates a UPI ID (VPA) such as `name@okaxis`. */
export function isUpiId(value: string) {
  return /^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/.test(value.trim());
}
/**
 * Builds the QR payload a person shows so someone else can pay them by
 * scanning it in their own UPI app. Scans started inside the payer's app are
 * the P2P route NPCI allows (OC-76A disallows P2P intent launches).
 */
export function receiveUpiUri(input: {
  payeeAddress: string;
  payeeName: string;
  amountMinor?: number;
  note?: string;
}) {
  const pa = input.payeeAddress.trim();
  if (!isUpiId(pa)) throw new DomainError("UPI", "Enter a valid UPI ID, like name@okaxis.");
  return serializeUpi({
    pa,
    pn: input.payeeName.trim().slice(0, 50) || pa,
    am:
      input.amountMinor && input.amountMinor > 0
        ? (input.amountMinor / 100).toFixed(2)
        : undefined,
    tn: input.note?.trim().slice(0, 50) || undefined,
    cu: "INR",
  });
}
const nameTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
/** Overlap between a person's name and the counterparty named in an SMS. */
export function smsNameScore(personName: string, smsTitle: string) {
  const person = nameTokens(personName);
  const sms = new Set(nameTokens(smsTitle));
  if (!person.length || !sms.size) return 0;
  return person.filter((token) => sms.has(token)).length / person.length;
}
export type SettlementCandidate = {
  id: string;
  personId: string;
  personName: string;
  amountMinor: number;
  /** CREDIT: they owe you, so money arrives. DEBIT: you owe them. */
  direction: "CREDIT" | "DEBIT";
};
export type SettlementMatch = {
  candidateId: string;
  suggestion: ImportSuggestion;
  amountMinor: number;
  confidence: "HIGH" | "MEDIUM";
};
/**
 * Pairs bank SMS suggestions with open balances so a repayment can be
 * confirmed in one tap. A match needs the same direction and an amount no
 * larger than the balance, plus either the person's name in the SMS or an
 * exact amount that no other balance shares. Each SMS is used at most once.
 */
export function matchSettlementSms(
  suggestions: ImportSuggestion[],
  candidates: SettlementCandidate[],
): SettlementMatch[] {
  const scored: (SettlementMatch & { score: number })[] = [];
  for (const candidate of candidates)
    for (const suggestion of suggestions) {
      if (suggestion.direction !== candidate.direction) continue;
      if (suggestion.amountMinor <= 0 || suggestion.amountMinor > candidate.amountMinor)
        continue;
      const exact = suggestion.amountMinor === candidate.amountMinor;
      const name = smsNameScore(candidate.personName, suggestion.title);
      const uniqueAmount =
        exact &&
        candidates.filter(
          (other) =>
            other.direction === candidate.direction &&
            other.amountMinor === candidate.amountMinor,
        ).length === 1;
      if (name < 0.5 && !uniqueAmount) continue;
      scored.push({
        candidateId: candidate.id,
        suggestion,
        amountMinor: suggestion.amountMinor,
        confidence: name >= 0.5 && exact ? "HIGH" : "MEDIUM",
        score: name * 2 + (exact ? 1 : 0),
      });
    }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(b.suggestion.occurredAt) - Date.parse(a.suggestion.occurredAt),
  );
  const usedCandidates = new Set<string>();
  const usedSms = new Set<string>();
  const matches: SettlementMatch[] = [];
  for (const { score: _score, ...match } of scored) {
    if (usedCandidates.has(match.candidateId)) continue;
    if (usedSms.has(match.suggestion.fingerprint)) continue;
    usedCandidates.add(match.candidateId);
    usedSms.add(match.suggestion.fingerprint);
    matches.push(match);
  }
  return matches;
}
export type QuickAddContext = {
  today: string;
  people: { id: string; name: string }[];
  groups: { id: string; name: string; memberIds: string[] }[];
};
export type QuickAddDraft = {
  title: string;
  amountMinor: number | null;
  ledgerId: string | null;
  participantIds: string[];
  payerId: string | null;
  date: string | null;
  notes: string;
  reply: string;
  complete: boolean;
};
const QUICK_STOP = new Set([
  "with", "and", "for", "the", "paid", "pay", "split", "between", "among",
  "spent", "on", "at", "to", "in", "me", "i", "my", "we", "our", "of", "a",
  "an", "rs", "inr", "rupees", "yesterday", "today", "equally", "group",
  "trip", "by", "was", "were", "it", "all",
]);
/**
 * Offline Quick Add: a rule-based reading of the note, used when the AI
 * service is unavailable (or in demo mode). It understands amounts like
 * "2.4k" or "₹1,200", people and groups by name, "X paid", and "yesterday".
 */
export function quickAddFallback(
  message: string,
  ctx: QuickAddContext,
): QuickAddDraft {
  const text = message.trim();
  const lower = text.toLowerCase();
  const amountMatch =
    lower.match(/(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\b/) ??
    lower.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\b/);
  let amountMinor: number | null = null;
  if (amountMatch) {
    const value =
      Number(amountMatch[1].replace(/,/g, "")) * (amountMatch[2] ? 1000 : 1);
    if (Number.isFinite(value) && value > 0) amountMinor = Math.round(value * 100);
  }
  const words = new Set(lower.match(/[a-z]+/g) ?? []);
  const nameHit = (name: string) =>
    name
      .toLowerCase()
      .split(/\s+/)
      .some((token) => token.length >= 3 && words.has(token));
  // Only use a group when the note names it; expenses can be outside groups.
  const groupName = (name: string) =>
    name.toLowerCase().replace(/^the\s+/, "").trim();
  const group =
    ctx.groups.find(
      (g) => groupName(g.name).length >= 3 && lower.includes(groupName(g.name)),
    ) ?? null;
  const pool = group
    ? ctx.people.filter((p) => group.memberIds.includes(p.id))
    : ctx.people;
  const participantIds = pool.filter((p) => nameHit(p.name)).map((p) => p.id);
  const payer = ctx.people.find((p) =>
    p.name
      .toLowerCase()
      .split(/\s+/)
      .some(
        (t) =>
          t.length >= 3 &&
          new RegExp(
            `\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(paid|pays|covered)\\b`,
          ).test(lower),
      ),
  );
  let date: string | null = null;
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(`${ctx.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
  }
  const nameTokens = new Set(
    ctx.people.flatMap((p) => p.name.toLowerCase().split(/\s+/)),
  );
  const titleWords = (text.match(/[A-Za-z][A-Za-z'&-]*/g) ?? [])
    .filter((w) => {
      const t = w.toLowerCase();
      return !QUICK_STOP.has(t) && !nameTokens.has(t) && t !== "k";
    })
    .slice(0, 4);
  const title = titleWords.length
    ? titleWords
        .join(" ")
        .replace(/^./, (c) => c.toUpperCase())
        .slice(0, 120)
    : "";
  const complete = !!(amountMinor && title);
  return {
    title: title || "Expense",
    amountMinor,
    ledgerId: group?.id ?? null,
    participantIds: [...new Set(participantIds)],
    payerId: payer && participantIds.includes(payer.id) ? payer.id : null,
    date,
    notes: "",
    reply: amountMinor
      ? "Here’s a draft from your note. Check it and save."
      : "How much was it?",
    complete: complete || !!amountMinor,
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
export type SmsGroup = ImportSuggestion & {
  /** Every underlying message; the first is the earliest. */
  fingerprints: string[];
  /** Set when a similar message arrived 10–30 minutes apart, or was already handled. */
  possibleDuplicateOf?: string;
};
export type HandledSms = {
  fingerprint: string;
  occurredAt: string;
  amountMinor?: number;
  reference?: string;
  direction?: "DEBIT" | "CREDIT";
};

const MERGE_MS = 10 * 60_000;
const FLAG_MS = 30 * 60_000;
const REFERENCE_MS = 24 * 60 * 60_000;

function normalizeReference(value?: string) {
  const clean = value?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return clean.length >= 6 ? clean : "";
}
// Apps and banks often print different lengths of the same UTR, so compare by suffix.
const sameReference = (a: string, b: string) =>
  !!a && !!b && (a === b || a.endsWith(b) || b.endsWith(a));
const referenceKey = (reference: string) => reference.slice(-6);
const accountsCompatible = (a?: string, b?: string) => !a || !b || a === b;
const genericTitle = (title: string) =>
  /^bank transaction$/i.test(title) ||
  /\b(UPI|IMPS|NEFT)\s*\/|\/(DR|CR)\//i.test(title) ||
  (title.replace(/[^0-9]/g, "").length >= 6 && !/\s/.test(title.trim()));

/**
 * Collapses messages about the same payment (for example a bank SMS and a
 * Paytm SMS). O(n log n) time for the sort; every other step is a hash lookup
 * or a scan of same-amount messages inside a 30 minute window.
 */
export function dedupeSmsSuggestions(
  items: ImportSuggestion[],
  options: { handled?: HandledSms[]; keepApart?: ReadonlySet<string> } = {},
): SmsGroup[] {
  const keepApart = options.keepApart ?? new Set<string>();
  const sorted = [...items].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const time = sorted.map((item) => Date.parse(item.occurredAt));
  const refs = sorted.map((item) => normalizeReference(item.reference));
  const groupOf = new Int32Array(sorted.length).fill(-1);
  const groups: { members: number[]; ref: string; account?: string; flag?: string }[] = [];
  const join = (i: number, j: number) => {
    let g = groupOf[j];
    if (g < 0) {
      g = groups.push({ members: [j], ref: refs[j], account: sorted[j].accountSuffix }) - 1;
      groupOf[j] = g;
    }
    const group = groups[g];
    group.members.push(i);
    group.ref ||= refs[i];
    group.account ||= sorted[i].accountSuffix;
    groupOf[i] = g;
  };
  const sameMoney = (i: number, j: number) =>
    sorted[i].direction === sorted[j].direction && sorted[i].amountMinor === sorted[j].amountMinor;
  const groupRef = (j: number) => (groupOf[j] < 0 ? refs[j] : groups[groupOf[j]].ref);
  const groupAccount = (j: number) =>
    groupOf[j] < 0 ? sorted[j].accountSuffix : groups[groupOf[j]].account;
  const groupSize = (j: number) => (groupOf[j] < 0 ? 1 : groups[groupOf[j]].members.length);

  // Pass 1: matching reference numbers are the strongest signal.
  const byRef = new Map<string, number[]>();
  sorted.forEach((item, i) => {
    if (!refs[i] || keepApart.has(item.fingerprint)) return;
    const key = referenceKey(refs[i]);
    const seen = byRef.get(key) ?? [];
    for (let k = seen.length - 1; k >= 0; k--) {
      const j = seen[k];
      if (time[i] - time[j] > REFERENCE_MS) break;
      if (
        sameMoney(i, j) &&
        groupSize(j) < 3 &&
        sameReference(refs[i], groupRef(j)) &&
        accountsCompatible(item.accountSuffix, groupAccount(j))
      ) {
        join(i, j);
        break;
      }
    }
    seen.push(i);
    byRef.set(key, seen);
  });

  // Pass 2: same amount close together, only between messages not yet paired.
  const flagged = new Map<number, number>();
  const byAmount = new Map<string, { list: number[]; head: number }>();
  sorted.forEach((item, i) => {
    if (keepApart.has(item.fingerprint)) return;
    const key = `${item.direction}:${item.amountMinor}`;
    const bucket = byAmount.get(key) ?? { list: [], head: 0 };
    while (bucket.head < bucket.list.length && time[i] - time[bucket.list[bucket.head]] > FLAG_MS)
      bucket.head++;
    if (groupSize(i) === 1)
      for (let k = bucket.list.length - 1; k >= bucket.head; k--) {
        const j = bucket.list[k];
        if (groupSize(j) !== 1 || flagged.has(j)) continue;
        const a = refs[i], b = refs[j];
        if ((a && b && !sameReference(a, b)) || !accountsCompatible(item.accountSuffix, sorted[j].accountSuffix))
          continue;
        if (time[i] - time[j] <= MERGE_MS) join(i, j);
        else flagged.set(i, j);
        break;
      }
    if (groupSize(i) === 1) bucket.list.push(i);
    byAmount.set(key, bucket);
  });

  const result: SmsGroup[] = [];
  const done = new Uint8Array(sorted.length);
  sorted.forEach((_, i) => {
    if (done[i]) return;
    const members = groupOf[i] < 0 ? [i] : groups[groupOf[i]].members.sort((a, b) => a - b);
    members.forEach((m) => (done[m] = 1));
    const first = sorted[members[0]];
    const titled = members.map((m) => sorted[m]).find((m) => !genericTitle(m.title)) ?? first;
    const flag = flagged.get(i);
    result.push({
      ...first,
      title: titled.title,
      reference: members.map((m) => sorted[m].reference).find(Boolean),
      accountSuffix: members.map((m) => sorted[m].accountSuffix).find(Boolean),
      fingerprints: members.map((m) => sorted[m].fingerprint),
      possibleDuplicateOf: flag === undefined ? undefined : sorted[flag].fingerprint,
    });
  });
  return matchHandled(result.reverse(), options.handled ?? []);
}

/** Hides messages whose twin was already accepted or dismissed. */
function matchHandled(groups: SmsGroup[], handled: HandledSms[]): SmsGroup[] {
  if (!handled.length) return groups;
  const refs = new Map<string, HandledSms[]>();
  const amounts = new Map<string, { at: number; ref: string }[]>();
  for (const record of handled) {
    if (record.amountMinor === undefined) continue;
    const ref = normalizeReference(record.reference);
    if (ref) refs.set(referenceKey(ref), [...(refs.get(referenceKey(ref)) ?? []), record]);
    const key = `${record.direction ?? "DEBIT"}:${record.amountMinor}`;
    amounts.set(key, [...(amounts.get(key) ?? []), { at: Date.parse(record.occurredAt), ref }]);
  }
  amounts.forEach((list) => list.sort((a, b) => a.at - b.at));
  const out: SmsGroup[] = [];
  for (const group of groups) {
    const ref = normalizeReference(group.reference);
    const twin = ref
      ? refs.get(referenceKey(ref))?.find(
          (r) => r.amountMinor === group.amountMinor && sameReference(ref, normalizeReference(r.reference)),
        )
      : undefined;
    if (twin) continue;
    const list = amounts.get(`${group.direction}:${group.amountMinor}`);
    if (list && !group.possibleDuplicateOf) {
      const at = Date.parse(group.occurredAt);
      let lo = 0, hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].at < at - MERGE_MS) lo = mid + 1;
        else hi = mid;
      }
      for (let k = lo; k < list.length && list[k].at <= at + MERGE_MS; k++)
        if (!ref || !list[k].ref || sameReference(ref, list[k].ref)) {
          group.possibleDuplicateOf = "handled";
          break;
        }
    }
    out.push(group);
  }
  return out;
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

const TAG_RULES: [RegExp, string][] = [
  [/uber|ola|rapido|cab|taxi|auto|metro|fuel|petrol|diesel|parking|toll|bus|train/i, "Transport"],
  [/flight|air|indigo|vistara|hotel|stay|trip|travel|airbnb|booking/i, "Travel"],
  [/swiggy|zomato|food|dinner|lunch|breakfast|cafe|coffee|tea|chai|pizza|burger|restaurant|starbucks|snack|drinks?|bar\b/i, "Food & Drinks"],
  [/rent|maintenance|society|flat|house|home/i, "Housing"],
  [/electric|power|bill|wifi|internet|broadband|recharge|mobile|jio|airtel|gas|water/i, "Utilities"],
  [/amazon|flipkart|myntra|grocer|blinkit|zepto|bigbasket|shopping|mart|store|clothes/i, "Shopping"],
  [/movie|netflix|prime|hotstar|spotify|concert|game|play|gym|salon/i, "Entertainment"],
  [/doctor|hospital|pharmacy|medicine|medical|health|lab|test|dental/i, "Health"],
  [/school|college|course|tuition|book|exam|class|education/i, "Education"],
  [/maid|cook|laundry|cleaning|dhobi|ironing|helper/i, "Household Help"],
];

/** Returns the best-matching tag name for a transaction title, or null. */
export function autoTag(title: string): string | null {
  const t = title.toLowerCase();
  for (const [pattern, tag] of TAG_RULES) if (pattern.test(t)) return tag;
  return null;
}

export type RecurringSchedule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: string;
};

export function nextOccurrence(
  schedule: RecurringSchedule,
  after: string,
  tz = "Asia/Kolkata",
): string | null {
  let dt = DateTime.fromISO(after, { zone: tz });
  switch (schedule.frequency) {
    case "DAILY":
      dt = dt.plus({ days: 1 });
      break;
    case "WEEKLY":
      dt = dt.plus({ weeks: 1 });
      if (schedule.dayOfWeek != null) dt = dt.set({ weekday: schedule.dayOfWeek as 1|2|3|4|5|6|7 });
      break;
    case "MONTHLY":
      dt = dt.plus({ months: 1 });
      if (schedule.dayOfMonth) dt = dt.set({ day: Math.min(schedule.dayOfMonth, dt.daysInMonth!) });
      break;
    case "YEARLY":
      dt = dt.plus({ years: 1 });
      if (schedule.monthOfYear) dt = dt.set({ month: schedule.monthOfYear });
      if (schedule.dayOfMonth) dt = dt.set({ day: Math.min(schedule.dayOfMonth, dt.daysInMonth!) });
      break;
  }
  if (schedule.endDate && dt.toISODate()! > schedule.endDate) return null;
  return dt.toISODate()!;
}

export type PipInsight = {
  type: "spending_spike" | "stale_debt" | "top_category" | "streak" | "saved";
  message: string;
  severity: "info" | "warning";
};

export function pipInsights(data: {
  transactions: { amountMinor: number; occurredAt: string; type: string; tagIds: string[]; sourceId: string }[];
  obligations: { debtorId: string; creditorId: string; remainingMinor: number; currency: string }[];
  tags: { id: string; name: string }[];
  accountId: string;
  people: { id: string; name: string }[];
}, now = new Date()): PipInsight[] {
  const insights: PipInsight[] = [];
  const today = DateTime.fromJSDate(now, { zone: "Asia/Kolkata" });
  const thisMonth = today.startOf("month");
  const lastMonth = thisMonth.minus({ months: 1 });

  const expenses = data.transactions.filter(
    (t) => (t.type === "PERSONAL_EXPENSE" || t.type === "SHARED_EXPENSE") && t.sourceId === data.accountId,
  );

  const thisMonthTotal = expenses
    .filter((t) => DateTime.fromISO(t.occurredAt) >= thisMonth)
    .reduce((s, t) => s + t.amountMinor, 0);
  const lastMonthTotal = expenses
    .filter((t) => {
      const d = DateTime.fromISO(t.occurredAt);
      return d >= lastMonth && d < thisMonth;
    })
    .reduce((s, t) => s + t.amountMinor, 0);

  if (lastMonthTotal > 0 && thisMonthTotal > lastMonthTotal * 1.2) {
    const pct = Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100);
    insights.push({
      type: "spending_spike",
      message: `You've spent ${pct}% more this month than last month`,
      severity: "warning",
    });
  }

  const tagTotals = new Map<string, number>();
  for (const t of expenses.filter((t) => DateTime.fromISO(t.occurredAt) >= thisMonth)) {
    for (const tagId of t.tagIds) tagTotals.set(tagId, (tagTotals.get(tagId) ?? 0) + t.amountMinor);
  }
  if (tagTotals.size) {
    const [topId, topAmount] = [...tagTotals].sort((a, b) => b[1] - a[1])[0];
    const tag = data.tags.find((t) => t.id === topId);
    if (tag && thisMonthTotal > 0) {
      const pct = Math.round((topAmount / thisMonthTotal) * 100);
      insights.push({
        type: "top_category",
        message: `${tag.name} is ${pct}% of your spending this month (₹${Math.round(topAmount / 100).toLocaleString("en-IN")})`,
        severity: "info",
      });
    }
  }

  const threeWeeksAgo = now.getTime() - 21 * 86400000;
  for (const ob of data.obligations) {
    if (ob.remainingMinor <= 0) continue;
    const person = ob.debtorId === data.accountId
      ? null
      : data.people.find((p) => p.id === ob.debtorId);
    if (!person) continue;
    const oldest = data.transactions.find((t) =>
      data.obligations.some(
        (o) => o.debtorId === ob.debtorId && o.creditorId === ob.creditorId,
      ),
    );
    if (oldest && Date.parse(oldest.occurredAt) < threeWeeksAgo) {
      insights.push({
        type: "stale_debt",
        message: `${person.name} has owed you ₹${Math.round(ob.remainingMinor / 100).toLocaleString("en-IN")} for over 3 weeks`,
        severity: "warning",
      });
    }
  }

  if (lastMonthTotal > 0 && thisMonthTotal < lastMonthTotal * 0.9) {
    const saved = Math.round((lastMonthTotal - thisMonthTotal) / 100);
    insights.push({
      type: "saved",
      message: `Great job! You've spent ₹${saved.toLocaleString("en-IN")} less than last month so far`,
      severity: "info",
    });
  }

  return insights.slice(0, 3);
}

export function whatsappReminder(input: {
  personName: string;
  amountMinor: number;
  currency?: string;
  upiId?: string;
  phone?: string;
}): { url: string; message: string } {
  const amt = `₹${(input.amountMinor / 100).toLocaleString("en-IN")}`;
  let msg = `Hey ${input.personName}! Just a friendly reminder — you owe me ${amt} on SettleUp.`;
  if (input.upiId) msg += ` You can pay via UPI: ${input.upiId}`;
  msg += `\n\nSent from SettleUp 💜`;
  const phone = input.phone?.replace(/[^0-9]/g, "") ?? "";
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return { url, message: msg };
}

export function whatsappGroupInvite(input: {
  groupName: string;
  inviterName: string;
  joinLink: string;
}): { url: string; message: string } {
  const msg = `${input.inviterName} invited you to join "${input.groupName}" on SettleUp — the easiest way to split expenses!\n\nJoin here: ${input.joinLink}\n\nSent from SettleUp 💜`;
  return {
    url: `https://wa.me/?text=${encodeURIComponent(msg)}`,
    message: msg,
  };
}
