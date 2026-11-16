import { PageHero } from "../components/illustrations";
import { titleIcon } from "./overview";
import React, { useMemo, useState, useEffect } from "react";
import { DatePicker } from "../components/DateTimePicker";
import {
  Platform,
  View,
  Pressable,
  Animated,
  useWindowDimensions,
} from "react-native";
import { YStack, XStack } from "tamagui";
import { useRouter } from "expo-router";
import {
  money,
  dedupeSmsSuggestions,
  type ImportSuggestion,
  type SmsGroup,
} from "@settleup/domain";
import {
  AndroidSmsProvider,
  type SmsDecision,
} from "../services/device";
import { repository } from "../data/repository";
import { useAction } from "../data/hooks";
import { DataScreen } from "./overview";
import {
  Card,
  Heading,
  Label,
  Button,
  Notice,
  Field,
  Icon,
  Empty,
  Mascot,
  useColors,
} from "../components/ui";
export function SmsScreen() {
  return (
    <DataScreen>
      {(d) => <SmsContent key={d.account.id} accountId={d.account.id} />}
    </DataScreen>
  );
}

function SmsPrivacyExplainer({ onClose }: { onClose(): void }) {
  const c = useColors();
  const { width, fontScale } = useWindowDimensions();
  const compact = width / Math.max(fontScale, 1) < 380;
  const reveal = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.spring(reveal, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [reveal]);
  return (
    <Animated.View
      style={{
        opacity: reveal,
        transform: [
          {
            translateY: reveal.interpolate({
              inputRange: [0, 1],
              outputRange: [-12, 0],
            }),
          },
          {
            scale: reveal.interpolate({
              inputRange: [0, 1],
              outputRange: [0.98, 1],
            }),
          },
        ],
      }}
    >
      <View
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: compact ? 16 : 20,
          backgroundColor: c.mint,
          padding: compact ? 10 : 14,
          paddingRight: compact ? 36 : 42,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide Bank SMS explanation"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => ({
            position: "absolute",
            zIndex: 2,
            right: 10,
            top: 10,
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? c.card : `${c.card}CC`,
          })}
        >
          <Icon name="close" size={14} color={c.muted} />
        </Pressable>
        <XStack gap={compact ? 7 : 10} alignItems="center">
          <Mascot size={compact ? 48 : 70} mood="reading" />
          <YStack flex={1} gap={compact ? 4 : 7} minWidth={0}>
            <Heading size={compact ? 14 : 16}>
              Pip checks monetary messages
            </Heading>
            <Label
              muted
              size={compact ? 10 : 11}
              lineHeight={compact ? 14 : 16}
            >
              {compact
                ? "Pip finds confirmed spending in recent SMS. OTPs are ignored, and you approve every transaction."
                : "Pip checks recent monetary messages for confirmed spending. OTPs are excluded and nothing becomes a transaction until you accept it."}
            </Label>
            <XStack gap={4} flexWrap="wrap">
              {(compact
                ? ["No OTPs", "7 days", "You approve"]
                : ["OTPs excluded", "7-day window", "You approve each one"]
              ).map((item) => (
                <View
                  key={item}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: 10,
                    backgroundColor: `${c.card}B8`,
                    paddingHorizontal: compact ? 6 : 8,
                    paddingVertical: compact ? 3 : 5,
                  }}
                >
                  <Icon name="check" size={11} color="#43816E" />
                  <Label size={10} bold>
                    {item}
                  </Label>
                </View>
              ))}
            </XStack>
          </YStack>
        </XStack>
      </View>
    </Animated.View>
  );
}

