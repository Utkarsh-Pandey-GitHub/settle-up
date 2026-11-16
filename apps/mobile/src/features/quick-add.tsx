import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { DateTime } from "luxon";
import { XStack, YStack } from "tamagui";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Dashboard } from "@settleup/contracts";
import {
  money,
  quickAddFallback,
  type QuickAddContext,
  type QuickAddDraft,
} from "@settleup/domain";
import { request } from "../data/repository";
import {
  askFallback,
  isAskQuestion,
  runAskQuery,
  type AskContext,
  type AskQuery,
  type AskResult,
} from "@settleup/domain/src/ask";
import { DEMO } from "../data/session";
import { personName } from "../data/people";
import { useDashboard } from "../data/hooks";
import { useSession } from "../data/session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { knownPeople } from "./receive";
import { Illustration } from "../components/illustrations";
import {
  Button,
  Chip,
  Heading,
  Icon,
  Label,
  Mascot,
  useColors,
} from "../components/ui";

type Message =
  | {
      id: string;
      role: "assistant";
      text: string;
      draft?: QuickAddDraft;
      offline?: boolean;
      result?: AskResult;
      query?: AskQuery;
    }
  | { id: string; role: "user"; text: string };

const EXAMPLES = [
  "Dinner 2400 with Rohan and Meera, I paid",
  "How much did I spend this month?",
  "Who owes me the most?",
  "Break down last month by category",
];

let nextId = 0;
const id = () => `m${++nextId}`;

function contextFor(d: Dashboard): QuickAddContext {
  const me = d.account.id;
  return {
    today: DateTime.now().setZone("Asia/Kolkata").toISODate()!,
    people: knownPeople(d),
    groups: d.ledgers
      .filter((ledger) => !ledger.deleted)
      .map((ledger) => ({
        id: ledger.id,
        name: ledger.name,
        memberIds: ledger.members.map((m) => (m.id === me ? "me" : m.id)),
      })),
  };
}

async function askAssistant(
  d: Dashboard,
  message: string,
  previous?: QuickAddDraft,
): Promise<{ draft: QuickAddDraft; offline: boolean }> {
  const ctx = contextFor(d);
  if (!DEMO)
    try {
      const draft = await request<QuickAddDraft>("/ai/quick-add", {
        accountId: d.account.id,
        body: {
          message,
          currency: d.account.currency || "INR",
          ...ctx,
          ...(previous ? { previous } : {}),
        },
      });
      return { draft, offline: false };
    } catch {
      // Fall through to the on-device reader below.
    }
  const fresh = quickAddFallback(message, ctx);
  if (!previous) return { draft: fresh, offline: true };
  // Follow-ups offline: only overwrite what the new note actually mentions.
  return {
    offline: true,
    draft: {
      ...previous,
      amountMinor: fresh.amountMinor ?? previous.amountMinor,
      ledgerId: fresh.ledgerId ?? previous.ledgerId,
      participantIds: fresh.participantIds.length
        ? [...new Set([...previous.participantIds, ...fresh.participantIds])]
        : previous.participantIds,
      payerId: fresh.payerId ?? previous.payerId,
      date: fresh.date ?? previous.date,
      complete: !!(fresh.amountMinor ?? previous.amountMinor),
      reply: "Updated your draft.",
    },
  };
}

function askContext(d: Dashboard): AskContext {
  return {
    today: DateTime.now().setZone("Asia/Kolkata").toISODate()!,
    tags: d.tags.map((t) => ({ id: t.id, name: t.name })),
    groups: d.ledgers.filter((l) => !l.deleted).map((l) => ({ id: l.id, name: l.name })),
    people: knownPeople(d),
  };
}
const defaultQuery: AskQuery = {
  metric: "spend",
  period: "THIS_MONTH",
  tagIds: [],
  ledgerIds: [],
  personId: null,
  search: null,
  groupBy: "none",
  compare: false,
};
/** Follow-ups keep whatever the new question does not change. */
function mergeQuery(next: AskQuery, previous?: AskQuery): AskQuery {
  if (!previous) return next;
  const out = { ...next } as Record<string, unknown>;
  for (const key of Object.keys(defaultQuery) as (keyof AskQuery)[]) {
    const isDefault = JSON.stringify(next[key]) === JSON.stringify(defaultQuery[key]);
    if (isDefault) out[key] = previous[key];
  }
  return out as AskQuery;
}
async function askData(
  d: Dashboard,
  question: string,
  previous?: AskQuery,
): Promise<{ query: AskQuery; result: AskResult; offline: boolean }> {
  const ctx = askContext(d);
  let query: AskQuery | null = null;
  let offline = false;
  if (!DEMO)
    try {
      query = await request<AskQuery>("/ai/analytics-query", {
        accountId: d.account.id,
        body: { question, ...ctx, ...(previous ? { previous } : {}) },
      });
    } catch {
      query = null;
    }
  if (!query) {
    offline = true;
    query = mergeQuery(askFallback(question, ctx), previous);
  }
  return { query, result: runAskQuery(d, query), offline };
}

