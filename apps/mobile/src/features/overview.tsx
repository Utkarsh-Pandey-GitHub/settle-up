import React, { useEffect, useState } from "react";
import { Illustration, HeroBackdrop, PageHero } from "../components/illustrations";
import { DateTime } from "luxon";
import {
  View,
  Pressable,
  useWindowDimensions,
  Image,
  Modal,
  ScrollView,
} from "react-native";
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
  goalCadenceLimits,
  type Period,
} from "@settleup/domain";
import { useDashboard, useAction } from "../data/hooks";
import { repository, extra } from "../data/repository";
import { useSession } from "../data/session";
import { personName } from "../data/people";
import { TourGroup } from "../components/WalkthroughTour";
import { Shell } from "../components/Shell";
import { DatePicker } from "../components/DateTimePicker";
import {
  Label,
  Field,
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
function greeting(at = new Date()) {
  const hour = Number(
    at.toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }),
  );
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
function balanceInsight(receivable: number, owed: number, currency: string) {
  const net = receivable - owed;
  if (!receivable && !owed) return "You’re all settled up";
  const amount = money(Math.abs(net), currency).replace(/\.00$/, "");
  return net > 0
    ? `${amount} net to collect`
    : net < 0
      ? `${amount} net to pay back`
      : "Your balances cancel out";
}
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
      marginBottom={4}
    >
      <Heading size={17}>{title}</Heading>
      {!!action && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Label size={13} color="#4F46E5" bold>
            {action}
          </Label>
        </Pressable>
      )}
    </XStack>
  );
}
const titleIcon = (title: string): IconName | null => {
  const t = title.toLowerCase();
  if (/uber|ola|rapido|cab|taxi|auto|metro|fuel|petrol|diesel|parking|toll|bus|train/.test(t)) return "car";
  if (/flight|air|indigo|vistara|hotel|stay|trip|travel|airbnb|booking/.test(t)) return "plane";
  if (/swiggy|zomato|food|dinner|lunch|breakfast|cafe|coffee|tea|chai|pizza|burger|restaurant|starbucks|snack|drinks?|bar\b/.test(t)) return "coffee";
  if (/rent|maintenance|society|flat|house|home/.test(t)) return "home";
  if (/electric|power|bill|wifi|internet|broadband|recharge|mobile|jio|airtel|gas|water/.test(t)) return "bolt";
  if (/amazon|flipkart|myntra|grocer|blinkit|zepto|bigbasket|shopping|mart|store|clothes/.test(t)) return "bag";
  return null;
};
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
  previousOccurredAt,
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
  previousOccurredAt?: string;
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
    "coffee",
    "car",
    "plane",
    "bolt",
    "wallet",
    "home",
  ].includes(t.icon ?? "")
    ? (t.icon as IconName)
    : null;
  // Real records are often untagged; infer a sensible icon from the title so
  // they look as clear as categorised ones.
  const inferredIcon = titleIcon(t.title);
  const rowIcon: IconName | null =
    t.type === "SETTLEMENT" || t.type === "LOAN_REPAYMENT"
      ? "check"
      : t.type === "LOAN"
        ? "wallet"
        : t.type === "ADJUSTMENT"
          ? "down"
          : (storedIcon ??
            (tag ? categoryIcon(tag.name) : null) ??
            inferredIcon ??
            (t.icon === "bag" ? "bag" : null));
  const typeLabel: Record<string, string> = {
    PERSONAL_EXPENSE: "Personal",
    SHARED_EXPENSE: "Split",
    LOAN: "Loan",
    LOAN_REPAYMENT: "Loan repayment",
    SETTLEMENT: "Settlement",
    ADJUSTMENT: "Income",
    REVERSAL: "Reversal",
  };
  const occurred = DateTime.fromISO(t.occurredAt).setZone("Asia/Kolkata");
  const previous = previousOccurredAt
    ? DateTime.fromISO(previousOccurredAt).setZone("Asia/Kolkata")
    : null;
  const startsMonth =
    !previous || occurred.toFormat("yyyy-MM") !== previous.toFormat("yyyy-MM");
  return (
    <YStack>
      {startsMonth && (
        <XStack
          alignItems="center"
          gap={10}
          paddingHorizontal={8}
          paddingTop={8}
          paddingBottom={3}
        >
          <Label muted size={10} bold>
            {occurred.toFormat("LLLL yyyy").toUpperCase()}
          </Label>
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        </XStack>
      )}
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
              borderColor: selected ? "#4338CA" : c.muted,
              backgroundColor: selected ? "#4338CA" : "transparent",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {selected && <Icon name="check" size={14} color="#FFFFFF" />}
          </View>
        )}
        <YStack
          width={28}
          alignItems="center"
          gap={0}
          flexShrink={0}
          marginRight={narrow ? -3 : -7}
        >
          <Label muted size={9} bold>
            {occurred.toFormat("LLL").toUpperCase()}
          </Label>
          <Label size={14} bold>
            {occurred.toFormat("dd")}
          </Label>
        </YStack>
        <View
          style={{
            height: narrow ? 34 : 43,
            width: narrow ? 34 : 43,
            borderRadius: 13,
            backgroundColor: tag?.color
              ? `${tag.color}1F`
              : t.type === "SETTLEMENT" || t.type === "ADJUSTMENT"
                ? c.mint
                : c.accentSoft,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {rowIcon ? (
            <Icon
              name={rowIcon}
              color={
                t.type === "SETTLEMENT" || t.type === "ADJUSTMENT"
                  ? c.positive
                  : tag?.color ?? c.accent
              }
              size={20}
            />
          ) : (
            <Label bold size={17} color={c.accent}>
              {(t.icon && t.icon.length <= 2 ? t.icon : t.title.slice(0, 1)).toUpperCase()}
            </Label>
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
              {tag?.name ?? typeLabel[t.type] ?? "Expense"}
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
            <Icon name="edit" size={15} color="#4338CA" />
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
            color={incoming ? c.positive : c.text}
          >
            {cashSign}
            {money(t.amountMinor, t.currency)}
          </Label>
        </YStack>
      </Pressable>
    </YStack>
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
                fill="#A5B4FC"
                opacity={0.12}
              />
            )}
            <Path
              d={linePath(currentValues)}
              fill="none"
              stroke="#4F46E5"
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
                fill="#4F46E5"
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
                    fill={i === days.length - 1 ? "#4F46E5" : "#A5B4FC"}
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

type AnalyticsChartRange = {
  id: string;
  label: string;
  filter: AnalyticsFilter;
};

const analyticsSeriesColors = [
  "#4F46E5",
  "#218262",
  "#D07A22",
  "#C2546E",
  "#3F78A8",
];

function CompactChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: 7,
        borderBottomWidth: 2,
        borderBottomColor: selected ? c.primary : "transparent",
      }}
    >
      <Label size={12} color={selected ? c.primary : c.muted}>
        {label}
      </Label>
    </Pressable>
  );
}

function MiniPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 30,
        justifyContent: "center",
        paddingHorizontal: 9,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.line,
        backgroundColor: selected ? c.soft : "transparent",
      }}
    >
      <Label size={11} color={selected ? c.primary : c.muted}>
        {label}
      </Label>
    </Pressable>
  );
}

function AnalyticsAction({
  icon,
  label,
  accessibilityLabel = label,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress(): void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 34,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        paddingHorizontal: 7,
        borderRadius: 8,
        backgroundColor: pressed ? c.soft : "transparent",
      })}
    >
      <Icon name={icon} size={15} color={c.primary} />
      <Label size={11}>{label}</Label>
    </Pressable>
  );
}

function ComparisonSpendingChart({
  data,
  ranges,
  view,
  showGoals,
}: {
  data: Dashboard;
  ranges: AnalyticsChartRange[];
  view: "bars" | "trend" | "cumulative";
  showGoals: boolean;
}) {
  const c = useColors();
  const [selected, setSelected] = useState<{
    label: string;
    date: string;
    amount: number;
  } | null>(null);
  const fillDays = (range: AnalyticsChartRange) => {
    const zone = range.filter.zone ?? "Asia/Kolkata";
    const first = DateTime.fromISO(range.filter.start, { zone }).startOf("day");
    const last = DateTime.fromISO(range.filter.end, { zone })
      .minus({ milliseconds: 1 })
      .startOf("day");
    const spending = new Map(
      analytics(data, range.filter).byDay.map((day) => [
        day.date,
        day.amountMinor,
      ]),
    );
    const days: { date: string; amountMinor: number }[] = [];
    for (let day = first; day <= last; day = day.plus({ days: 1 }))
      days.push({
        date: day.toISODate()!,
        amountMinor: spending.get(day.toISODate()!) ?? 0,
      });
    return days;
  };
  const series = ranges.map((range, rangeIndex) => {
    const days = fillDays(range);
    let running = 0;
    return {
      ...range,
      color: analyticsSeriesColors[rangeIndex],
      days,
      values: days.map((day) => {
        running += day.amountMinor;
        return view === "cumulative" ? running : day.amountMinor;
      }),
      categories: analytics(data, range.filter).byTag,
    };
  });
  const slots = Math.max(1, ...series.map((entry) => entry.days.length));
  const alignedDates = series.every(
    (entry) => entry.days[0]?.date === series[0]?.days[0]?.date,
  );
  const activeGoals = showGoals
    ? data.goals.filter((goal) => goal.active !== false).slice(0, 3)
    : [];
  const goalValues = activeGoals.map((goal) => {
    const daily = goalCadenceLimits(goal).daily;
    return view === "cumulative" ? daily * slots : daily;
  });
  const max = Math.max(
    100,
    ...series.flatMap((entry) => entry.values),
    ...goalValues,
  );
  const plotWidth = Math.max(520, slots * (view === "bars" ? 42 : 34));
  const left = 68;
  const right = 24;
  const usable = plotWidth - left - right;
  const pointX = (index: number) =>
    left + index * (usable / Math.max(slots - 1, 1));
  const pointY = (value: number) => 150 - (value / max) * 118;
  const path = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${index ? "L" : "M"}${pointX(index)},${pointY(value)}`,
      )
      .join(" ");
  return (
    <YStack gap={12}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <Svg width={plotWidth} height={205} viewBox={`0 0 ${plotWidth} 205`}>
          {[0, 0.5, 1].map((ratio) => (
            <React.Fragment key={ratio}>
              <Line
                x1={left}
                y1={pointY(max * ratio)}
                x2={plotWidth - right}
                y2={pointY(max * ratio)}
                stroke={c.line}
                strokeDasharray="4,6"
              />
              <SvgText
                x={0}
                y={pointY(max * ratio) + 4}
                fill={c.muted}
                fontSize={11}
              >
                {money(
                  Math.round(max * ratio),
                  ranges[0].filter.currency,
                ).replace(".00", "")}
              </SvgText>
            </React.Fragment>
          ))}
          {activeGoals.map((goal, index) => {
            const daily = goalCadenceLimits(goal).daily;
            const value = view === "cumulative" ? daily * slots : daily;
            return (
              <React.Fragment key={goal.id}>
                <Line
                  x1={left}
                  y1={pointY(value)}
                  x2={plotWidth - right}
                  y2={pointY(value)}
                  stroke={analyticsSeriesColors[(index + 2) % 5]}
                  strokeWidth={2}
                  strokeDasharray="8,5"
                />
                <SvgText
                  x={left + 4}
                  y={Math.max(12, pointY(value) - 5)}
                  fill={analyticsSeriesColors[(index + 2) % 5]}
                  fontSize={10}
                >
                  {goal.name} goal
                </SvgText>
              </React.Fragment>
            );
          })}
          {series.map((entry, rangeIndex) =>
            view === "bars" ? (
              entry.values.map((value, index) => {
                const groupWidth = Math.min(34, usable / slots - 4);
                const width = Math.max(3, groupWidth / series.length);
                const x = pointX(index) - groupWidth / 2 + rangeIndex * width;
                return (
                  <Rect
                    key={`${entry.id}-${index}`}
                    x={x}
                    y={pointY(value)}
                    width={width - 1}
                    height={Math.max(1, 150 - pointY(value))}
                    rx={3}
                    fill={entry.color}
                    onPress={() =>
                      setSelected({
                        label: entry.label,
                        date: entry.days[index].date,
                        amount: value,
                      })
                    }
                  />
                );
              })
            ) : (
              <React.Fragment key={entry.id}>
                <Path
                  d={path(entry.values)}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {entry.values.map((value, index) => (
                  <Circle
                    key={`${entry.id}-${index}`}
                    cx={pointX(index)}
                    cy={pointY(value)}
                    r={selected?.date === entry.days[index].date ? 7 : 5}
                    fill={entry.color}
                    stroke={c.card}
                    strokeWidth={2}
                    onPress={() =>
                      setSelected({
                        label: entry.label,
                        date: entry.days[index].date,
                        amount: value,
                      })
                    }
                  />
                ))}
              </React.Fragment>
            ),
          )}
          {Array.from({ length: slots }, (_, index) =>
            index % Math.max(1, Math.ceil(slots / 10)) === 0 ? (
              <SvgText
                key={index}
                x={pointX(index)}
                y={178}
                textAnchor="middle"
                fill={c.muted}
                fontSize={11}
              >
                {alignedDates
                  ? DateTime.fromISO(
                      series[0]?.days[index]?.date ?? "",
                    ).toFormat("d LLL")
                  : `Day ${index + 1}`}
              </SvgText>
            ) : null,
          )}
        </Svg>
      </ScrollView>
      <XStack gap={12} flexWrap="wrap">
        {series.map((entry) => (
          <XStack key={entry.id} gap={6} alignItems="center">
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: entry.color,
              }}
            />
            <Label size={11}>{entry.label}</Label>
          </XStack>
        ))}
      </XStack>
      {selected && (
        <Label bold size={12}>
          {selected.label} · {selected.date} ·{" "}
          {money(selected.amount, ranges[0].filter.currency)}
        </Label>
      )}
      {view === "bars" && (
        <YStack gap={8}>
          <Label bold size={12}>
            Category subdivision by duration
          </Label>
          {series.map((entry) => {
            const total = entry.categories.reduce(
              (sum, category) => sum + category.amountMinor,
              0,
            );
            return (
              <YStack key={entry.id} gap={5}>
                <Label muted size={11}>
                  {entry.label}
                </Label>
                <XStack height={14} borderRadius={7} overflow="hidden">
                  {entry.categories.map((category) => (
                    <View
                      key={category.id}
                      accessibilityLabel={`${data.tags.find((tag) => tag.id === category.id)?.name ?? "Uncategorized"}: ${money(category.amountMinor, ranges[0].filter.currency)}`}
                      style={{
                        flex: total ? category.amountMinor / total : 0,
                        minWidth: category.amountMinor ? 3 : 0,
                        backgroundColor:
                          data.tags.find((tag) => tag.id === category.id)
                            ?.color ?? c.primary,
                      }}
                    />
                  ))}
                </XStack>
              </YStack>
            );
          })}
        </YStack>
      )}
    </YStack>
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
    <YStack gap={16} maxWidth={1050} width="100%" alignSelf="center">
      <View
        style={{
          borderRadius: 20,
          overflow: "hidden",
          padding: width < 360 ? 18 : 22,
          backgroundColor: "#4338CA",
        }}
      >
        <HeroBackdrop />
        <YStack gap={18}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.45)",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Label bold size={13} color="#FFFFFF">
                {d.account.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </Label>
            </View>
            <YStack flex={1} minWidth={0}>
              <Label bold size={15} color="#FFFFFF" numberOfLines={1}>
                {greeting()}, {d.account.name.split(" ")[0]}
              </Label>
              <Label size={12} color="rgba(224,231,255,0.85)" numberOfLines={1}>
                {balanceInsight(stats.receivableMinor, stats.owedMinor, d.account.currency)}
              </Label>
            </YStack>
          </Pressable>
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.14)" }} />
          <XStack alignItems="center" gap={12}>
          <YStack gap={4} flex={1} minWidth={0}>
            <Label size={13} color="rgba(255,255,255,0.75)">
              Spent this month
            </Label>
            <Label
              bold
              color="#FFFFFF"
              size={width > 600 ? 40 : compactSummary ? 30 : 34}
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
          <Label size={11} bold color="rgba(224,231,255,0.85)">
            {new Date().toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}
          </Label>
          </XStack>
          <XStack gap={10}>
            {(
              [
                {
                  key: "owed",
                  label: "Owed to you",
                  amount: stats.receivableMinor,
                  color: "#A7F3D0",
                  a11y: "View who owes you.",
                },
                {
                  key: "pay",
                  label: "You owe",
                  amount: stats.owedMinor,
                  color: "#FECACA",
                  a11y: "View debts to pay.",
                },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}: ${money(item.amount, d.account.currency)}. ${item.a11y}`}
                onPress={() =>
                  router.push({ pathname: "/settle", params: { view: item.key } })
                }
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  minHeight: 44,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: pressed
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(255,255,255,0.12)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.16)",
                  gap: 2,
                })}
              >
                <XStack alignItems="center" justifyContent="space-between">
                  <Label size={12} color="rgba(255,255,255,0.75)">
                    {item.label}
                  </Label>
                  <Icon name="chevron" size={12} color="rgba(255,255,255,0.75)" />
                </XStack>
                <Label
                  bold
                  size={width > 600 ? 20 : 17}
                  color={item.amount ? item.color : "#FFFFFF"}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {money(item.amount, d.account.currency).replace(".00", "")}
                </Label>
              </Pressable>
            ))}
          </XStack>
        </YStack>
      </View>
      <TourGroup step={2} padding={4}>
        <XStack gap={width < 360 ? 8 : 12} flexWrap="wrap">
          {(
            [
              {
                label: "Add transaction",
                short: "Add expense",
                icon: "plus",
                path: "/add",
                color: "accent",
              },
              {
                label: "Create group",
                short: "New group",
                icon: "groups",
                path: "/groups",
                color: "accent",
              },
              {
                label: "Scan a bill",
                short: "Scan bill",
                icon: "camera",
                path: "/add?bill=camera",
                color: "accent",
              },
            ] as const
          ).map((tile) => (
            <View key={tile.label} style={{ flex: 1, minWidth: 0 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tile.label}
                onPress={() => go(tile.path)}
                style={({ pressed }) => ({
                  width: "100%",
                  minHeight: 88,
                  paddingVertical: 14,
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: pressed ? c.soft : c.card,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.line,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.accentSoft,
                  }}
                >
                  <Icon name={tile.icon} color={c.accent} size={20} />
                </View>
                <Label
                  color={c.text}
                  size={width < 360 ? 11 : 13}
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
        {(() => {
          const rows = d.transactions
            .filter(
              (transaction) =>
                transaction.type !== "PERSONAL_EXPENSE" ||
                transaction.sourceId === d.account.id,
            )
            .slice(0, visibleRows);
          return rows.length ? (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.line,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              {rows.map((t, index) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  data={d}
                  previousOccurredAt={rows[index - 1]?.occurredAt}
                  last={index === rows.length - 1}
                  compact
                />
              ))}
            </View>
          ) : null;
        })()}
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
                      <Label size={12} color="#4338CA" bold>
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
                    <Label size={12} color="#4338CA" bold>
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
                backgroundColor="#4338CA"
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
                  previousOccurredAt={displayed[index - 1]?.occurredAt}
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
      params.period === "MONTH" ? "MONTH" : "WEEK",
    ),
    [tagIds, setTagIds] = useState<string[]>([]),
    [ledgerIds, setLedgerIds] = useState<string[]>([]),
    [custom, setCustom] = useState(!params.period),
    [start, setStart] = useState(() =>
      DateTime.now().setZone("Asia/Kolkata").minus({ days: 6 }).toISODate()!,
    ),
    [end, setEnd] = useState(() =>
      DateTime.now().setZone("Asia/Kolkata").toISODate()!,
    ),
    [chartView, setChartView] = useState<"bars" | "trend" | "cumulative">(
      "bars",
    ),
    [categoryView, setCategoryView] = useState<"bars" | "donut">("donut"),
    [showGoals, setShowGoals] = useState(true),
    [filtersOpen, setFiltersOpen] = useState(false),
    [comparisons, setComparisons] = useState<
      { id: string; label: string; start: string; end: string }[]
    >([]),
    router = useRouter();
  const resetAnalyticsFilters = () => {
    const now = DateTime.now().setZone("Asia/Kolkata");
    setPeriod("WEEK");
    setCustom(true);
    setStart(now.minus({ days: 6 }).toISODate()!);
    setEnd(now.toISODate()!);
    setTagIds([]);
    setLedgerIds([]);
    setComparisons([]);
    setShowGoals(true);
  };
  useEffect(() => {
    if (params.period === "WEEK" || params.period === "MONTH") {
      setPeriod(params.period);
      setCustom(false);
      setTagIds([]);
      setLedgerIds([]);
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
          tagIds,
          ledgerIds,
        };
        const primaryDurationDays = Math.max(
          1,
          Math.round(
            DateTime.fromISO(filter.end)
              .setZone("Asia/Kolkata")
              .diff(
                DateTime.fromISO(filter.start).setZone("Asia/Kolkata"),
                "days",
              ).days,
          ),
        );
        const a = analytics(d, filter);
        const chartRanges: AnalyticsChartRange[] = [
          {
            id: "current",
            label: custom ? `${start} – ${end}` : period.toLowerCase(),
            filter,
          },
          ...comparisons.flatMap((comparison) => {
            const comparisonStart = DateTime.fromISO(comparison.start, {
              zone: "Asia/Kolkata",
            }).startOf("day");
            const comparisonEnd = comparisonStart.plus({
              days: primaryDurationDays,
            });
            return comparisonStart.isValid
              ? [
                  {
                    id: comparison.id,
                    label: comparison.label,
                    filter: {
                      start: comparisonStart.toUTC().toISO()!,
                      end: comparisonEnd.toUTC().toISO()!,
                      currency: d.account.currency,
                      tagIds,
                      ledgerIds,
                    },
                  },
                ]
              : [];
          }),
        ];
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
          <YStack gap={18}>
            <YStack gap={7}>
              <PageHero
                eyebrow="Analytics"
                title="Your spending"
                subtitle="See where your money goes."
              />
              <XStack gap={2} justifyContent="flex-end">
                <AnalyticsAction
                  icon="goal"
                  label="Goals"
                  onPress={() => router.push("/goals")}
                />
                <AnalyticsAction
                  icon="link"
                  label="Snapshot"
                  accessibilityLabel="Share a snapshot"
                  onPress={() =>
                    router.push({
                      pathname: "/share",
                      params: {
                        analyticsConfig: JSON.stringify({
                          ranges: chartRanges.map((range) => ({
                            label: range.label,
                            start: range.filter.start,
                            end: range.filter.end,
                          })),
                          tagIds,
                          ledgerIds,
                          includeGoals: showGoals,
                        }),
                      },
                    })
                  }
                />
                <AnalyticsAction
                  icon="filter"
                  label="Filters"
                  onPress={() => setFiltersOpen(true)}
                />
              </XStack>
            </YStack>

            <Modal
              visible={filtersOpen}
              transparent
              animationType="slide"
              statusBarTranslucent
              onRequestClose={() => setFiltersOpen(false)}
            >
              <View
                style={{
                  flex: 1,
                  justifyContent: "flex-end",
                  backgroundColor: "rgba(22,24,28,0.42)",
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close analytics filters"
                  onPress={() => setFiltersOpen(false)}
                  style={{ position: "absolute", inset: 0 }}
                />
                <View
                  style={{
                    maxHeight: "88%",
                    backgroundColor: c.card,
                    borderTopLeftRadius: 26,
                    borderTopRightRadius: 26,
                    paddingTop: 10,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: c.line,
                      alignSelf: "center",
                      marginBottom: 8,
                    }}
                  />
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ padding: 18, gap: 18 }}
                  >
                    <XStack justifyContent="space-between" alignItems="center">
                      <YStack gap={3} flex={1}>
                        <Heading size={21}>Analytics filters</Heading>
                        <Label muted size={12}>
                          Compare the same duration across up to five dates.
                        </Label>
                      </YStack>
                      <XStack gap={6}>
                        <Button
                          secondary
                          compact
                          onPress={resetAnalyticsFilters}
                        >
                          Reset
                        </Button>
                        <Button compact onPress={() => setFiltersOpen(false)}>
                          Done
                        </Button>
                      </XStack>
                    </XStack>
                    <YStack gap={10}>
                      <Label bold>Primary duration</Label>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 5 }}
                      >
                        <CompactChoice
                          label="7 days"
                          selected={custom}
                          onPress={() => {
                            const now = DateTime.now().setZone("Asia/Kolkata");
                            setCustom(true);
                            setStart(now.minus({ days: 6 }).toISODate()!);
                            setEnd(now.toISODate()!);
                          }}
                        />
                        {(
                          [
                            ["WEEK", "Week"],
                            ["MONTH", "Month"],
                            ["LAST_30", "30 days"],
                            ["YEAR", "Year"],
                          ] as [Period, string][]
                        ).map(([value, label]) => (
                          <CompactChoice
                            key={value}
                            label={label}
                            selected={!custom && period === value}
                            onPress={() => {
                              setPeriod(value);
                              setCustom(false);
                            }}
                          />
                        ))}
                      </ScrollView>
                      {custom && (
                        <XStack gap={10} flexWrap="wrap">
                          <YStack flex={1} minWidth={145}>
                            <DatePicker
                              label="Start date"
                              value={start}
                              onChange={setStart}
                            />
                          </YStack>
                          <YStack flex={1} minWidth={145}>
                            <DatePicker
                              label="End date"
                              value={end}
                              onChange={setEnd}
                            />
                          </YStack>
                        </XStack>
                      )}
                    </YStack>
                    <YStack gap={10}>
                      <XStack
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Label bold>Comparison durations</Label>
                        <Label muted size={11}>
                          {comparisons.length + 1}/5
                        </Label>
                      </XStack>
                      {comparisons.map((comparison) => (
                        <YStack
                          key={comparison.id}
                          gap={10}
                          padding={12}
                          borderRadius={16}
                          backgroundColor={c.soft}
                        >
                          <XStack gap={8} alignItems="center">
                            <View style={{ flex: 1 }}>
                              <Field
                                label="Duration label"
                                value={comparison.label}
                                onChangeText={(label) =>
                                  setComparisons((current) =>
                                    current.map((entry) =>
                                      entry.id === comparison.id
                                        ? { ...entry, label }
                                        : entry,
                                    ),
                                  )
                                }
                              />
                            </View>
                            <Button
                              secondary
                              compact
                              onPress={() =>
                                setComparisons((current) =>
                                  current.filter(
                                    (entry) => entry.id !== comparison.id,
                                  ),
                                )
                              }
                            >
                              Remove
                            </Button>
                          </XStack>
                          <DatePicker
                            label="Start date"
                            value={comparison.start}
                            onChange={(value) =>
                              setComparisons((current) =>
                                current.map((entry) =>
                                  entry.id === comparison.id
                                    ? { ...entry, start: value }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <Label muted size={11}>
                            Same {primaryDurationDays}-day duration · ends{" "}
                            {DateTime.fromISO(comparison.start)
                              .plus({ days: primaryDurationDays - 1 })
                              .toFormat("d LLL yyyy")}
                          </Label>
                        </YStack>
                      ))}
                      <Button
                        secondary
                        icon="plus"
                        disabled={comparisons.length >= 4}
                        onPress={() => {
                          const offset =
                            (comparisons.length + 1) * primaryDurationDays;
                          const now = DateTime.now()
                            .setZone("Asia/Kolkata")
                            .minus({ days: offset });
                          setComparisons((current) => [
                            ...current,
                            {
                              id: `${Date.now()}-${current.length}`,
                              label: `Duration ${current.length + 2}`,
                              start: now
                                .minus({ days: primaryDurationDays - 1 })
                                .toISODate()!,
                              end: now.toISODate()!,
                            },
                          ]);
                        }}
                      >
                        Add comparison duration
                      </Button>
                    </YStack>
                    <YStack gap={10}>
                      <Label bold>Categories (add multiple)</Label>
                      <XStack gap={7} flexWrap="wrap">
                        <MiniPill
                          label="All"
                          selected={!tagIds.length}
                          onPress={() => setTagIds([])}
                        />
                        {d.tags
                          .filter((entry) => !entry.archived)
                          .map((entry) => (
                            <MiniPill
                              key={entry.id}
                              label={entry.name}
                              selected={tagIds.includes(entry.id)}
                              onPress={() =>
                                setTagIds((current) =>
                                  current.includes(entry.id)
                                    ? current.filter((id) => id !== entry.id)
                                    : [...current, entry.id],
                                )
                              }
                            />
                          ))}
                      </XStack>
                    </YStack>
                    <YStack gap={10}>
                      <Label bold>Groups (add multiple)</Label>
                      <XStack gap={7} flexWrap="wrap">
                        <MiniPill
                          label="All"
                          selected={!ledgerIds.length}
                          onPress={() => setLedgerIds([])}
                        />
                        {d.ledgers
                          .filter((entry) => !entry.deleted)
                          .map((entry) => (
                            <MiniPill
                              key={entry.id}
                              label={entry.name}
                              selected={ledgerIds.includes(entry.id)}
                              onPress={() =>
                                setLedgerIds((current) =>
                                  current.includes(entry.id)
                                    ? current.filter((id) => id !== entry.id)
                                    : [...current, entry.id],
                                )
                              }
                            />
                          ))}
                      </XStack>
                    </YStack>
                    <Button onPress={() => setFiltersOpen(false)}>Done</Button>
                  </ScrollView>
                </View>
              </View>
            </Modal>

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
                <Label muted size={12}>
                  {chartRanges.length} duration
                  {chartRanges.length === 1 ? "" : "s"} shown
                </Label>
              </XStack>
              <XStack gap={7} flexWrap="wrap" marginTop={16}>
                {(
                  [
                    ["bars", "Daily bars"],
                    ["trend", "Trend line"],
                    ["cumulative", "Running total"],
                  ] as const
                ).map(([value, label]) => (
                  <CompactChoice
                    key={value}
                    label={label}
                    selected={chartView === value}
                    onPress={() => setChartView(value)}
                  />
                ))}
              </XStack>
              <View style={{ marginTop: 25 }}>
                <ComparisonSpendingChart
                  data={d}
                  ranges={chartRanges}
                  view={chartView}
                  showGoals={showGoals}
                />
              </View>
            </Card>
            <Card>
              <SectionTitle title="Where your money went" />
              <XStack gap={7} marginBottom={16}>
                <CompactChoice
                  label="Bars"
                  selected={categoryView === "bars"}
                  onPress={() => setCategoryView("bars")}
                />
                <CompactChoice
                  label="Donut"
                  selected={categoryView === "donut"}
                  onPress={() => setCategoryView("donut")}
                />
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