function SmsContent({ accountId }: { accountId: string }) {
  const provider = useMemo(
      () => new AndroidSmsProvider(accountId),
      [accountId],
    ),
    action = useAction(),
    router = useRouter(),
    c = useColors();
  const { width } = useWindowDimensions();
  const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]),
    [enabled, setEnabled] = useState(false),
    [custom, setCustom] = useState(false),
    [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [search, setSearch] = useState(""),
    [pending, setPending] = useState<{
      fingerprint: string;
      kind: "accept" | "reject" | "refresh";
    } | null>(null),
    [history, setHistory] = useState<Record<string, SmsDecision>>({}),
    [editing, setEditing] = useState<string | null>(null),
    [editTitle, setEditTitle] = useState(""),
    [showGuide, setShowGuide] = useState(true),
    [keepApart, setKeepApart] = useState<ReadonlySet<string>>(new Set());
  const keys = useMemo(() => new Map<string, string>(), []);
  const filteredSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    // Incoming money is kept only for settle-up matching, not expense review.
    const expenses = dedupeSmsSuggestions(
      suggestions.filter((item) => item.direction !== "CREDIT"),
      {
        keepApart,
        handled: custom
          ? []
          : Object.entries(history).map(([fingerprint, record]) => ({ fingerprint, ...record })),
      },
    );
    if (!query) return expenses;
    return expenses.filter((suggestion) =>
      [
        suggestion.title,
        suggestion.reference,
        suggestion.accountSuffix,
        suggestion.direction,
        String(suggestion.amountMinor / 100),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, suggestions, keepApart, history, custom]);
  const perform = async (
    kind: "accept" | "reject" | "refresh",
    fingerprint: string,
    work: () => Promise<void>,
    success: string,
  ) => {
    if (pending) return false;
    setPending({ kind, fingerprint });
    try {
      return await action.run(work, success);
    } finally {
      setPending(null);
    }
  };
  const decideOptimistically = async (
    kind: "accept" | "reject",
    group: SmsGroup,
    work: () => Promise<void>,
    success: string,
  ) => {
    const members = new Set(group.fingerprints);
    let removed: ImportSuggestion[] = [];
    setSuggestions((current) => {
      removed = current.filter((item) => members.has(item.fingerprint));
      return current.filter((item) => !members.has(item.fingerprint));
    });
    const saved = await perform(kind, group.fingerprint, work, success);
    if (!saved)
      setSuggestions((current) => {
        const present = new Set(current.map((item) => item.fingerprint));
        return [...removed.filter((item) => !present.has(item.fingerprint)), ...current];
      });
  };
  const markGroup = async (
    group: SmsGroup,
    decision: "ACCEPTED" | "REJECTED",
    title: string,
  ) => {
    for (const fingerprint of group.fingerprints)
      await provider.markHandled(fingerprint, decision, group.occurredAt, {
        title,
        amountMinor: group.amountMinor,
        reference: group.reference,
        direction: group.direction,
      });
    setHistory(await provider.handled());
  };
  useEffect(() => {
    let live = true;
    if (provider.available())
      void provider.hasPermission().then((granted) => {
        if (!live || !granted) return;
        setEnabled(true);
        void Promise.all([
          provider.cachedSuggestions(),
          provider.handled(),
        ]).then(([items, records]) => {
          if (live) {
            setSuggestions(items);
            setHistory(records);
          }
        });
      });
    const cached = provider.subscribeCachedSuggestions((items) => {
      if (live && !custom) setSuggestions(items);
    });
    return () => {
      live = false;
      cached.remove();
    };
  }, [custom, provider]);

  return (
    <YStack gap={12} maxWidth={760} width="100%" alignSelf="center">
      <XStack
        gap={10}
        alignItems="flex-start"
        justifyContent="space-between"
        flexWrap={width < 350 ? "wrap" : "nowrap"}
      >
        <YStack flex={1}>
          <PageHero
            title="Bank SMS review"
            subtitle="Confirm, correct, or dismiss suggested transactions."
            action={{ label: "How it works", onPress: () => setShowGuide(true) }}
          >
          </PageHero>
        </YStack>

      </XStack>
      {showGuide && <SmsPrivacyExplainer onClose={() => setShowGuide(false)} />}
      <Card style={{ padding: 14 }}>
        <YStack gap={11}>

          {!provider.available() ? (
            <Notice>
              {Platform.OS === "ios"
                ? "iOS apps cannot read your SMS inbox. Use manual entries or UPI QR review instead."
                : Platform.OS === "web"
                  ? "SMS review is available only on supported Android development builds. It cannot access messages in a browser."
                  : "SMS review needs a custom Android development build. Expo Go does not include the native inbox module."}
            </Notice>
          ) : (
            <>
              <XStack gap={8} alignItems="center">
                <Icon name="lock" size={14} color={c.muted} />
                <Label muted size={12} flex={1}>
                  Covers the last 7 days. Message text is never stored.
                </Label>
              </XStack>
              <XStack
                backgroundColor={c.soft}
                borderRadius={12}
                padding={4}
              >
                {(
                  [
                    { key: "week", label: "Last 7 days", on: !custom },
                    { key: "custom", label: "Choose dates", on: custom },
                  ] as const
                ).map((seg) => (
                  <Pressable
                    key={seg.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: seg.on }}
                    onPress={() => {
                      if (seg.key === "week") {
                        setCustom(false);
                        setEditing(null);
                        void provider.cachedSuggestions().then(setSuggestions);
                      } else {
                        setCustom(true);
                        setSuggestions([]);
                        setEditing(null);
                      }
                    }}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: seg.on ? c.card : "transparent",
                    }}
                  >
                    <Label size={13} bold={seg.on} color={seg.on ? c.text : c.muted}>
                      {seg.label}
                    </Label>
                  </Pressable>
                ))}
              </XStack>
              {custom && (
                <YStack gap={12}>
                  <DatePicker
                    label="From"
                    value={from}
                    onChange={(value) => {
                      setFrom(value);
                      setSuggestions([]);
                    }}
                  />
                  <DatePicker
                    label="Through"
                    value={through}
                    onChange={(value) => {
                      setThrough(value);
                      setSuggestions([]);
                    }}
                  />
                  <Label muted>
                    No accept/reject history is saved for this search.
                    Previously reviewed messages may appear.
                  </Label>
                </YStack>
              )}
              <Button
                loading={pending?.kind === "refresh"}
                disabled={action.busy}
                onPress={() =>
                  perform(
                    "refresh",
                    "inbox",
                    async () => {
                      if (
                        custom &&
                        (!/^\d{4}-\d{2}-\d{2}$/.test(from) ||
                          !/^\d{4}-\d{2}-\d{2}$/.test(through))
                      )
                        throw new Error("Enter both dates as YYYY-MM-DD.");
                      if (!(await provider.requestPermission()))
                        throw new Error(
                          "SMS permission was declined. Manual entry is always available.",
                        );
                      setSuggestions(
                        custom
                          ? await provider.review({ from, through })
                          : await provider.refreshCachedInbox(true),
                      );
                      setHistory(await provider.handled());
                      setEnabled(true);
                    },
                    "Review ready",
                  )
                }
              >
                {custom
                  ? "Search bank SMS"
                  : enabled
                    ? "Refresh inbox"
                    : "Enable SMS transaction review"}
              </Button>
            </>
          )}
          {!!action.error && <Notice error>{action.error}</Notice>}
          {enabled && !suggestions.some((item) => item.direction !== "CREDIT") && (
            <Empty
              title="Your inbox is all caught up"
              detail={
                custom
                  ? "Choose dates and search for bank expenses."
                  : "No new bank expenses in your seven-day inbox."
              }
            />
          )}
        </YStack>
      </Card>
      {suggestions.some((item) => item.direction !== "CREDIT") && (
        <Field
          label="Search messages"
          placeholder="Merchant, amount, reference or account"
          value={search}
          onChangeText={setSearch}
        />
      )}
      {filteredSuggestions.map((s) => (
        <Card key={s.fingerprint} style={{ padding: 13 }}>
          <YStack gap={9}>
            <XStack alignItems="center" gap={9}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  backgroundColor: c.soft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={titleIcon(s.title) ?? "wallet"} size={18} color={c.text} />
              </View>
              <YStack flex={1} minWidth={0} gap={2}>
                {editing === s.fingerprint ? (
                  <Field
                    label="Transaction title"
                    value={editTitle}
                    onChangeText={setEditTitle}
                    autoFocus
                    onSubmitEditing={() => setEditing(null)}
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${s.title}`}
                    onPress={() => {
                      setEditing(s.fingerprint);
                      setEditTitle(s.title);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Heading size={16}>{s.title}</Heading>
                    </View>
                    <Icon name="edit" size={13} color={c.muted} />
                  </Pressable>
                )}
                <Label muted size={12}>
                  {new Date(s.occurredAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {s.accountSuffix ? ` · A/c ••${s.accountSuffix}` : ""}
                </Label>
                {s.fingerprints.length > 1 && (
                  <XStack gap={6} alignItems="center">
                    <Label size={11} color={c.muted}>
                      From {s.fingerprints.length} messages
                    </Label>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Split into separate messages"
                      hitSlop={8}
                      onPress={() =>
                        setKeepApart((current) => new Set([...current, ...s.fingerprints.slice(1)]))
                      }
                    >
                      <Label size={11} bold color={c.primary}>
                        Split
                      </Label>
                    </Pressable>
                  </XStack>
                )}
                {!!s.possibleDuplicateOf && (
                  <Label size={11} color={c.negative}>
                    {s.possibleDuplicateOf === "handled"
                      ? "Possible duplicate of one you already reviewed"
                      : "Possible duplicate of a message above"}
                  </Label>
                )}
              </YStack>
              <Label
                size={width < 360 ? 15 : 17}
                bold
                numberOfLines={1}
                adjustsFontSizeToFit
                maxWidth={width < 360 ? 110 : 150}
              >
                {money(s.amountMinor)}
              </Label>
            </XStack>
            <XStack gap={7} alignItems="center">
              <Button
                secondary
                compact
                style={{ flex: 1, minHeight: 36, paddingVertical: 7 }}
                disabled={!!pending && pending.fingerprint !== s.fingerprint}
                onPress={() =>
                  decideOptimistically(
                    "reject",
                    s,
                    async () => {
                      if (!custom) await markGroup(s, "REJECTED", s.title);
                    },
                    "Suggestion dismissed",
                  )
                }
              >
                Dismiss
              </Button>
              <Button
                compact
                style={{ flex: 1, minHeight: 36, paddingVertical: 7 }}
                disabled={!!pending && pending.fingerprint !== s.fingerprint}
                onPress={() =>
                  decideOptimistically(
                    "accept",
                    s,
                    async () => {
                      if (!keys.has(s.fingerprint))
                        keys.set(
                          s.fingerprint,
                          `${s.fingerprint.slice(0, 8)}-${s.fingerprint.slice(8, 12)}-4${s.fingerprint.slice(13, 16)}-8${s.fingerprint.slice(17, 20)}-${s.fingerprint.slice(20, 32)}`,
                        );
                      await repository.create(accountId, {
                        idempotencyKey: keys.get(s.fingerprint)!,
                        title: editing === s.fingerprint ? editTitle : s.title,
                        amountMinor: s.amountMinor,
                        currency: "INR",
                        type: "PERSONAL_EXPENSE",
                        status: "SETTLED",
                        occurredAt: s.occurredAt,
                        paymentReference: s.reference,
                        tagIds: [],
                        participants: [],
                        splitMethod: "EQUAL",
                      });
                      if (!custom)
                        await markGroup(
                          s,
                          "ACCEPTED",
                          editing === s.fingerprint ? editTitle : s.title,
                        );
                    },
                    "Suggestion accepted",
                  )
                }
              >
                Add expense
              </Button>
            </XStack>
          </YStack>
        </Card>
      ))}
      {suggestions.some((item) => item.direction !== "CREDIT") && !filteredSuggestions.length && (
        <Empty
          title="No matching messages"
          detail="Try a merchant name, amount, reference, or account digits."
        />
      )}
      {!custom && Object.keys(history).length > 0 && (
        <Card>
          <YStack gap={12}>
            <Heading size={17}>Reviewed this week</Heading>
            {Object.entries(history)
              .sort((a, b) => b[1].occurredAt.localeCompare(a[1].occurredAt))
              .map(([key, record]) => (
                <XStack key={key} justifyContent="space-between" gap={12}>
                  <YStack flex={1} gap={4}>
                    <Label>
                      {record.title ?? "Bank expense"}
                      {record.amountMinor
                        ? ` · ${money(record.amountMinor)}`
                        : ""}
                    </Label>
                    <Label muted size={11}>
                      {new Date(record.occurredAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Label>
                  </YStack>
                  <View
                    style={{
                      alignSelf: "center",
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: record.decision === "ACCEPTED" ? c.mint : c.soft,
                    }}
                  >
                    <Label
                      size={11}
                      bold
                      color={record.decision === "ACCEPTED" ? c.positive : c.muted}
                    >
                      {record.decision === "ACCEPTED" ? "Added" : "Dismissed"}
                    </Label>
                  </View>
                </XStack>
              ))}
          </YStack>
        </Card>
      )}
      <Button secondary onPress={() => router.push("/add")}>
        Add a transaction manually
      </Button>
    </YStack>
  );
}
