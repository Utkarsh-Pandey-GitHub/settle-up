import type { Dashboard, TransactionView } from "@settleup/contracts";
import { DateTime } from "luxon";
import { personalSpend } from "./analytics";
import { money, simplifyScopedBalances } from "./index";

/**
 * "Ask your data": a question is turned into this small query (by the AI or
 * by `askFallback`) and answered on the device from the user's own data, so
 * numbers are always real and transactions never leave the phone.
 */
export const ASK_PERIODS = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_30",
  "LAST_90",
  "THIS_YEAR",
  "ALL",
] as const;
export const ASK_METRICS = ["spend", "count", "average", "largest", "balances"] as const;
export const ASK_GROUP_BY = ["none", "tag", "group", "person", "day", "week", "month", "merchant"] as const;
export type AskPeriod = (typeof ASK_PERIODS)[number];
export type AskQuery = {
  metric: (typeof ASK_METRICS)[number];
  period: AskPeriod;
  tagIds: string[];
  ledgerIds: string[];
  personId: string | null;
  search: string | null;
  groupBy: (typeof ASK_GROUP_BY)[number];
  compare: boolean;
};
export type AskContext = {
  today: string;
  tags: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  people: { id: string; name: string }[];
};
export type AskRow = { label: string; valueMinor: number };
export type AskResult = {
  answer: string;
  periodLabel: string;
  totalMinor: number;
  previousMinor: number | null;
  rows: AskRow[];
  chart: "bar" | "line" | null;
  transactions: { id: string; title: string; amountMinor: number; occurredAt: string }[];
  followUps: string[];
};

const ZONE = "Asia/Kolkata";
export function askPeriodRange(period: AskPeriod, now: DateTime<boolean> = DateTime.now().setZone(ZONE)) {
  const d = now.setZone(ZONE);
  const r = (start: DateTime, end: DateTime, label: string) => ({ start, end, label });
  switch (period) {
    case "TODAY":
      return r(d.startOf("day"), d.endOf("day"), "today");
    case "YESTERDAY":
      return r(d.minus({ days: 1 }).startOf("day"), d.minus({ days: 1 }).endOf("day"), "yesterday");
    case "THIS_WEEK":
      return r(d.startOf("week"), d.endOf("day"), "this week");
    case "LAST_WEEK":
      return r(d.minus({ weeks: 1 }).startOf("week"), d.minus({ weeks: 1 }).endOf("week"), "last week");
    case "LAST_MONTH":
      return r(d.minus({ months: 1 }).startOf("month"), d.minus({ months: 1 }).endOf("month"), d.minus({ months: 1 }).toFormat("LLLL"));
    case "LAST_30":
      return r(d.minus({ days: 29 }).startOf("day"), d.endOf("day"), "the last 30 days");
    case "LAST_90":
      return r(d.minus({ days: 89 }).startOf("day"), d.endOf("day"), "the last 3 months");
    case "THIS_YEAR":
      return r(d.startOf("year"), d.endOf("day"), "this year");
    case "ALL":
      return r(DateTime.fromMillis(0).setZone(ZONE), d.endOf("day"), "all time");
    default:
      return r(d.startOf("month"), d.endOf("day"), "this month");
  }
}
function previousRange(period: AskPeriod, now: DateTime<boolean>) {
  const cur = askPeriodRange(period, now);
  const span = cur.end.diff(cur.start);
  if (period === "THIS_MONTH" || period === "LAST_MONTH")
    return { start: cur.start.minus({ months: 1 }), end: cur.start.minus({ months: 1 }).plus(span) };
  if (period === "ALL") return null;
  return { start: cur.start.minus(span).minus({ milliseconds: 1 }), end: cur.start.minus({ milliseconds: 1 }) };
}

function matches(t: TransactionView, q: AskQuery, start: DateTime, end: DateTime) {
  const at = Date.parse(t.occurredAt);
  return (
    at >= start.toMillis() &&
    at <= end.toMillis() &&
    (!q.tagIds.length || t.tagIds.some((id) => q.tagIds.includes(id))) &&
    (!q.ledgerIds.length || (!!t.ledgerId && q.ledgerIds.includes(t.ledgerId))) &&
    (!q.personId ||
      t.sourceId === q.personId ||
      t.destinationId === q.personId ||
      t.allocations.some((a) => a.userId === q.personId)) &&
    (!q.search || t.title.toLowerCase().includes(q.search.toLowerCase()))
  );
}

