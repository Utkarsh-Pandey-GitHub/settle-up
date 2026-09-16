import React, { useEffect, useState } from "react";
import {
  View,
  Pressable,
  useWindowDimensions,
  Image,
  Alert,
} from "react-native";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import { XStack, YStack } from "tamagui";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import type { Dashboard, TransactionView } from "@settleup/contracts";
import {
  analytics,
  type AnalyticsFilter,
} from "@settleup/domain/src/analytics";
import { money, periodRange, type Period } from "@settleup/domain";
import { useDashboard, useAction } from "../data/hooks";
import { repository } from "../data/repository";
import { useSession } from "../data/session";
import { Shell } from "../components/Shell";
import {
  Label,
  Heading,
  Card,
  Button,
  Icon,
  Avatar,
  Progress,
  Empty,
  Notice,
  Chip,
  Field,
  SearchBar,
  FilterDropdownTrigger,
  FilterDropdownPanel,
  useColors,
  type IconName,
  Skeleton,
} from "../components/ui";
export function DataScreen({
  children,
}: {
  children(data: Dashboard): React.ReactNode;
}) {
  const query = useDashboard(),
    ready = useSession((s) => s.ready),
    id = useSession((s) => s.activeId);
  if (ready && !id) return <Redirect href="/onboarding" />;
  if (query.data?.account.name === "New friend")
    return <Redirect href="/auth" />;
  return (
    <Shell>
      {query.isLoading || !ready ? (
        <YStack gap={24}>
          <Skeleton height={40} width={240} radius={10} />
          <Skeleton height={190} radius={22} />
          <Skeleton height={300} radius={22} />
          <Label muted>Loading your account…</Label>
        </YStack>
      ) : query.error ? (
        <YStack gap={15}>
          <Notice error>{query.error.message}</Notice>
          <Button onPress={() => query.refetch()}>Try again</Button>
        </YStack>
      ) : query.data ? (
        children(query.data)
      ) : null}
    </Shell>
  );
}
export function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?(): void;
}) {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      marginBottom={18}
    >
      <Heading size={18}>{title}</Heading>
      {!!action && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Label size={12} color="#5552B4" bold>
            {action} →
          </Label>
        </Pressable>
      )}
    </XStack>
  );
}
const categoryIcon = (name?: string): IconName =>
  name?.includes("Food")
    ? "coffee"
    : name === "Transport"
      ? "car"
      : name === "Travel"
        ? "plane"
        : name === "Utilities"
          ? "bolt"
          : "bag";
