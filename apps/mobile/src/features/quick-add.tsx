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
import { DEMO } from "../data/session";
import { personName } from "../data/people";
import { useDashboard } from "../data/hooks";
import { useSession } from "../data/session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { knownPeople } from "./receive";
import {
  Button,
  Chip,
  Heading,
  Icon,
  Label,
  useColors,
} from "../components/ui";

type Message =
  | { id: string; role: "assistant"; text: string; draft?: QuickAddDraft; offline?: boolean }
  | { id: string; role: "user"; text: string };

const EXAMPLES = [
  "Dinner 2400 with Rohan and Meera, I paid",
  "Cab to airport ₹650 yesterday",
  "Groceries 1.2k split with the flat",
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

function QuickAddChat({ d }: { d: Dashboard }) {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string }>();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: id(),
      role: "assistant",
      text: "Tell me what you spent, like you’d text a friend. I’ll fill in the amount, group and split.",
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

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { id: id(), role: "user", text }]);
    setBusy(true);
    try {
      const { draft, offline } = await askAssistant(d, text, lastDraft);
      setMessages((m) => [
        ...m,
        { id: id(), role: "assistant", text: draft.reply, draft, offline },
      ]);
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
          <Icon name="bolt" size={22} color="#6652A3" />
          <Heading size={24}>Quick Add</Heading>
        </XStack>
        <Label muted size={12}>
          Describe an expense. Nothing is saved until you review it.
        </Label>
      </YStack>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
            }}
          >
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
            {m.role === "assistant" && m.offline && (
              <Label muted size={10} marginTop={4}>
                Read on this phone (AI unavailable)
              </Label>
            )}
          </View>
        ))}
        {busy && (
          <XStack gap={8} alignItems="center" paddingLeft={6}>
            <ActivityIndicator size="small" color="#6652A3" />
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
          📷 Snap a bill
        </Chip>
        <Chip
          onPress={async () => {
            const text = await Clipboard.getStringAsync();
            if (text.trim()) setInput(text.slice(0, 1500));
          }}
        >
          📋 Paste a message
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
          placeholder={lastDraft ? "Change something… (e.g. Kabir paid)" : "Dinner 2400 with Rohan, I paid"}
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
            <ActivityIndicator color="#6652A3" />
          )}
        </View>
      )}
    </View>
  );
}