function AnswerCard({
  d,
  result,
  onFollowUp,
}: {
  d: Dashboard;
  result: AskResult;
  onFollowUp: (text: string) => void;
}) {
  const c = useColors();
  const max = Math.max(1, ...result.rows.map((r) => Math.abs(r.valueMinor)));
  const fmt = (v: number) => money(v, d.account.currency).replace(/\.00$/, "");
  return (
    <View
      style={{
        marginTop: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.card,
        padding: 14,
        gap: 10,
      }}
    >
      {result.chart === "line" ? (
        <View style={{ height: 90, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
          {result.rows.map((r) => (
            <View
              key={r.label}
              accessibilityLabel={`${r.label}: ${fmt(r.valueMinor)}`}
              style={{
                flex: 1,
                height: Math.max(3, (Math.abs(r.valueMinor) / max) * 86),
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: c.accent,
                opacity: 0.85,
              }}
            />
          ))}
        </View>
      ) : result.chart === "bar" ? (
        <YStack gap={8}>
          {result.rows.map((r) => (
            <YStack key={r.label} gap={4}>
              <XStack justifyContent="space-between" gap={8}>
                <Label size={12} numberOfLines={1} flexShrink={1}>
                  {r.label}
                </Label>
                <Label
                  bold
                  size={12}
                  color={r.valueMinor < 0 ? c.negative : r.valueMinor > 0 && result.periodLabel === "right now" ? c.positive : c.text}
                >
                  {r.valueMinor < 0 ? "−" : ""}
                  {fmt(Math.abs(r.valueMinor))}
                </Label>
              </XStack>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.soft }}>
                <View
                  style={{
                    width: `${(Math.abs(r.valueMinor) / max) * 100}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: r.valueMinor < 0 ? c.negative : c.accent,
                  }}
                />
              </View>
            </YStack>
          ))}
        </YStack>
      ) : null}
      {result.transactions.map((t) => (
        <XStack key={t.id} justifyContent="space-between" gap={8}>
          <Label size={12} numberOfLines={1} flexShrink={1}>
            {t.title}
            <Label muted size={11}>
              {"  "}
              {DateTime.fromISO(t.occurredAt).toFormat("d LLL")}
            </Label>
          </Label>
          <Label bold size={12}>
            {fmt(t.amountMinor)}
          </Label>
        </XStack>
      ))}
      {result.previousMinor !== null && (
        <Label muted size={11}>
          Previous period: {fmt(result.previousMinor)}
        </Label>
      )}
      <XStack gap={6} flexWrap="wrap">
        {result.followUps.map((f) => (
          <Chip key={f} onPress={() => onFollowUp(f)}>
            {f}
          </Chip>
        ))}
      </XStack>
    </View>
  );
}

function DraftCard({
  d,
  draft,
  onReview,
}: {
  d: Dashboard;
  draft: QuickAddDraft;
  onReview: () => void;
}) {
  const c = useColors();
  const group = d.ledgers.find((ledger) => ledger.id === draft.ledgerId);
  const people = draft.participantIds.map((pid) => personName(d, pid));
  const rows: [string, string][] = [
    ["Amount", draft.amountMinor ? money(draft.amountMinor, group?.currency ?? d.account.currency) : "Not set"],
    ["Group", group?.name ?? "No group"],
    ["Split with", people.length ? `You, ${people.join(", ")}` : "Just you"],
    ["Paid by", draft.payerId ? personName(d, draft.payerId) : "You"],
    ["Date", draft.date ? DateTime.fromISO(draft.date).toFormat("d LLL") : "Today"],
  ];
  return (
    <View
      style={{
        marginTop: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.card,
        padding: 14,
        gap: 8,
      }}
    >
      <Label bold size={16}>
        {draft.title || "Expense"}
      </Label>
      {rows.map(([label, value]) => (
        <XStack key={label} justifyContent="space-between" gap={12}>
          <Label muted size={12}>
            {label}
          </Label>
          <Label size={12} flexShrink={1} textAlign="right">
            {value}
          </Label>
        </XStack>
      ))}
      <Button compact onPress={onReview} disabled={!draft.amountMinor}>
        Review & save
      </Button>
    </View>
  );
}

function looksLikeExpense(text: string, hasPriorDraft?: boolean): boolean {
  const t = text.trim().toLowerCase();
  if (/\d/.test(t)) return true;
  if (/\b(paid|spent|split|owe[sd]?|dinner|lunch|breakfast|cab|auto|uber|ola|rent|wifi|maid|bill|grocery|groceries|swiggy|zomato|amazon|flipkart)\b/.test(t)) return true;
  if (hasPriorDraft) return true;
  return false;
}
function casualReply(text: string): string {
  const t = text.trim().toLowerCase();
  if (/^(hi|hey|hello|yo|sup)\b/.test(t)) return "Hey! Tell me what you spent, or ask me anything about your money.";
  if (/\b(thank|thanks|thx)\b/.test(t)) return "Anytime! Let me know if there's anything else.";
  if (/\b(help|what can you do|what do you do)\b/.test(t)) return "I can log expenses, split bills, answer questions about your spending, and do quick maths. Just tell me what you need!";
  if (/\b(bye|goodbye|see you)\b/.test(t)) return "See you! Your money is in good hands. 💰";
  return "I'm not sure I follow — try telling me about an expense, or ask me something about your spending!";
}

function QuickAddChat({ d }: { d: Dashboard }) {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string }>();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: id(),
      role: "assistant",
      text: "Hi! I’m Pip. Tell me what you spent, ask about your money, or just chat.",
    },
  ]);
  const [input, setInput] = useState(params.text ?? "");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const lastDraft = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((m): m is Extract<Message, { role: "assistant" }> => m.role === "assistant" && !!m.draft)
        ?.draft,
    [messages],
  );
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages, busy]);

  const lastQuery = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((m): m is Extract<Message, { role: "assistant" }> => m.role === "assistant" && !!m.query)
        ?.query,
    [messages],
  );
  const send = async (raw: string, forceAsk = false) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { id: id(), role: "user", text }]);
    setBusy(true);
    try {
      // Conversational assistant with server-side tools (spending, balances,
      // drafts, maths). Falls back to the on-device readers if unavailable.
      {
        try {
          const history = [...messages.slice(1), { role: "user" as const, text }]
            .slice(-20)
            .map((m) => ({ role: m.role, content: m.text }));
          const reply = await request<{
            reply: string;
            draft?: QuickAddDraft;
            result?: AskResult;
          }>(DEMO ? "/ai/demo-chat" : "/ai/chat", {
            ...(DEMO ? {} : { accountId: d.account.id }),
            body: {
              messages: history,
              today: DateTime.now().setZone("Asia/Kolkata").toISODate(),
              ...(DEMO ? { dashboard: d } : {}),
            },
          });
          setMessages((m) => [
            ...m,
            {
              id: id(),
              role: "assistant",
              text: reply.reply,
              draft: reply.draft,
              result: reply.result
                ? { ...reply.result, followUps: reply.result.followUps ?? [] }
                : undefined,
            },
          ]);
          return;
        } catch {
          // fall through to offline handling
        }
      }
      if (isAskQuestion(text) || forceAsk) {
        const { query, result, offline } = await askData(d, text, lastQuery);
        setMessages((m) => [
          ...m,
          { id: id(), role: "assistant", text: result.answer, result, query, offline },
        ]);
      } else if (looksLikeExpense(text, !!lastDraft)) {
        const { draft, offline } = await askAssistant(d, text, lastDraft);
        setMessages((m) => [
          ...m,
          { id: id(), role: "assistant", text: draft.reply, draft, offline },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: id(),
            role: "assistant",
            text: casualReply(text),
            offline: true,
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  const review = (draft: QuickAddDraft) => {
    const group = d.ledgers.find((ledger) => ledger.id === draft.ledgerId);
    const scale = 100;
    router.push({
      pathname: "/add",
      params: {
        title: draft.title || "Expense",
        ...(draft.amountMinor ? { amount: String(draft.amountMinor / scale) } : {}),
        ...(group ? { ledger: group.id } : {}),
        ...(draft.participantIds.length ? { members: draft.participantIds.join(",") } : {}),
        ...(draft.payerId ? { payer: draft.payerId } : {}),
        ...(draft.date ? { date: draft.date } : {}),
      },
    });
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={0}
      style={{ flex: 1 }}
    >
      <YStack gap={4} paddingBottom={8}>
        <XStack alignItems="center" gap={8}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Quick Add"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
            style={{ minWidth: 40, minHeight: 40, justifyContent: "center" }}
          >
            <Icon name="back" size={20} />
          </Pressable>
          <Heading size={24}>Quick Add</Heading>
        </XStack>

      </YStack>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 1 && (
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <View
              style={{
                width: 148,
                height: 148,
                borderRadius: 74,
                backgroundColor: c.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mascot size={122} mood="wave" />
            </View>
          </View>
        )}
        {messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              flexDirection: m.role === "assistant" ? "row" : "column",
              gap: 8,
            }}
          >
            {m.role === "assistant" && messages.length > 1 && (
              <View
                style={{
                  marginTop: 2,
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: c.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Mascot size={36} mood={m.draft?.complete ? "success" : "wave"} animate={false} />
              </View>
            )}
            <View style={{ flexShrink: 1 }}>
            <View
              style={{
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: m.role === "user" ? c.primary : c.soft,
              }}
            >
              <Label size={14} color={m.role === "user" ? c.onPrimary : c.text}>
                {m.text}
              </Label>
            </View>
            {m.role === "assistant" && m.draft && (
              <DraftCard d={d} draft={m.draft} onReview={() => review(m.draft!)} />
            )}
            {m.role === "assistant" && m.result && (
              <AnswerCard d={d} result={m.result} onFollowUp={(f) => void send(f, true)} />
            )}
            {m.role === "assistant" && m.offline && (
              <Label muted size={10} marginTop={4}>
                {m.result ? "Understood on this phone (AI unavailable)" : "Read on this phone (AI unavailable)"}
              </Label>
            )}
            </View>
          </View>
        ))}
        {busy && (
          <XStack gap={8} alignItems="center" paddingLeft={6}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Label muted size={12}>
              Thinking…
            </Label>
          </XStack>
        )}
        {messages.length === 1 && (
          <YStack gap={8} marginTop={6}>
            {EXAMPLES.map((example) => (
              <Chip key={example} onPress={() => void send(example)}>
                {example}
              </Chip>
            ))}
          </YStack>
        )}
      </ScrollView>
      <XStack gap={8} flexWrap="wrap" paddingTop={6}>
        <Chip onPress={() => router.push("/add?bill=camera")}>
          Snap a bill
        </Chip>
        <Chip
          onPress={async () => {
            const text = await Clipboard.getStringAsync();
            if (text.trim()) setInput(text.slice(0, 1500));
          }}
        >
          Paste a message
        </Chip>
      </XStack>
      <XStack
        gap={8}
        alignItems="flex-end"
        marginTop={8}
        padding={6}
        borderRadius={22}
        borderWidth={1}
        borderColor={c.line}
        backgroundColor={c.card}
      >
        <TextInput
          accessibilityLabel="Describe an expense"
          placeholder="Message Pip"
          placeholderTextColor={c.muted}
          value={input}
          onChangeText={setInput}
          autoFocus
          multiline
          maxLength={1500}
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 120,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: c.text,
            fontSize: 15,
          }}
          onSubmitEditing={() => void send(input)}
          blurOnSubmit
          returnKeyType="send"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!input.trim() || busy}
          onPress={() => void send(input)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: input.trim() && !busy ? c.primary : c.line,
          }}
        >
          <Icon name="arrow" size={18} color={c.onPrimary} />
        </Pressable>
      </XStack>
    </KeyboardAvoidingView>
  );
}

export function QuickAddScreen() {
  const query = useDashboard();
  const ready = useSession((s) => s.ready);
  const activeId = useSession((s) => s.activeId);
  const insets = useSafeAreaInsets();
  const c = useColors();
  if (ready && !activeId) return <Redirect href="/onboarding" />;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 10,
        paddingHorizontal: 16,
      }}
    >
      {query.data ? (
        <QuickAddChat d={query.data} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {query.error ? (
            <Label muted>{(query.error as Error).message}</Label>
          ) : (
            <ActivityIndicator color="#4F46E5" />
          )}
        </View>
      )}
    </View>
  );
}
