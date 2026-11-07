import React, { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { View, Pressable, useWindowDimensions, Image } from "react-native";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import { XStack, YStack } from "tamagui";
import Svg, {
  Rect,
  Line,
  Circle,
  Path,
  Text as SvgText,
} from "react-native-svg";
import type { Dashboard, TransactionView } from "@settleup/contracts";
import {
  analytics,
  previousPeriod,
  type AnalyticsFilter,
} from "@settleup/domain/src/analytics";
import {
  money,
  parseMoney,
  periodRange,
  goalProgress,
  type Period,
} from "@settleup/domain";
import { useDashboard, useAction } from "../data/hooks";
import { repository, extra } from "../data/repository";
import { useSession } from "../data/session";
import { personName } from "../data/people";
import { TourGroup } from "../components/WalkthroughTour";
import { Shell } from "../components/Shell";
import { DatePicker } from "../components/DateTimePicker";
import { GoalCreator } from "./goal-form";
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
  SearchBar,
  FilterDropdownTrigger,
  FilterDropdownPanel,
  SearchPicker,
  ActionDialog,
  useColors,
  type IconName,
  Skeleton,
} from "../components/ui";
export function DataScreen({
  children,
}: {
  children(
    data: Dashboard,
    refresh: () => Promise<{ error: Error | null }>,
    refreshing: boolean,
  ): React.ReactNode;
}) {
  const query = useDashboard(),
    ready = useSession((s) => s.ready),
    id = useSession((s) => s.activeId);
  if (ready && !id) return <Redirect href="/onboarding" />;
  if (query.data?.account.name === "New friend")
    return <Redirect href="/auth" />;
  return (
    <Shell
      tourReady={ready && !!query.data && !query.error && !query.isLoading}
    >
      {query.isLoading || !ready ? (
        <YStack gap={24}>
          <Skeleton height={40} width={240} radius={10} />
          <Skeleton height={190} radius={22} />
          <Skeleton height={300} radius={22} />
          <Label muted>Loading your account…</Label>
        </YStack>
      ) : query.data ? (
        children(query.data, () => query.refetch(), query.isFetching)
      ) : query.error ? (
        <YStack gap={15}>
          <Notice error>{query.error.message}</Notice>
          <Button onPress={() => query.refetch()}>Try again</Button>
        </YStack>
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
          <Label size={12} color="#59458F" bold>
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
  onAssignGroup,
  showCreator = false,
}: {
  transaction: TransactionView;
  data: Dashboard;
  last?: boolean;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onLongPress?: () => void;
  onAssignGroup?: () => void;
  showCreator?: boolean;
}) {
  const c = useColors(),
    router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width / Math.max(fontScale, 1) < 370;
  const tag = data.tags.find((tag) => tag.id === t.tagIds[0]),
    ledger = data.ledgers.find((l) => l.id === t.ledgerId);
  const incoming = t.destinationId === data.account.id;
  const cashSign = incoming ? "+" : t.sourceId === data.account.id ? "−" : "";
  const storedIcon = [
    "bag",
    "coffee",
    "car",
    "plane",
    "bolt",
    "wallet",
  ].includes(t.icon ?? "")
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
        gap: narrow ? 7 : 12,
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
            borderColor: selected ? "#59458F" : c.muted,
            backgroundColor: selected ? "#59458F" : "transparent",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {selected && <Icon name="check" size={14} color="#FFFFFF" />}
        </View>
      )}
      <View
        style={{
          height: narrow ? 34 : 43,
          width: narrow ? 34 : 43,
          borderRadius: 13,
          backgroundColor: `${tag?.color ?? "#9985C2"}20`,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {storedIcon ? (
          <Icon name={storedIcon} color="#211D29" size={21} />
        ) : t.icon || (!tag && t.type !== "SETTLEMENT") ? (
          <Label bold size={19} color="#7760A5">
            {t.icon || t.title.slice(0, 1).toUpperCase()}
          </Label>
        ) : (
          <Icon
            name={t.type === "SETTLEMENT" ? "down" : categoryIcon(tag?.name)}
            color="#211D29"
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
            <Label size={10} muted maxWidth="100%" numberOfLines={1}>
              · {ledger.name}
            </Label>
          )}
          {t.status !== "SETTLED" && (
            <Label size={9} color="#A26D20">
              · {t.status.toLowerCase().replace(/_/g, " ")}
            </Label>
          )}
        </XStack>
        {showCreator && (
          <Label muted size={11} maxWidth="100%">
            Recorded by{" "}
            {personName(data, t.createdById ?? t.sourceId, t.createdByName)}
            {t.type === "SHARED_EXPENSE" &&
            t.sourceId !== (t.createdById ?? t.sourceId)
              ? ` · Paid by ${personName(data, t.sourceId, t.payerName)}`
              : ""}
          </Label>
        )}
      </YStack>
      {!!onAssignGroup && !selectable && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${t.title}`}
          onPress={(event) => {
            event.stopPropagation();
            onAssignGroup();
          }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: c.soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="edit" size={15} color="#59458F" />
        </Pressable>
      )}
      <YStack
        alignItems="flex-end"
        gap={3}
        maxWidth={narrow ? "44%" : "48%"}
        flexShrink={1}
      >
        <Label
          size={14}
          bold
          textAlign="right"
          color={incoming ? "#218262" : c.text}
        >
          {cashSign}
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
  compare = false,
  view = "bars",
}: {
  data: Dashboard;
  filter: AnalyticsFilter;
  compare?: boolean;
  view?: "bars" | "trend" | "cumulative";
}) {
  const c = useColors();
  const stats = analytics(data, filter);
  const prior = previousPeriod(filter);
  const previousDays = compare ? analytics(data, prior).byDay : [];
  const chartDays = (range: AnalyticsFilter, spending: typeof stats.byDay) => {
    const zone = range.zone ?? "Asia/Kolkata";
    const today = DateTime.now().setZone(zone).startOf("day");
    const first = DateTime.fromISO(range.start, { zone }).startOf("day");
    const last = DateTime.fromISO(range.end, { zone })
      .minus({ milliseconds: 1 })
      .startOf("day");
    const end = last < today ? last : today;
    const start = end.minus({ days: 9 });
    const visibleStart = first > start ? first : start;
    const daily = new Map(spending.map((day) => [day.date, day.amountMinor]));
    const visible = [];
    for (let day = visibleStart; day <= end; day = day.plus({ days: 1 })) {
      const date = day.toISODate()!;
      visible.push({ date, amountMinor: daily.get(date) ?? 0 });
    }
    return visible;
  };
  const days = chartDays(filter, stats.byDay);
  const priorDays = compare ? chartDays(prior, previousDays) : [];
  const amounts = (values: typeof days, all: typeof days) => {
    let running = 0;
    if (view === "cumulative" && values.length)
      running = all
        .filter((day) => day.date < values[0].date)
        .reduce((sum, day) => sum + day.amountMinor, 0);
    return values.map((day) => {
      running += day.amountMinor;
      return view === "cumulative" ? running : day.amountMinor;
    });
  };
  const currentValues = amounts(days, stats.byDay);
  const previousValues = amounts(priorDays, previousDays);
  const slots = Math.max(days.length, priorDays.length, 1);
  const max = Math.max(...currentValues, ...previousValues, 100);
  const barWidth = Math.min(compare ? 15 : 26, 300 / slots);
  const chartWidth = 530;
  const pointX = (index: number) => 68 + index * (430 / Math.max(slots - 1, 1));
  const pointY = (value: number) => 124 - (value / max) * 100;
  const linePath = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${index ? "L" : "M"}${pointX(index)},${pointY(value)}`,
      )
      .join(" ");
  return (
    <View
      accessibilityLabel={`${view} spending chart. ${days.map((d, i) => `${d.date}: ${money(currentValues[i], filter.currency)}`).join(". ")}`}
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
        {view !== "bars" && previousValues.length > 0 && (
          <Path
            d={linePath(previousValues)}
            fill="none"
            stroke="#B9B3C6"
            strokeWidth={3}
            strokeDasharray="6,5"
          />
        )}
        {view !== "bars" && currentValues.length > 0 && (
          <>
            {view === "cumulative" && (
              <Path
                d={`${linePath(currentValues)} L${pointX(currentValues.length - 1)},124 L${pointX(0)},124 Z`}
                fill="#A990DC"
                opacity={0.12}
              />
            )}
            <Path
              d={linePath(currentValues)}
              fill="none"
              stroke="#7658B8"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {currentValues.map((value, index) => (
              <Circle
                key={days[index].date}
                cx={pointX(index)}
                cy={pointY(value)}
                r={index === currentValues.length - 1 ? 5 : 3}
                fill="#7658B8"
              />
            ))}
          </>
        )}
        {Array.from({ length: slots }, (_, i) => {
          const d = days[i];
          const previous = priorDays[i];
          const x = 60 + i * (450 / slots);
          const h = d ? (d.amountMinor / max) * 100 : 0;
          const previousHeight = previous
            ? (previous.amountMinor / max) * 100
            : 0;
          return (
            <React.Fragment key={d?.date ?? previous?.date ?? i}>
              {view === "bars" && !!previous && (
                <Rect
                  x={x}
                  y={124 - previousHeight}
                  width={barWidth}
                  height={previousHeight}
                  rx={5}
                  fill="#CFC8DC"
                />
              )}
              {view === "bars" && h > 0 && d && (
                <>
                  <Rect
                    x={x + (compare ? barWidth + 3 : 0)}
                    y={124 - h}
                    width={barWidth}
                    height={h}
                    rx={5}
                    fill={i === days.length - 1 ? "#6652A3" : "#A990DC"}
                  />
                  <SvgText
                    x={x + (compare ? barWidth + 3 : 0) + barWidth / 2}
                    y={Math.max(12, 118 - h)}
                    textAnchor="middle"
                    fill={c.text}
                    fontSize={8}
                    fontWeight="600"
                  >
                    {money(d.amountMinor, filter.currency).replace(".00", "")}
                  </SvgText>
                </>
              )}
              <SvgText
                x={
                  view === "bars"
                    ? x + (compare ? barWidth : 0) + barWidth / 2
                    : pointX(i)
                }
                y={153}
                textAnchor="middle"
                fill={c.muted}
                fontSize={10}
              >
                {(d ?? previous)?.date.slice(8)}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      {!stats.byDay.length && <Label muted>No spending in this period.</Label>}
      <Label muted size={10}>
        {view === "cumulative" ? "Running total" : "Daily personal spending"} ·{" "}
        {filter.currency} · Last 10 days of the period
        {compare ? " · violet current, grey previous" : ""}
      </Label>
    </View>
  );
}

function GoalTargetButton({ onPress }: { onPress(): void }) {
  return (
    <Button secondary icon="plus" onPress={onPress}>
      New goal
    </Button>
  );
}
export function Overview() {
  return <DataScreen>{(d) => <HomeContent data={d} />}</DataScreen>;
}
function HomeContent({ data: d }: { data: Dashboard }) {
  const router = useRouter(),
    { width, height, fontScale } = useWindowDimensions(),
    c = useColors();
  const stats = analytics(d, {
    ...periodRange("MONTH", "Asia/Kolkata"),
    currency: d.account.currency,
  });
  const compactSummary = width / Math.max(1, fontScale) < 360;
  const go = (p: string) =>
    ["/", "/activity", "/analytics", "/groups", "/goals"].includes(p)
      ? router.replace(p as any)
      : router.push(p as any);
  const visibleRows = Math.max(
    1,
    Math.min(4, Math.floor((height - (width >= 1000 ? 500 : 530)) / 70)),
  );
  return (
    <YStack gap={20} maxWidth={1050} width="100%" alignSelf="center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.push("/settings")}
        style={({ pressed }) => ({
          opacity: pressed ? 0.78 : 1,
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          paddingVertical: 4,
        })}
      >
        <Avatar name={d.account.name} avatar={d.account.avatar} size={40} />
        <YStack alignItems="flex-start" flex={1}>
          <Heading size={26}>Hi {d.account.name.split(" ")[0]}</Heading>
          <Label muted size={12}>
            Your money at a glance
          </Label>
        </YStack>
        <View style={{ marginLeft: "auto" }}>
          <Icon name="chevron" size={16} color={c.muted} />
        </View>
      </Pressable>
      <Card
        style={{
          padding: 18,
          borderWidth: 0,
          backgroundColor: c.card,
        }}
      >
        <XStack alignItems="center" gap={width > 600 ? 24 : 14}>
          {!compactSummary && (
            <Image
              source={require("../../assets/finance/coins.png")}
              accessibilityLabel="Illustrated stack of savings coins"
              resizeMode="contain"
              style={{
                width: width > 600 ? 140 : 88,
                height: (width > 600 ? 140 : 88) * 0.85,
              }}
            />
          )}
          <YStack flex={1} minWidth={0} alignItems="stretch" gap={8}>
            <YStack alignItems="flex-start" gap={1}>
              <Label size={14} bold>
                Monthly spending
              </Label>
              <Label
                size={width > 600 ? 38 : compactSummary ? 28 : 32}
                letterSpacing={-1}
                maxWidth="100%"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {money(stats.spendingMinor, d.account.currency).replace(
                  /\.00$/,
                  "",
                )}
              </Label>
            </YStack>
            <XStack
              borderTopWidth={1}
              borderColor={c.line}
              paddingTop={8}
              gap={12}
              flexWrap="wrap"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Owed to you: ${money(stats.receivableMinor, d.account.currency)}. View who owes you.`}
                onPress={() =>
                  router.push({ pathname: "/settle", params: { view: "owed" } })
                }
                style={{ flex: 1, minWidth: 70, minHeight: 44 }}
              >
                <XStack alignItems="center" gap={4} flexWrap="wrap">
                  <Label size={12} color={c.accent}>
                    Owed to you
                  </Label>
                  <Icon name="chevron" size={12} color={c.accent} />
                </XStack>
                <Label bold size={width > 600 ? 18 : 14}>
                  {money(stats.receivableMinor, d.account.currency).replace(
                    ".00",
                    "",
                  )}
                </Label>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`You owe: ${money(stats.owedMinor, d.account.currency)}. View debts to pay.`}
                onPress={() =>
                  router.push({ pathname: "/settle", params: { view: "pay" } })
                }
                style={{ flex: 1, minWidth: 70, minHeight: 44 }}
              >
                <XStack alignItems="center" gap={4} flexWrap="wrap">
                  <Label muted size={12}>
                    You owe
                  </Label>
                  <Icon name="chevron" size={12} color={c.muted} />
                </XStack>
                <Label bold size={width > 600 ? 18 : 14}>
                  {money(stats.owedMinor, d.account.currency).replace(
                    ".00",
                    "",
                  )}
                </Label>
              </Pressable>
            </XStack>
          </YStack>
        </XStack>
      </Card>
      <TourGroup step={2} padding={4}>
        <XStack gap={width < 360 ? 8 : 12} flexWrap="wrap">
          {(
            [
              {
                label: "Add transaction",
                short: "Add expense",
                icon: "plus",
                path: "/add",
                color: "#E7DEF7",
              },
              {
                label: "Create group",
                short: "New group",
                icon: "groups",
                path: "/groups",
                color: "#E8F6EF",
              },
              {
                label: "Scan a bill",
                short: "Scan bill",
                icon: "camera",
                path: "/add?bill=camera",
                color: "#F2EEF9",
              },
            ] as const
          ).map((tile) => (
            <View key={tile.label} style={{ flex: 1, minWidth: 0 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tile.label}
                onPress={() => go(tile.path)}
                style={{
                  width: "100%",
                  minHeight: 104,
                  paddingVertical: 12,
                  alignItems: "center",
                  gap: 7,
                  backgroundColor: c.card,
                  borderRadius: 16,
                }}
              >
                <View
                  style={{
                    padding: 10,
                    borderRadius: 30,
                    backgroundColor: tile.color,
                  }}
                >
                  <Icon name={tile.icon} color="#191D21" size={27} />
                </View>
                <Label
                  color={c.text}
                  size={width < 360 ? 11 : 13}
                  bold
                  textAlign="center"
                  numberOfLines={2}
                  width="100%"
                  minHeight={20}
                >
                  {tile.short}
                </Label>
              </Pressable>
            </View>
          ))}
        </XStack>
      </TourGroup>

      <YStack gap={12}>
        <SectionTitle
          title="Recent transactions"
          action="View all"
          onPress={() => go("/activity")}
        />
        {d.transactions
          .filter(
            (transaction) =>
              transaction.type !== "PERSONAL_EXPENSE" ||
              transaction.sourceId === d.account.id,
          )
          .slice(0, visibleRows)
          .map((t) => (
            <View
              key={t.id}
              style={{
                backgroundColor: c.card,
                borderRadius: 14,
                paddingHorizontal: 14,
              }}
            >
              <TransactionRow transaction={t} data={d} last compact />
            </View>
          ))}
        {!d.transactions.some(
          (transaction) =>
            transaction.type !== "PERSONAL_EXPENSE" ||
            transaction.sourceId === d.account.id,
        ) && (
          <Empty
            title="A fresh start"
            detail="Add a transaction to start tracking your spending."
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
    [status, setStatus] = useState(""),
    [ledgerFilter, setLedgerFilter] = useState("");
  const [isSelecting, setIsSelecting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<
    "tag" | "status" | "ledger" | null
  >(null);
  const action = useAction();
  const c = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();

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
            (t.type !== "PERSONAL_EXPENSE" || t.sourceId === d.account.id) &&
            t.title.toLowerCase().includes(search.toLowerCase()) &&
            (!tag || t.tagIds.includes(tag)) &&
            (!status || t.status === status) &&
            (!ledgerFilter || t.ledgerId === ledgerFilter),
        );
        const displayed = filtered;

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
          setDeleteOpen(true);
        };
        const canAssignSelection = selectedIds.every((id) => {
          const entry = d.transactions.find(
            (transaction) => transaction.id === id,
          );
          return (
            entry &&
            !entry.ledgerId &&
            (entry.createdById ?? entry.sourceId) === d.account.id &&
            !["SETTLEMENT", "LOAN_REPAYMENT", "REVERSAL"].includes(entry.type)
          );
        });
        const eligibleLedgers = d.ledgers.filter(
          (ledger) =>
            !ledger.deleted &&
            assignIds.every((id) => {
              const transaction = d.transactions.find((item) => item.id === id);
              if (!transaction || transaction.currency !== ledger.currency)
                return false;
              const related = new Set([
                transaction.sourceId,
                ...(transaction.destinationId
                  ? [transaction.destinationId]
                  : []),
                ...transaction.allocations.map((item) => item.userId),
              ]);
              return [...related].every((memberId) =>
                ledger.members.some((member) => member.id === memberId),
              );
            }),
        );

        return (
          <YStack gap={14}>
            {/* Title & Action Bar */}
            <XStack
              justifyContent="space-between"
              alignItems="center"
              gap={8}
              flexWrap={width < 350 && isSelecting ? "wrap" : "nowrap"}
            >
              <YStack gap={2} flex={1} minWidth={120}>
                <Heading size={22}>Transactions</Heading>
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
                      <Label size={12} color="#59458F" bold>
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
                    <Label size={12} color="#59458F" bold>
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
              placeholder="Search transactions…"
            />

            {/* Dropdown Filter Triggers */}
            <YStack gap={8}>
              <XStack gap={width < 360 ? 4 : 6} alignItems="center">
                <FilterDropdownTrigger
                  compact
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
                  compact
                  label={
                    ledgerFilter
                      ? (d.ledgers.find((ledger) => ledger.id === ledgerFilter)
                          ?.name ?? "Group")
                      : "All groups"
                  }
                  active={!!ledgerFilter}
                  onPress={() =>
                    setOpenDropdown(openDropdown === "ledger" ? null : "ledger")
                  }
                />

                <FilterDropdownTrigger
                  compact
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

                {(!!tag || !!status || !!ledgerFilter) && (
                  <Pressable
                    onPress={() => {
                      setTag("");
                      setStatus("");
                      setLedgerFilter("");
                      setOpenDropdown(null);
                    }}
                    style={{
                      height: 36,
                      paddingHorizontal: width < 360 ? 7 : 10,
                      backgroundColor: "#FCE8E6",
                      borderRadius: 12,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Label size={11} bold color="#D9381E">
                      {width < 360 ? "×" : "Clear"}
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
                  {["", "PENDING", "SETTLED", "PENDING_LOAN"].map((s) => (
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
                  ))}
                </FilterDropdownPanel>
              )}
              {openDropdown === "ledger" && (
                <FilterDropdownPanel title="FILTER BY GROUP">
                  <Chip
                    selected={!ledgerFilter}
                    onPress={() => {
                      setLedgerFilter("");
                      setOpenDropdown(null);
                    }}
                  >
                    All groups
                  </Chip>
                  {d.ledgers.map((ledger) => (
                    <Chip
                      key={ledger.id}
                      selected={ledgerFilter === ledger.id}
                      onPress={() => {
                        setLedgerFilter(ledger.id);
                        setOpenDropdown(null);
                      }}
                    >
                      {ledger.name}
                    </Chip>
                  ))}
                </FilterDropdownPanel>
              )}
            </YStack>

            {/* Multi-Select Floating Action Bar */}
            {isSelecting && selectedIds.length > 0 && (
              <XStack
                backgroundColor="#59458F"
                borderRadius={16}
                paddingHorizontal={16}
                paddingVertical={12}
                justifyContent="space-between"
                alignItems="center"
              >
                <Label color="#FFFFFF" bold size={13}>
                  {selectedIds.length} selected
                </Label>
                {canAssignSelection && (
                  <Pressable
                    onPress={() => setAssignIds(selectedIds)}
                    disabled={action.busy}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.16)",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Icon name="groups" size={14} color="#FFFFFF" />
                    <Label color="#FFFFFF" bold size={12}>
                      Assign group
                    </Label>
                  </Pressable>
                )}
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
            <Card style={{ padding: 6 }}>
              {displayed.map((t, index) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  data={d}
                  last={index === displayed.length - 1}
                  selectable={isSelecting}
                  selected={selectedIds.includes(t.id)}
                  onSelect={() => toggleSelect(t.id)}
                  onLongPress={() => handleLongPress(t.id)}
                  onAssignGroup={
                    (t.ledgerId || t.sourceId === d.account.id) &&
                    !["SETTLEMENT", "LOAN_REPAYMENT", "REVERSAL"].includes(
                      t.type,
                    )
                      ? () =>
                          router.push({
                            pathname: "/add",
                            params: { edit: t.id },
                          })
                      : undefined
                  }
                />
              ))}
              {!filtered.length && (
                <Empty
                  title="Nothing here yet"
                  detail="Add your first expense or clear filters."
                />
              )}
            </Card>
            <SearchPicker
              visible={assignIds.length > 0}
              title={
                assignIds.length > 1
                  ? `Assign ${assignIds.length} transactions`
                  : "Assign transaction to group"
              }
              placeholder="Search groups"
              options={eligibleLedgers.map((ledger) => ({
                id: ledger.id,
                label: ledger.name,
                detail: `${ledger.members.length} members · ${ledger.currency}`,
              }))}
              selected={[]}
              onClose={() => setAssignIds([])}
              onSelect={(ledgerId) => {
                const count = assignIds.length;
                action
                  .run(
                    () =>
                      extra(d.account.id, "/transactions/assign-group", {
                        ids: assignIds,
                        ledgerId,
                      }),
                    `${count} transaction${count === 1 ? "" : "s"} assigned to group.`,
                  )
                  .then((ok) => {
                    if (ok) {
                      setAssignIds([]);
                      setSelectedIds([]);
                      setIsSelecting(false);
                    }
                  });
              }}
            />
            <ActionDialog
              visible={deleteOpen}
              icon="trash"
              title="Delete transactions?"
              detail={`This removes ${selectedIds.length} transaction${selectedIds.length === 1 ? "" : "s"} from your records.`}
              onClose={() => setDeleteOpen(false)}
              actions={[
                {
                  label: "Cancel",
                  secondary: true,
                  onPress: () => setDeleteOpen(false),
                },
                {
                  label: "Delete",
                  destructive: true,
                  loading: action.busy,
                  onPress: () => {
                    const ids = [...selectedIds];
                    setDeleteOpen(false);
                    void action
                      .run(
                        () => repository.deleteTransactions(d.account.id, ids),
                        `${ids.length} transaction${ids.length === 1 ? "" : "s"} deleted`,
                      )
                      .then((ok) => {
                        if (ok) {
                          setSelectedIds([]);
                          setIsSelecting(false);
                        }
                      });
                  },
                },
              ]}
            />
          </YStack>
        );
      }}
    </DataScreen>
  );
}
export function AnalyticsScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ period?: string }>();
  const [period, setPeriod] = useState<Period>(
      params.period === "WEEK" ? "WEEK" : "MONTH",
    ),
    [tag, setTag] = useState(""),
    [ledger, setLedger] = useState(""),
    [custom, setCustom] = useState(false),
    [start, setStart] = useState(() =>
      DateTime.now().setZone("Asia/Kolkata").toISODate()!,
    ),
    [end, setEnd] = useState(() =>
      DateTime.now().setZone("Asia/Kolkata").toISODate()!,
    ),
    [compare, setCompare] = useState(false),
    [chartView, setChartView] = useState<"bars" | "trend" | "cumulative">(
      "bars",
    ),
    [categoryView, setCategoryView] = useState<"bars" | "donut">("donut"),
    [goalOpen, setGoalOpen] = useState(false),
    router = useRouter();
  const [openFilter, setOpenFilter] = useState<
    "period" | "category" | "group" | null
  >(null);
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
        const from = DateTime.fromISO(start, { zone: "Asia/Kolkata" }).startOf(
          "day",
        );
        const until = DateTime.fromISO(end, { zone: "Asia/Kolkata" }).startOf(
          "day",
        );
        const validCustom = from.isValid && until.isValid && from <= until;
        const filter = {
          ...(custom && validCustom
            ? {
                start: from.toUTC().toISO()!,
                end: until.plus({ days: 1 }).toUTC().toISO()!,
              }
            : periodRange(period, "Asia/Kolkata")),
          currency: d.account.currency,
          tagIds: tag ? [tag] : [],
          ledgerIds: ledger ? [ledger] : [],
        };
        const a = analytics(d, filter);
        const comparisonChange = a.previousSpendingMinor
          ? Math.round(
              ((a.spendingMinor - a.previousSpendingMinor) /
                a.previousSpendingMinor) *
                100,
            )
          : null;
        const categoryTotal = a.byTag.reduce(
          (sum, item) => sum + item.amountMinor,
          0,
        );
        const circleLength = 2 * Math.PI * 56;
        let categoryOffset = 0;
        const categorySegments = a.byTag.map((item) => {
          const length = categoryTotal
            ? (item.amountMinor / categoryTotal) * circleLength
            : 0;
          const segment = { ...item, length, offset: categoryOffset };
          categoryOffset += length;
          return segment;
        });
        return (
          <YStack gap={22}>
            <XStack justifyContent="space-between" gap={12} flexWrap="wrap">
              <YStack maxWidth="100%" flexShrink={1}>
                <Heading>Your spending</Heading>
                <Label muted>See where your money goes.</Label>
              </YStack>
              <XStack gap={8} flexWrap="wrap">
                <GoalTargetButton
                  onPress={() => setGoalOpen((open) => !open)}
                />
                <Button
                  secondary
                  icon="link"
                  onPress={() => router.push("/share")}
                >
                  Share a snapshot
                </Button>
              </XStack>
            </XStack>

            {/* Analytics Dropdown Filter Triggers */}
            <XStack gap={6} alignItems="center">
              <FilterDropdownTrigger
                compact
                label={
                  custom ? "Custom" : period.toLowerCase().replace(/_/g, " ")
                }
                active={period !== "MONTH" || custom}
                onPress={() =>
                  setOpenFilter(openFilter === "period" ? null : "period")
                }
              />

              <FilterDropdownTrigger
                compact
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
                compact
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
                    width: 38,
                    height: 44,
                    paddingHorizontal: 0,
                    backgroundColor: "#FCE8E6",
                    borderRadius: 12,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Icon name="close" size={16} color="#D9381E" />
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
                    <YStack flex={1} minWidth={135}>
                      <DatePicker
                        label="Start date"
                        value={start}
                        onChange={setStart}
                      />
                    </YStack>
                    <YStack flex={1} minWidth={135}>
                      <DatePicker
                        label="End date"
                        value={end}
                        onChange={setEnd}
                      />
                    </YStack>
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
            {(goalOpen || d.goals.length > 0) && (
              <Card>
                <SectionTitle
                  title="Spending goals"
                  action="Manage all"
                  onPress={() => router.push("/goals")}
                />
                {goalOpen && (
                  <YStack marginBottom={18}>
                    <GoalCreator
                      data={d}
                      onSaved={() => setGoalOpen(false)}
                      onCancel={() => setGoalOpen(false)}
                    />
                  </YStack>
                )}
                {d.goals.map((goal) => {
                  const progress = goalProgress(
                    goal.amountMinor,
                    goal.spentMinor,
                    goal.start,
                    goal.end,
                  );
                  const elapsedShare = Math.min(
                    1,
                    Math.max(
                      0,
                      (Date.now() - Date.parse(goal.start)) /
                        (Date.parse(goal.end) - Date.parse(goal.start)),
                    ),
                  );
                  return (
                    <YStack key={goal.id} gap={8} marginTop={14}>
                      <XStack justifyContent="space-between" gap={10}>
                        <Label bold>{goal.name}</Label>
                        <Label muted size={11}>
                          {money(goal.spentMinor, goal.currency)} /{" "}
                          {money(goal.amountMinor, goal.currency)}
                        </Label>
                      </XStack>
                      <View
                        style={{
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: c.soft,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            height: 12,
                            width: `${Math.min(100, progress.percentage)}%`,
                            backgroundColor:
                              progress.percentage >= 100
                                ? "#D66169"
                                : "#8252E3",
                            borderRadius: 6,
                          }}
                        />
                        <View
                          style={{
                            position: "absolute",
                            left: `${elapsedShare * 100}%`,
                            top: 0,
                            width: 2,
                            height: 12,
                            backgroundColor: c.text,
                          }}
                        />
                      </View>
                      <Label muted size={11}>
                        {progress.remaining > 0
                          ? `${money(progress.remaining, goal.currency)} left`
                          : "Goal reached"}
                        {progress.projectedOverspend > 0
                          ? ` · projected ${money(progress.projectedOverspend, goal.currency)} over`
                          : " · on track"}
                      </Label>
                    </YStack>
                  );
                })}
                {d.goals.length > 0 && (
                  <Label muted size={10}>
                    Filled bar: spent · dark tick: expected pace today
                  </Label>
                )}
              </Card>
            )}
            <Card>
              <XStack
                justifyContent="space-between"
                gap={10}
                alignItems="center"
                flexWrap="wrap"
              >
                <YStack>
                  <Label muted>Total personal spending</Label>
                  <Heading size={36}>
                    {money(a.spendingMinor, a.currency)}
                  </Heading>
                </YStack>
                <Chip
                  selected={compare}
                  onPress={() => setCompare((value) => !value)}
                >
                  {compare ? "Comparing periods" : "Compare with previous"}
                </Chip>
              </XStack>
              {compare && (
                <Label muted size={12}>
                  Previous: {money(a.previousSpendingMinor, a.currency)}
                  {comparisonChange === null
                    ? " · no previous spending"
                    : ` · ${Math.abs(comparisonChange)}% ${comparisonChange > 0 ? "higher" : comparisonChange < 0 ? "lower" : "unchanged"}`}
                </Label>
              )}
              <XStack gap={7} flexWrap="wrap" marginTop={16}>
                {(
                  [
                    ["bars", "Daily bars"],
                    ["trend", "Trend line"],
                    ["cumulative", "Running total"],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    selected={chartView === value}
                    onPress={() => setChartView(value)}
                  >
                    {label}
                  </Chip>
                ))}
              </XStack>
              <View style={{ marginTop: 25 }}>
                <SpendingChart
                  data={d}
                  filter={filter}
                  compare={compare}
                  view={chartView}
                />
              </View>
            </Card>
            <Card>
              <SectionTitle title="Where your money went" />
              <XStack gap={7} marginBottom={16}>
                <Chip
                  selected={categoryView === "bars"}
                  onPress={() => setCategoryView("bars")}
                >
                  Bars
                </Chip>
                <Chip
                  selected={categoryView === "donut"}
                  onPress={() => setCategoryView("donut")}
                >
                  Donut
                </Chip>
              </XStack>
              {categoryView === "donut" && categoryTotal > 0 && (
                <View
                  style={{ alignItems: "center", marginBottom: 18 }}
                  accessibilityLabel={`Spending in ${a.byTag.length} categories`}
                >
                  <Svg width={180} height={180} viewBox="0 0 160 160">
                    <Circle
                      cx={80}
                      cy={80}
                      r={56}
                      fill="none"
                      stroke={c.soft}
                      strokeWidth={20}
                    />
                    {categorySegments.map((segment) => (
                      <Circle
                        key={segment.id}
                        cx={80}
                        cy={80}
                        r={56}
                        fill="none"
                        stroke={
                          d.tags.find((item) => item.id === segment.id)
                            ?.color ?? c.primary
                        }
                        strokeWidth={20}
                        strokeDasharray={`${Math.max(0, segment.length - 2)} ${circleLength}`}
                        strokeDashoffset={-segment.offset}
                        transform="rotate(-90 80 80)"
                      />
                    ))}
                    <SvgText
                      x={80}
                      y={76}
                      textAnchor="middle"
                      fill={c.text}
                      fontSize={14}
                      fontWeight="700"
                    >
                      Categories
                    </SvgText>
                    <SvgText
                      x={80}
                      y={96}
                      textAnchor="middle"
                      fill={c.muted}
                      fontSize={11}
                    >
                      {a.byTag.length} shown
                    </SvgText>
                  </Svg>
                </View>
              )}
              {a.byTag.map((t) => (
                <YStack key={t.id} gap={9} marginBottom={20}>
                  <XStack justifyContent="space-between">
                    <Label>
                      {d.tags.find((tag) => tag.id === t.id)?.name ??
                        "Uncategorized"}
                    </Label>
                    <Label bold>{money(t.amountMinor, a.currency)}</Label>
                  </XStack>
                  {categoryView === "bars" && (
                    <Progress
                      value={
                        a.spendingMinor
                          ? (t.amountMinor / a.spendingMinor) * 100
                          : 0
                      }
                      color={d.tags.find((tag) => tag.id === t.id)?.color}
                    />
                  )}
                </YStack>
              ))}
              {a.byTag.length === 0 && (
                <Label muted>No categorized spending in this period.</Label>
              )}
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