export function TransactionRow({
  transaction: t,
  data,
  last,
  compact = false,
  selectable = false,
  selected = false,
  onSelect,
  onLongPress,
}: {
  transaction: TransactionView;
  data: Dashboard;
  last?: boolean;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onLongPress?: () => void;
}) {
  const c = useColors(),
    router = useRouter();
  const tag = data.tags.find((tag) => tag.id === t.tagIds[0]),
    ledger = data.ledgers.find((l) => l.id === t.ledgerId);
  const incoming = t.destinationId === data.account.id;
  const storedIcon = ["bag", "coffee", "car", "plane", "bolt", "wallet"].includes(
    t.icon ?? "",
  )
    ? (t.icon as IconName)
    : null;
  return (
    <Pressable
      onPress={() => {
        if (selectable && onSelect) {
          onSelect();
        } else {
          router.push(`/transaction/${t.id}` as any);
        }
      }}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${money(t.amountMinor, t.currency)}, ${t.status}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: compact ? 9 : 14,
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.line,
        backgroundColor: selected
          ? `${c.mint}`
          : pressed
            ? c.bg
            : "transparent",
        borderRadius: 10,
        paddingHorizontal: 8,
      })}
    >
      {selectable && (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            borderWidth: selected ? 0 : 2,
            borderColor: selected ? "#5552B4" : c.muted,
            backgroundColor: selected ? "#5552B4" : "transparent",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {selected && <Icon name="check" size={14} color="#FFFFFF" />}
        </View>
      )}
      <View
        style={{
          height: 43,
          width: 43,
          borderRadius: 13,
          backgroundColor: `${tag?.color ?? "#9985C2"}20`,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {storedIcon ? (
          <Icon name={storedIcon} color={tag?.color ?? "#7760A5"} size={21} />
        ) : t.icon || (!tag && t.type !== "SETTLEMENT") ? (
          <Label bold size={19} color="#7760A5">
            {t.icon || t.title.slice(0, 1).toUpperCase()}
          </Label>
        ) : (
          <Icon
            name={t.type === "SETTLEMENT" ? "down" : categoryIcon(tag?.name)}
            color={tag?.color ?? "#9985C2"}
            size={21}
          />
        )}
      </View>
      <YStack flex={1} gap={2} alignItems="flex-start" minWidth={0}>
        <Label
          size={13}
          bold
          numberOfLines={1}
          textAlign="left"
          alignSelf="stretch"
        >
          {t.title}
        </Label>
        <XStack gap={6} alignItems="center" flexWrap="wrap">
          <Label muted size={10}>
            {tag?.name ?? t.type.toLowerCase().replace(/_/g, " ")}
          </Label>
          {ledger && (
            <Label size={10} muted>
              · {ledger.name}
            </Label>
          )}
          {t.status !== "SETTLED" && (
            <Label
              size={9}
              color={t.status === "DISPUTED" ? "#B42332" : "#A26D20"}
            >
              · {t.status.toLowerCase().replace(/_/g, " ")}
            </Label>
          )}
        </XStack>
      </YStack>
      <YStack alignItems="flex-end" gap={3}>
        <Label size={14} bold color={incoming ? "#218262" : c.text}>
          {incoming ? "+" : "−"}
          {money(t.amountMinor, t.currency)}
        </Label>
        <Label muted size={10}>
          {new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
          }).format(new Date(t.occurredAt))}
        </Label>
      </YStack>
    </Pressable>
  );
}
export function SpendingChart({
  data,
  filter,
}: {
  data: Dashboard;
  filter: AnalyticsFilter;
}) {
  const c = useColors();
  const stats = analytics(data, filter);
  const days = stats.byDay.slice(-10);
  const max = Math.max(...days.map((d) => d.amountMinor), 100);
  const barWidth = 28;
  const chartWidth = 530;
  return (
    <View
      accessibilityLabel={`Spending trend. ${days.map((d) => `${d.date}: ${money(d.amountMinor)}`).join(". ")}`}
    >
      <Svg width="100%" height={172} viewBox={`0 0 ${chartWidth} 172`}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            <Line
              x1={46}
              y1={20 + i * 52}
              x2={525}
              y2={20 + i * 52}
              stroke={c.line}
              strokeDasharray="4,5"
            />
            <SvgText x={0} y={24 + i * 52} fill={c.muted} fontSize={9}>
              {money(Math.round(max * (1 - i * 0.5)), filter.currency).replace(
                ".00",
                "",
              )}
            </SvgText>
          </React.Fragment>
        ))}
        {days.map((d, i) => {
          const x = 60 + i * (450 / Math.max(days.length, 1));
          const h = Math.max(4, (d.amountMinor / max) * 100);
          return (
            <React.Fragment key={d.date}>
              <Rect
                x={x}
                y={124 - h}
                width={barWidth}
                height={h}
                rx={6}
                fill={i === days.length - 1 ? "#68785F" : "#D7DDCF"}
              />
              <SvgText
                x={x + barWidth / 2}
                y={Math.max(12, 118 - h)}
                textAnchor="middle"
                fill={c.text}
                fontSize={8}
                fontWeight="600"
              >
                {money(d.amountMinor, filter.currency).replace(".00", "")}
              </SvgText>
              <SvgText
                x={x + barWidth / 2}
                y={153}
                textAnchor="middle"
                fill={c.muted}
                fontSize={10}
              >
                {new Date(d.date).getDate()}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      {!days.length && <Label muted>No spending in this period.</Label>}
      <Label muted size={10}>
        Daily personal spending · {filter.currency} · Asia/Kolkata
      </Label>
    </View>
  );
}
export function Overview() {
  return <DataScreen>{(d) => <HomeContent data={d} />}</DataScreen>;
}
function HomeContent({ data: d }: { data: Dashboard }) {
  const router = useRouter(),
    { width, height } = useWindowDimensions(),
    c = useColors();
  const stats = analytics(d, {
    ...periodRange("MONTH", "Asia/Kolkata"),
    currency: d.account.currency,
  });
  const go = (p: string) =>
    ["/", "/activity", "/analytics", "/groups", "/goals"].includes(p)
      ? router.replace(p as any)
      : router.push(p as any);
  const visibleRows = Math.max(
    1,
    Math.min(4, Math.floor((height - (width >= 1000 ? 500 : 530)) / 70)),
  );
  return (
    <YStack gap={14} maxWidth={1050} width="100%" alignSelf="center">
      <XStack
        gap={12}
        alignItems="center"
        padding={12}
        backgroundColor={c.mint}
        borderRadius={18}
      >
        <Avatar name={d.account.name} size={40} />
        <YStack alignItems="flex-start">
          <Heading size={21}>Hi, {d.account.name.split(" ")[0]}</Heading>
          <Label muted size={12}>
            Welcome back!
          </Label>
        </YStack>
      </XStack>
      <Card
        style={{
          padding: 16,
          borderWidth: 1,
          borderColor: "#D6EDE6",
          backgroundColor: c.card,
          shadowColor: "#1A3B2F",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 6,
        }}
      >
        <XStack alignItems="center" gap={width > 600 ? 24 : 14}>
          <Image
            source={require("../../assets/finance/coins.png")}
            accessibilityLabel="Illustrated stack of savings coins"
            resizeMode="contain"
            style={{
              width: width > 600 ? 140 : 88,
              height: (width > 600 ? 140 : 88) * 0.85,
            }}
          />
          <YStack flex={1} minWidth={0} alignItems="stretch" gap={8}>
            <YStack alignItems="flex-start" gap={1}>
              <Label size={11}>Your spending this month</Label>
              <Label bold size={width > 600 ? 42 : 30} letterSpacing={-1}>
                {money(stats.spendingMinor, d.account.currency).replace(
                  ".00",
                  "",
                )}
              </Label>
            </YStack>
            <XStack
              borderTopWidth={1}
              borderColor="#A6CFC5"
              paddingTop={8}
              gap={12}
              flexWrap="wrap"
            >
              <YStack flex={1} minWidth={70} alignItems="flex-start" gap={1}>
                <Label muted size={10}>
                  Owed to you
                </Label>
                <Label bold size={width > 600 ? 18 : 14}>
                  {money(stats.receivableMinor, d.account.currency).replace(
                    ".00",
                    "",
                  )}
                </Label>
              </YStack>
              <YStack flex={1} minWidth={70} alignItems="flex-start" gap={1}>
                <Label muted size={10}>
                  You owe
                </Label>
                <Label bold size={width > 600 ? 18 : 14}>
                  {money(stats.owedMinor, d.account.currency).replace(
                    ".00",
                    "",
                  )}
                </Label>
              </YStack>
            </XStack>
          </YStack>
        </XStack>
      </Card>
      <XStack gap={12}>
        {(
          [
            {
              label: "Add transaction",
              short: "Add expense",
              icon: "plus",
              path: "/add",
              color: "#DED2F9",
            },
            {
              label: "Settle up",
              short: "Record payment",
              icon: "arrow",
              path: "/settle",
              color: "#D3E1FF",
            },
            {
              label: "Scan a bill",
              short: "Scan bill",
              icon: "camera",
              path: "/add?bill=camera",
              color: "#FDC9D2",
            },
          ] as const
        ).map((tile) => (
          <View key={tile.label} style={{ flex: 1 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tile.label}
              onPress={() => go(tile.path)}
              style={{
                width: "100%",
                minHeight: 106,
                paddingVertical: 10,
                alignItems: "center",
                gap: 7,
                backgroundColor: tile.color,
                borderRadius: 17,
              }}
            >
              <View
                style={{
                  padding: 9,
                  borderRadius: 30,
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Icon name={tile.icon} color="#191D21" size={23} />
              </View>
              <Label
                color="#191D21"
                size={width < 390 ? 10 : 12}
                bold
                textAlign="center"
                numberOfLines={2}
                width="100%"
                minHeight={32}
              >
                {tile.short}
              </Label>
            </Pressable>
          </View>
        ))}
      </XStack>

      <YStack gap={5}>
        <SectionTitle
          title="Your last activity"
          action="All activity"
          onPress={() => go("/activity")}
        />
        {d.transactions.slice(0, visibleRows).map((t) => (
          <View
            key={t.id}
            style={{
              backgroundColor: c.blue,
              borderRadius: 10,
              paddingHorizontal: 12,
            }}
          >
            <TransactionRow transaction={t} data={d} last compact />
          </View>
        ))}
        {!d.transactions.length && (
          <Empty
            title="A fresh start"
            detail="Your first entry is the beginning of a clearer picture."
            action="Add an expense"
            onPress={() => go("/add")}
          />
        )}
      </YStack>
    </YStack>
  );
}
export function ActivityScreen() {
  const [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [status, setStatus] = useState("");
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<"tag" | "status" | null>(
    null,
  );
  const action = useAction();
  const c = useColors();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleLongPress = (id: string) => {
    if (!isSelecting) {
      setIsSelecting(true);
      setSelectedIds([id]);
    }
  };

  return (
    <DataScreen>
      {(d) => {
        const filtered = d.transactions.filter(
          (t) =>
            t.title.toLowerCase().includes(search.toLowerCase()) &&
            (!tag || t.tagIds.includes(tag)) &&
            (!status || t.status === status),
        );

        const allFilteredSelected =
          filtered.length > 0 &&
          filtered.every((t) => selectedIds.includes(t.id));

        const toggleSelectAll = () => {
          if (allFilteredSelected) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filtered.map((t) => t.id));
          }
        };

        const handleDelete = () => {
          if (selectedIds.length === 0) return;
          Alert.alert(
            "Delete Transactions",
            `Are you sure you want to delete ${selectedIds.length} transaction${selectedIds.length > 1 ? "s" : ""}?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  action
                    .run(
                      () =>
                        repository.deleteTransactions(
                          d.account.id,
                          selectedIds,
                        ),
                      `${selectedIds.length} transaction${selectedIds.length > 1 ? "s" : ""} deleted`,
                    )
                    .then((ok) => {
                      if (ok) {
                        setSelectedIds([]);
                        setIsSelecting(false);
                      }
                    });
                },
              },
            ],
          );
        };

        return (
          <YStack gap={14}>
            {/* Title & Action Bar */}
            <XStack justifyContent="space-between" alignItems="center">
              <YStack gap={2}>
                <Heading size={22}>Activity</Heading>
                <Label muted size={12}>
                  {filtered.length} transaction
                  {filtered.length !== 1 ? "s" : ""}
                </Label>
              </YStack>

              <XStack gap={8} alignItems="center">
                {isSelecting ? (
                  <>
                    <Pressable
                      onPress={toggleSelectAll}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: `${c.soft}`,
                        borderRadius: 14,
                      }}
                    >
                      <Label size={12} color="#5552B4" bold>
                        {allFilteredSelected ? "Deselect All" : "Select All"}
                      </Label>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setIsSelecting(false);
                        setSelectedIds([]);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: c.soft,
                        borderRadius: 14,
                      }}
                    >
                      <Label size={12} color={c.muted} bold>
                        Cancel
                      </Label>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => setIsSelecting(true)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: c.soft,
                      borderRadius: 14,
                    }}
                  >
                    <Label size={12} color="#5552B4" bold>
                      Select
                    </Label>
                  </Pressable>
                )}
              </XStack>
            </XStack>

            {/* Search Bar */}
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search activity…"
            />

            {/* Dropdown Filter Triggers */}
            <XStack gap={8} alignItems="center">
              <FilterDropdownTrigger
                label={
                  tag
                    ? (d.tags.find((t) => t.id === tag)?.name ?? "Tag")
                    : "All Tags"
                }
                active={!!tag}
                onPress={() =>
                  setOpenDropdown(openDropdown === "tag" ? null : "tag")
                }
              />

              <FilterDropdownTrigger
                label={
                  status
                    ? status.toLowerCase().replace(/_/g, " ")
                    : "All Statuses"
                }
                active={!!status}
                onPress={() =>
                  setOpenDropdown(openDropdown === "status" ? null : "status")
                }
              />

              {(!!tag || !!status) && (
                <Pressable
                  onPress={() => {
                    setTag("");
                    setStatus("");
                    setOpenDropdown(null);
                  }}
                  style={{
                    height: 36,
                    paddingHorizontal: 10,
                    backgroundColor: "#FCE8E6",
                    borderRadius: 12,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Label size={11} bold color="#D9381E">
                    Clear
                  </Label>
                </Pressable>
              )}
            </XStack>

            {/* Expandable Dropdown Content Panels */}
            {openDropdown === "tag" && (
              <FilterDropdownPanel title="FILTER BY TAG">
                <Chip
                  selected={!tag}
                  onPress={() => {
                    setTag("");
                    setOpenDropdown(null);
                  }}
                >
                  All tags
                </Chip>
                {d.tags
                  .filter((t) => !t.archived)
                  .map((t) => (
                    <Chip
                      key={t.id}
                      selected={tag === t.id}
                      onPress={() => {
                        setTag(t.id);
                        setOpenDropdown(null);
                      }}
                    >
                      {t.name}
                    </Chip>
                  ))}
              </FilterDropdownPanel>
            )}

            {openDropdown === "status" && (
              <FilterDropdownPanel title="FILTER BY STATUS">
                {["", "PENDING", "SETTLED", "DISPUTED", "PENDING_LOAN"].map(
                  (s) => (
                    <Chip
                      key={s}
                      selected={status === s}
                      onPress={() => {
                        setStatus(s);
                        setOpenDropdown(null);
                      }}
                    >
                      {s ? s.toLowerCase().replace(/_/g, " ") : "All statuses"}
                    </Chip>
                  ),
                )}
              </FilterDropdownPanel>
            )}

            {/* Multi-Select Floating Action Bar */}
            {isSelecting && selectedIds.length > 0 && (
              <XStack
                backgroundColor="#5552B4"
                borderRadius={16}
                paddingHorizontal={16}
                paddingVertical={12}
                justifyContent="space-between"
                alignItems="center"
              >
                <Label color="#FFFFFF" bold size={13}>
                  {selectedIds.length} selected
                </Label>
                <Pressable
                  onPress={handleDelete}
                  disabled={action.busy}
                  style={{
                    backgroundColor: "#FF4D4D",
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon name="close" size={14} color="#FFFFFF" />
                  <Label color="#FFFFFF" bold size={13}>
                    {action.busy ? "Deleting…" : "Delete"}
                  </Label>
                </Pressable>
              </XStack>
            )}

            {/* Transaction List */}
            <Card>
              {filtered.map((t, index) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  data={d}
                  last={index === filtered.length - 1}
                  selectable={isSelecting}
                  selected={selectedIds.includes(t.id)}
                  onSelect={() => toggleSelect(t.id)}
                  onLongPress={() => handleLongPress(t.id)}
                />
              ))}
              {!filtered.length && (
                <Empty
                  title="Nothing here yet"
                  detail="Add your first expense or clear filters."
                />
              )}
            </Card>
          </YStack>
        );
      }}
    </DataScreen>
  );
}
export function AnalyticsScreen() {
  const params = useLocalSearchParams<{ period?: string }>();
  const [period, setPeriod] = useState<Period>(
      params.period === "WEEK" ? "WEEK" : "MONTH",
    ),
    [tag, setTag] = useState(""),
    [ledger, setLedger] = useState(""),
    [custom, setCustom] = useState(false),
    [start, setStart] = useState(new Date().toISOString().slice(0, 10)),
    [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [openFilter, setOpenFilter] = useState<
    "period" | "category" | "group" | null
  >(null);
  const router = useRouter();
  useEffect(() => {
    if (params.period === "WEEK" || params.period === "MONTH") {
      setPeriod(params.period);
      setCustom(false);
      setTag("");
      setLedger("");
      setOpenFilter(null);
      router.setParams({ period: undefined });
    }
  }, [params.period]);
  return (
    <DataScreen>
      {(d) => {
        const validCustom =
          /^\d{4}-\d{2}-\d{2}$/.test(start) &&
          /^\d{4}-\d{2}-\d{2}$/.test(end) &&
          start < end;
        const filter = {
          ...(custom && validCustom
            ? { start: `${start}T00:00:00.000Z`, end: `${end}T00:00:00.000Z` }
            : periodRange(period, "Asia/Kolkata")),
          currency: d.account.currency,
          tagIds: tag ? [tag] : [],
          ledgerIds: ledger ? [ledger] : [],
        };
        const a = analytics(d, filter);
        return (
          <YStack gap={22}>
            <XStack justifyContent="space-between" gap={12} flexWrap="wrap">
              <YStack>
                <Heading>The bigger picture.</Heading>
                <Label muted>Know where it goes. Decide what comes next.</Label>
              </YStack>
              <Button
                secondary
                icon="link"
                onPress={() => router.push("/share")}
              >
                Share a snapshot
              </Button>
            </XStack>

            {/* Analytics Dropdown Filter Triggers */}
            <XStack gap={6} alignItems="center">
              <FilterDropdownTrigger
                label={
                  custom ? "Custom" : period.toLowerCase().replace(/_/g, " ")
                }
                active={period !== "MONTH" || custom}
                onPress={() =>
                  setOpenFilter(openFilter === "period" ? null : "period")
                }
              />

              <FilterDropdownTrigger
                label={
                  tag
                    ? (d.tags.find((t) => t.id === tag)?.name ?? "Category")
                    : "All Categories"
                }
                active={!!tag}
                onPress={() =>
                  setOpenFilter(openFilter === "category" ? null : "category")
                }
              />

              <FilterDropdownTrigger
                label={
                  ledger
                    ? (d.ledgers.find((l) => l.id === ledger)?.name ?? "Group")
                    : "All Groups"
                }
                active={!!ledger}
                onPress={() =>
                  setOpenFilter(openFilter === "group" ? null : "group")
                }
              />

              {(!!tag || !!ledger || custom || period !== "MONTH") && (
                <Pressable
                  onPress={() => {
                    setPeriod("MONTH");
                    setTag("");
                    setLedger("");
                    setCustom(false);
                    setOpenFilter(null);
                  }}
                  style={{
                    height: 36,
                    paddingHorizontal: 10,
                    backgroundColor: "#FCE8E6",
                    borderRadius: 12,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Label size={11} bold color="#D9381E">
                    Clear
                  </Label>
                </Pressable>
              )}
            </XStack>

            {/* Expandable Dropdown Content Panels */}
            {openFilter === "period" && (
              <FilterDropdownPanel title="FILTER BY PERIOD">
                {(
                  [
                    ["DAY", "Today"],
                    ["WEEK", "This week"],
                    ["PREVIOUS_WEEK", "Last week"],
                    ["MONTH", "This month"],
                    ["PREVIOUS_MONTH", "Last month"],
                    ["LAST_30", "Last 30 days"],
                    ["YEAR", "This year"],
                  ] as [Period, string][]
                ).map(([key, name]) => (
                  <Chip
                    key={key}
                    selected={period === key && !custom}
                    onPress={() => {
                      setPeriod(key);
                      setCustom(false);
                      setOpenFilter(null);
                    }}
                  >
                    {name}
                  </Chip>
                ))}
                <Chip selected={custom} onPress={() => setCustom(true)}>
                  Custom
                </Chip>

                {custom && (
                  <XStack gap={12} flexWrap="wrap" marginTop={6} width="100%">
                    <Field
                      label="Start (UTC, YYYY-MM-DD)"
                      value={start}
                      onChangeText={setStart}
                    />
                    <Field
                      label="End exclusive (UTC)"
                      value={end}
                      onChangeText={setEnd}
                    />
                  </XStack>
                )}
              </FilterDropdownPanel>
            )}

            {openFilter === "category" && (
              <FilterDropdownPanel title="FILTER BY CATEGORY">
                <Chip
                  selected={!tag}
                  onPress={() => {
                    setTag("");
                    setOpenFilter(null);
                  }}
                >
                  All categories
                </Chip>
                {d.tags.map((t) => (
                  <Chip
                    selected={tag === t.id}
                    onPress={() => {
                      setTag(t.id);
                      setOpenFilter(null);
                    }}
                    key={t.id}
                  >
                    {t.name}
                  </Chip>
                ))}
              </FilterDropdownPanel>
            )}

            {openFilter === "group" && (
              <FilterDropdownPanel title="FILTER BY GROUP">
                <Chip
                  selected={!ledger}
                  onPress={() => {
                    setLedger("");
                    setOpenFilter(null);
                  }}
                >
                  All groups
                </Chip>
                {d.ledgers.map((l) => (
                  <Chip
                    key={l.id}
                    selected={ledger === l.id}
                    onPress={() => {
                      setLedger(l.id);
                      setOpenFilter(null);
                    }}
                  >
                    {l.name}
                  </Chip>
                ))}
              </FilterDropdownPanel>
            )}
            <Card>
              <Label muted>Total personal spending</Label>
              <Heading size={36}>{money(a.spendingMinor, a.currency)}</Heading>
              <Label muted size={12}>
                Previous equivalent period:{" "}
                {money(a.previousSpendingMinor, a.currency)}
              </Label>
              <View style={{ marginTop: 25 }}>
                <SpendingChart data={d} filter={filter} />
              </View>
            </Card>
            <Card>
              <SectionTitle title="Where your money went" />
              {a.byTag.map((t) => (
                <YStack key={t.id} gap={9} marginBottom={20}>
                  <XStack justifyContent="space-between">
                    <Label>
                      {d.tags.find((tag) => tag.id === t.id)?.name ??
                        "Uncategorized"}
                    </Label>
                    <Label bold>{money(t.amountMinor, a.currency)}</Label>
                  </XStack>
                  <Progress
                    value={
                      a.spendingMinor
                        ? (t.amountMinor / a.spendingMinor) * 100
                        : 0
                    }
                    color={d.tags.find((tag) => tag.id === t.id)?.color}
                  />
                </YStack>
              ))}
              <Label muted size={11}>
                Expenses with multiple tags appear in each category; category
                totals can overlap. Loans and repayments are excluded from
                spending.
              </Label>
            </Card>
            <Card>
              <SectionTitle title="Cash flow & outstanding balances" />
              {[
                ["Outgoing in period", a.outgoingMinor],
                ["Incoming in period", a.incomingMinor],
                ["You owe · current", a.owedMinor],
                ["You are owed · current", a.receivableMinor],
              ].map(([name, amount]) => (
                <XStack
                  key={name}
                  justifyContent="space-between"
                  paddingVertical={12}
                >
                  <Label muted>{name}</Label>
                  <Label bold>{money(Number(amount), a.currency)}</Label>
                </XStack>
              ))}
            </Card>
          </YStack>
        );
      }}
    </DataScreen>
  );
}