/** Answers a query from the dashboard. Pure and deterministic. */
export function runAskQuery(
  data: Dashboard,
  q: AskQuery,
  now = DateTime.now().setZone(ZONE),
): AskResult {
  const uid = data.account.id;
  const currency = data.account.currency || "INR";
  const fmt = (v: number) => money(v, currency).replace(/\.00$/, "");
  const name = (id: string) =>
    data.savedContacts.find((c) => c.id === id)?.contactName ||
    data.savedContacts.find((c) => c.id === id)?.name ||
    data.ledgers.flatMap((l) => l.members).find((m) => m.id === id)?.name ||
    "Someone";

  if (q.metric === "balances") {
    const debts = data.obligations.filter(
      (o) =>
        o.remainingMinor > 0 &&
        o.currency === currency &&
        (!q.ledgerIds.length || (!!o.ledgerId && q.ledgerIds.includes(o.ledgerId))),
    );
    const net = new Map<string, number>();
    for (const b of simplifyScopedBalances(debts as any)) {
      if (b.creditorId === uid) net.set(b.debtorId, (net.get(b.debtorId) ?? 0) + b.amountMinor);
      if (b.debtorId === uid) net.set(b.creditorId, (net.get(b.creditorId) ?? 0) - b.amountMinor);
    }
    const rows = [...net]
      .filter(([id]) => !q.personId || id === q.personId)
      .map(([id, v]) => ({ label: name(id), valueMinor: v }))
      .sort((a, b) => Math.abs(b.valueMinor) - Math.abs(a.valueMinor));
    const owedToYou = rows.filter((r) => r.valueMinor > 0).reduce((s, r) => s + r.valueMinor, 0);
    const youOwe = -rows.filter((r) => r.valueMinor < 0).reduce((s, r) => s + r.valueMinor, 0);
    const top = rows[0];
    return {
      answer: rows.length
        ? `${fmt(owedToYou)} is owed to you and you owe ${fmt(youOwe)}.` +
          (top ? ` The biggest balance is with ${top.label} (${top.valueMinor > 0 ? "they owe you" : "you owe"} ${fmt(Math.abs(top.valueMinor))}).` : "")
        : "You’re all settled up. No open balances.",
      periodLabel: "right now",
      totalMinor: owedToYou - youOwe,
      previousMinor: null,
      rows: rows.slice(0, 8),
      chart: rows.length ? "bar" : null,
      transactions: [],
      followUps: ["Who owes me the most?", "How much did I spend this month?"],
    };
  }

  const range = askPeriodRange(q.period, now);
  const txs = data.transactions.filter((t) => t.currency === currency && matches(t, q, range.start, range.end));
  const spendOf = (t: TransactionView) => personalSpend(t, uid);
  const spent = txs.filter((t) => spendOf(t) > 0);
  const total = spent.reduce((s, t) => s + spendOf(t), 0);
  const prev = q.compare ? previousRange(q.period, now) : null;
  const previousMinor = prev
    ? data.transactions
        .filter((t) => t.currency === currency && matches(t, q, prev.start, prev.end))
        .reduce((s, t) => s + spendOf(t), 0)
    : null;

  const bucket = new Map<string, number>();
  const add = (k: string, v: number) => bucket.set(k, (bucket.get(k) ?? 0) + v);
  for (const t of spent) {
    const v = spendOf(t);
    const at = DateTime.fromISO(t.occurredAt).setZone(ZONE);
    switch (q.groupBy) {
      case "tag":
        for (const id of t.tagIds.length ? t.tagIds : ["none"])
          add(data.tags.find((x) => x.id === id)?.name ?? "Untagged", v);
        break;
      case "group":
        add(data.ledgers.find((l) => l.id === t.ledgerId)?.name ?? "Personal", v);
        break;
      case "person":
        for (const a of t.allocations) if (a.userId !== uid) add(name(a.userId), v);
        break;
      case "day":
        add(at.toFormat("d LLL"), v);
        break;
      case "week":
        add(`Wk of ${at.startOf("week").toFormat("d LLL")}`, v);
        break;
      case "month":
        add(at.toFormat("LLL yy"), v);
        break;
      case "merchant":
        add(t.title.trim() || "Untitled", v);
        break;
    }
  }
  const timeSeries = q.groupBy === "day" || q.groupBy === "week" || q.groupBy === "month";
  const rows = [...bucket]
    .map(([label, valueMinor]) => ({ label, valueMinor }))
    .sort((a, b) => (timeSeries ? 0 : b.valueMinor - a.valueMinor))
    .slice(0, timeSeries ? 31 : 8);

  const scope = [
    q.tagIds.length ? `on ${q.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name ?? "that tag").join(", ")}` : "",
    q.ledgerIds.length ? `in ${q.ledgerIds.map((id) => data.ledgers.find((l) => l.id === id)?.name ?? "that group").join(", ")}` : "",
    q.personId ? `with ${name(q.personId)}` : "",
    q.search ? `matching “${q.search}”` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const when = range.label;
  const largest = [...spent].sort((a, b) => spendOf(b) - spendOf(a)).slice(0, 5);
  let answer: string;
  if (q.metric === "count")
    answer = `You made ${spent.length} ${spent.length === 1 ? "expense" : "expenses"} ${scope} ${when}.`;
  else if (q.metric === "average")
    answer = spent.length
      ? `Your average expense ${scope} ${when} was ${fmt(Math.round(total / spent.length))} across ${spent.length} expenses.`
      : `No expenses ${scope} ${when}.`;
  else if (q.metric === "largest")
    answer = largest.length
      ? `Your biggest expense ${scope} ${when} was ${largest[0].title} at ${fmt(spendOf(largest[0]))}.`
      : `No expenses ${scope} ${when}.`;
  else
    answer = spent.length
      ? `You spent ${fmt(total)} ${scope} ${when}.`
      : `You didn’t spend anything ${scope} ${when}.`;
  answer = answer.replace(/\s+/g, " ").replace(" .", ".");
  if (previousMinor !== null && q.metric === "spend") {
    const diff = total - previousMinor;
    answer += previousMinor
      ? ` That’s ${fmt(Math.abs(diff))} ${diff >= 0 ? "more" : "less"} than the period before (${Math.round((Math.abs(diff) / previousMinor) * 100)}%).`
      : " Nothing was spent in the period before.";
  }
  if (rows.length && !timeSeries && q.groupBy !== "none")
    answer += ` Most went to ${rows[0].label} (${fmt(rows[0].valueMinor)}).`;

  const followUps = [
    q.groupBy !== "tag" ? "Break it down by category" : "Show it by day",
    q.compare ? "Show my biggest expenses" : "Compare with the period before",
    q.period === "THIS_MONTH" ? "What about last month?" : "What about this month?",
  ];
  return {
    answer,
    periodLabel: when,
    totalMinor: total,
    previousMinor,
    rows,
    chart: rows.length > 1 ? (timeSeries ? "line" : "bar") : null,
    transactions: (q.metric === "largest" || !rows.length ? largest : []).map((t) => ({
      id: t.id,
      title: t.title,
      amountMinor: spendOf(t),
      occurredAt: t.occurredAt,
    })),
    followUps,
  };
}

/** Rough check: is this a question about the data rather than a new expense? */
export function isAskQuestion(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  return /^(how|what|who|whom|which|when|where|show|list|compare|top|biggest|largest|total|summary|summarize|summarise|break ?down|am i|did i|do i|tell me|give me)\b/.test(t) ||
    /\bhow much\b|\bspent (on|in|with)\b.*\b(this|last|today|yesterday|month|week|year)\b/.test(t);
}

const emptyQuery = (): AskQuery => ({
  metric: "spend",
  period: "THIS_MONTH",
  tagIds: [],
  ledgerIds: [],
  personId: null,
  search: null,
  groupBy: "none",
  compare: false,
});

/** Offline, rule-based question reader used when the AI is unavailable. */
export function askFallback(text: string, ctx: AskContext): AskQuery {
  const t = text.toLowerCase();
  const words = new Set(t.match(/[a-z]+/g) ?? []);
  const q = emptyQuery();
  if (/\bowe|owes|owed|balance|settle/.test(t)) q.metric = "balances";
  else if (/\bhow many\b|\bcount\b|\bnumber of\b/.test(t)) q.metric = "count";
  else if (/\baverage|avg\b/.test(t)) q.metric = "average";
  else if (/\bbiggest|largest|top|most expensive|highest\b/.test(t) && !/\bcategor|\bgroup|\bwho\b|\bperson|\bpeople/.test(t)) q.metric = "largest";
  q.period =
    /\btoday\b/.test(t) ? "TODAY" :
    /\byesterday\b/.test(t) ? "YESTERDAY" :
    /\blast week\b/.test(t) ? "LAST_WEEK" :
    /\bthis week\b|\bweek\b/.test(t) ? "THIS_WEEK" :
    /\blast month\b/.test(t) ? "LAST_MONTH" :
    /\b(30|thirty) days\b/.test(t) ? "LAST_30" :
    /\b(3|three) months\b|\bquarter\b/.test(t) ? "LAST_90" :
    /\bthis year\b|\byear\b/.test(t) ? "THIS_YEAR" :
    /\ball time\b|\bever\b|\btotal\b/.test(t) ? "ALL" :
    "THIS_MONTH";
  if (/\bcompare|vs|versus|than (last|usual|before)|more than|less than\b/.test(t)) q.compare = true;
  if (/\bby (category|tag)|\bcategor|\bwhere did\b|\bon what\b/.test(t)) q.groupBy = "tag";
  else if (/\bby group|\bwhich group\b|\bgroups\b/.test(t)) q.groupBy = "group";
  else if (/\bwho\b|\bwith whom\b|\bby person|\bpeople\b|\bfriends\b/.test(t) && q.metric !== "balances") q.groupBy = "person";
  else if (/\bdaily|\bby day|\beach day\b/.test(t)) q.groupBy = "day";
  else if (/\bweekly|\bby week\b/.test(t)) q.groupBy = "week";
  else if (/\bmonthly|\bby month|\btrend\b/.test(t)) q.groupBy = "month";
  else if (/\bmerchant|\bwhere\b|\bshops?\b|\bplaces?\b/.test(t)) q.groupBy = "merchant";
  const hit = (name: string) =>
    name.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && words.has(w));
  q.tagIds = ctx.tags.filter((x) => x.name && t.includes(x.name.toLowerCase().split(/[ &]/)[0])).map((x) => x.id).slice(0, 3);
  q.ledgerIds = ctx.groups.filter((g) => t.includes(g.name.toLowerCase()) || g.name.toLowerCase().split(/\s+/).some((w) => w.length >= 4 && words.has(w) && !["here", "come", "trip", "group", "with"].includes(w))).map((g) => g.id).slice(0, 2);
  q.personId = ctx.people.find((p) => hit(p.name))?.id ?? null;
  if (q.personId && q.groupBy === "person") q.groupBy = "none";
  return q;
}

/** Keeps only known ids and enum values from a model-produced query. */
export function normalizeAskQuery(value: unknown, ctx: AskContext): AskQuery {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = <T extends readonly string[]>(list: T, x: unknown, d: T[number]): T[number] =>
    typeof x === "string" && (list as readonly string[]).includes(x) ? (x as T[number]) : d;
  const ids = (x: unknown, allowed: { id: string }[], max: number) =>
    Array.isArray(x)
      ? [...new Set(x.filter((id): id is string => typeof id === "string" && allowed.some((a) => a.id === id)))].slice(0, max)
      : [];
  return {
    metric: pick(ASK_METRICS, v.metric, "spend"),
    period: pick(ASK_PERIODS, v.period, "THIS_MONTH"),
    tagIds: ids(v.tagIds, ctx.tags, 5),
    ledgerIds: ids(v.ledgerIds, ctx.groups, 5),
    personId: typeof v.personId === "string" && ctx.people.some((p) => p.id === v.personId) ? v.personId : null,
    search: typeof v.search === "string" && v.search.trim() ? v.search.trim().slice(0, 60) : null,
    groupBy: pick(ASK_GROUP_BY, v.groupBy, "none"),
    compare: v.compare === true,
  };
}
