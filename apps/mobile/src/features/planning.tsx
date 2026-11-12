import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { XStack, YStack } from "tamagui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  money,
  periodRange,
  goalProgress,
  goalCadenceLimits,
  type Period,
} from "@settleup/domain";
import { analytics } from "@settleup/domain/src/analytics";
import { DataScreen, SectionTitle } from "./overview";
import {
  Card,
  Heading,
  Label,
  Field,
  Button,
  Chip,
  Notice,
  Progress,
  Skeleton,
  SearchPicker,
  Icon,
  IconButton,
} from "../components/ui";
import { repository, extra, sharedSnapshot } from "../data/repository";
import { useAction } from "../data/hooks";
import { DEMO, useSession } from "../data/session";
import { Shell } from "../components/Shell";
import { copyText } from "../../modules/home-widgets/client";
import { GoalCreator } from "./goal-form";
export function GoalsScreen() {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={18}>
          <XStack justifyContent="space-between" alignItems="center" gap={12}>
            <YStack flex={1} gap={3}>
              <Heading>Spending goals</Heading>
              <Label muted>
                Daily, weekly, and monthly limits in one place.
              </Label>
            </YStack>
            <Button icon="plus" compact onPress={() => setCreating(true)}>
              Add
            </Button>
          </XStack>
          {creating && (
            <Card>
              <GoalCreator
                data={d}
                onSaved={() => setCreating(false)}
                onCancel={() => setCreating(false)}
              />
            </Card>
          )}
          {!!action.error && <Notice error>{action.error}</Notice>}
          <YStack gap={8}>
            {d.goals.map((g) => {
              const expanded = selectedId === g.id;
              const limits = goalCadenceLimits(g);
              const cadence = (
                [
                  ["Daily", "DAY", limits.daily, limits.explicit.daily],
                  ["Weekly", "WEEK", limits.weekly, limits.explicit.weekly],
                  ["Monthly", "MONTH", limits.monthly, limits.explicit.monthly],
                ] as const
              ).map(([label, period, limit, explicit]) => ({
                label,
                limit,
                explicit,
                spent: analytics(d, {
                  ...periodRange(period, "Asia/Kolkata"),
                  currency: g.currency,
                  tagIds: g.tagIds,
                  ledgerIds: g.ledgerIds,
                }).spendingMinor,
              }));
              const exceeded = cadence.some((item) => item.spent > item.limit);
              return (
                <Card key={g.id} style={{ padding: 12 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => {
                      setEditingId(null);
                      setSelectedId(expanded ? null : g.id);
                    }}
                    style={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <XStack alignItems="center" gap={10}>
                      <YStack flex={1} minWidth={0} gap={2}>
                        <Label bold numberOfLines={1}>
                          {g.name}
                        </Label>
                        <Label muted size={11} numberOfLines={1}>
                          {g.active === false
                            ? "Inactive"
                            : exceeded
                              ? "Limit exceeded"
                              : "On track"}{" "}
                          · {money(limits.monthly, g.currency)} monthly
                        </Label>
                      </YStack>
                      <Icon name={expanded ? "up" : "down"} size={16} />
                    </XStack>
                  </Pressable>
                  {expanded && (
                    <YStack gap={12} paddingTop={12}>
                      {editingId === g.id ? (
                        <GoalCreator
                          key={g.id}
                          data={d}
                          goal={g}
                          onSaved={() => setEditingId(null)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                          {cadence.map((item) => (
                            <XStack
                              key={item.label}
                              justifyContent="space-between"
                              gap={12}
                              paddingVertical={5}
                            >
                              <Label muted size={12}>
                                {item.label}{" "}
                                {item.explicit ? "limit" : "derived"}
                              </Label>
                              <Label
                                bold
                                size={12}
                                color={
                                  item.spent > item.limit
                                    ? "#B42332"
                                    : undefined
                                }
                              >
                                {money(item.spent, g.currency)} /{" "}
                                {money(item.limit, g.currency)}
                              </Label>
                            </XStack>
                          ))}
                          <Label muted size={11}>
                            Alerts at {g.thresholds.join("%, ")}%.
                          </Label>
                          <XStack gap={7} flexWrap="wrap">
                            <Button
                              secondary
                              compact
                              onPress={() => setEditingId(g.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              secondary
                              compact
                              onPress={() =>
                                action.run(
                                  () =>
                                    extra(
                                      d.account.id,
                                      "/goals/" + g.id,
                                      { active: g.active === false },
                                      "PATCH",
                                    ),
                                  g.active === false
                                    ? "Goal activated"
                                    : "Goal paused",
                                )
                              }
                            >
                              {g.active === false ? "Activate" : "Pause"}
                            </Button>
                            <Button
                              secondary
                              compact
                              onPress={() =>
                                action.run(
                                  () =>
                                    extra(
                                      d.account.id,
                                      "/goals/" + g.id,
                                      undefined,
                                      "DELETE",
                                    ),
                                  "Goal removed",
                                )
                              }
                            >
                              Remove
                            </Button>
                          </XStack>
                        </>
                      )}
                    </YStack>
                  )}
                </Card>
              );
            })}
            {!d.goals.length && (
              <Label muted>
                No goals yet. Add one limit to derive the rest.
              </Label>
            )}
          </YStack>
        </YStack>
      )}
    </DataScreen>
  );
}
export function TagsScreen() {
  const [name, setName] = useState(""),
    [color, setColor] = useState("#8252E3"),
    [editing, setEditing] = useState(""),
    [creating, setCreating] = useState(false),
    action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22} maxWidth={800} width="100%" alignSelf="center">
          <XStack justifyContent="space-between" alignItems="center" gap={12}>
            <YStack flex={1} gap={4}>
              <Heading>A place for every little thing.</Heading>
              <Label muted>
                Use a few meaningful tags to see your spending more clearly.
              </Label>
            </YStack>
            <IconButton
              name="plus"
              label="Create tag"
              onPress={() => {
                setEditing("");
                setName("");
                setCreating((value) => !value);
              }}
            />
          </XStack>
          {(creating || !!editing) && (
            <Card>
              <YStack gap={16}>
                <Field
                  label={editing ? "Rename tag" : "New tag name"}
                  value={name}
                  onChangeText={setName}
                />
                <XStack gap={8} flexWrap="wrap">
                  {["#8252E3", "#ECA54C", "#8994D6", "#5EB69B", "#E8898C"].map(
                    (c) => (
                      <Chip
                        key={c}
                        selected={color === c}
                        onPress={() => setColor(c)}
                      >
                        <Label color={c}>●</Label>
                      </Chip>
                    ),
                  )}
                </XStack>
                <Button
                  loading={action.busy}
                  disabled={action.busy}
                  onPress={async () => {
                    if (
                      await action.run(async () => {
                        if (!name.trim()) throw new Error("Enter a tag name.");
                        await extra(
                          d.account.id,
                          editing ? `/tags/${editing}` : "/tags",
                          { name, color },
                          editing ? "PATCH" : "POST",
                        );
                      })
                    ) {
                      setName("");
                      setEditing("");
                      setCreating(false);
                    }
                  }}
                >
                  {editing ? "Save changes" : "Create tag"}
                </Button>
                {!!action.error && <Notice error>{action.error}</Notice>}
              </YStack>
            </Card>
          )}
          {d.tags.map((t) => (
            <Card key={t.id}>
              <XStack
                justifyContent="space-between"
                alignItems="center"
                gap={12}
                flexWrap="wrap"
              >
                <Label color={t.color} bold>
                  {t.name}
                  {t.archived ? " · archived" : ""}
                </Label>
                <XStack gap={8}>
                  <Button
                    compact
                    secondary
                    onPress={() => {
                      setEditing(t.id);
                      setCreating(true);
                      setName(t.name);
                      setColor(t.color);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    compact
                    secondary
                    onPress={() =>
                      action.run(() =>
                        extra(
                          d.account.id,
                          `/tags/${t.id}`,
                          { archived: !t.archived },
                          "PATCH",
                        ),
                      )
                    }
                  >
                    {t.archived ? "Restore" : "Archive"}
                  </Button>
                </XStack>
              </XStack>
            </Card>
          ))}
        </YStack>
      )}
    </DataScreen>
  );
}
export function ShareScreen() {
  const { analyticsConfig } = useLocalSearchParams<{
    analyticsConfig?: string;
  }>();
  const preset = (() => {
    try {
      const value = analyticsConfig ? JSON.parse(analyticsConfig) : null;
      return value &&
        Array.isArray(value.ranges) &&
        value.ranges.length > 0 &&
        value.ranges.length <= 5
        ? (value as {
            ranges: { label: string; start: string; end: string }[];
            tagIds?: string[];
            ledgerIds?: string[];
            includeGoals?: boolean;
          })
        : null;
    } catch {
      return null;
    }
  })();
  const [phone, setPhone] = useState(""),
    [privateLink, setPrivate] = useState(false),
    [details, setDetails] = useState(false),
    [descriptions, setDescriptions] = useState(false),
    [hours, setHours] = useState("24"),
    [period, setPeriod] = useState<Period>("MONTH"),
    [ledgerIds, setLedgers] = useState<string[]>(() => preset?.ledgerIds ?? []),
    [tagIds, setTags] = useState<string[]>(() => preset?.tagIds ?? []),
    [picker, setPicker] = useState<"period" | "groups" | "tags" | null>(null),
    [result, setResult] = useState<{
      id: string;
      url: string;
      expiresAt: string;
    } | null>(null),
    action = useAction(),
    router = useRouter(),
    query = useQueryClient();
  const accountId = useSession((s) => s.activeId);
  const shareKey = ["account", accountId, "shares"] as const;
  const links = useQuery<
    { id: string; expiresAt: string; revokedAt: string | null }[]
  >({
    queryKey: shareKey,
    queryFn: () => extra(accountId!, "/shares"),
    enabled: !!accountId,
  });
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22} maxWidth={760} width="100%" alignSelf="center">
          <Heading>Share a trusted monitoring view.</Heading>
          <Label muted>
            Give a parent, partner, or guardian a read-only view that refreshes
            when they open it. You choose the period, records, and expiry.
          </Label>
          {preset && (
            <Notice>
              This snapshot includes {preset.ranges.length} analytics duration
              {preset.ranges.length === 1 ? "" : "s"}
              {preset.includeGoals ? ", goal lines" : ""}, and the selected
              category breakdown.
            </Notice>
          )}
          <Card>
            <YStack gap={17}>
              <Label bold>Coverage period</Label>
              <Button
                secondary
                icon="calendar"
                onPress={() => setPicker("period")}
              >
                {(
                  {
                    WEEK: "This week",
                    MONTH: "This month",
                    LAST_30: "Last 30 days",
                    YEAR: "This year",
                  } as Partial<Record<Period, string>>
                )[period] ?? "Choose period"}
              </Button>
              <Label bold>Groups</Label>
              <Button
                secondary
                icon="groups"
                onPress={() => setPicker("groups")}
              >
                {ledgerIds.length
                  ? `${ledgerIds.length} ${ledgerIds.length === 1 ? "group" : "groups"}`
                  : "All accessible groups"}
              </Button>
              <Label bold>Tags</Label>
              <Button secondary icon="bag" onPress={() => setPicker("tags")}>
                {tagIds.length
                  ? `${tagIds.length} ${tagIds.length === 1 ? "tag" : "tags"}`
                  : "All tags"}
              </Button>
              <XStack gap={8}>
                <Chip selected={!privateLink} onPress={() => setPrivate(false)}>
                  Anyone with the link
                </Chip>
                <Chip selected={privateLink} onPress={() => setPrivate(true)}>
                  Verified recipient only
                </Chip>
              </XStack>
              {privateLink && (
                <Field
                  label="Recipient phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 …"
                  keyboardType="phone-pad"
                />
              )}
              <Chip selected={details} onPress={() => setDetails(!details)}>
                {details
                  ? "Include individual transactions"
                  : "Aggregate totals only"}
              </Chip>
              {details && (
                <Chip
                  selected={descriptions}
                  onPress={() => setDescriptions(!descriptions)}
                >
                  {descriptions
                    ? "Descriptions visible"
                    : "Descriptions hidden"}
                </Chip>
              )}
              <Field
                label="Expires in hours (1–168)"
                value={hours}
                onChangeText={setHours}
                keyboardType="number-pad"
              />
              <Notice>
                {privateLink
                  ? "Recommended for family monitoring: the recipient must sign in with the exact verified number."
                  : "Anyone with the link can monitor the selected totals and transactions until it expires or you revoke it."}
              </Notice>
              {DEMO && (
                <Notice>
                  Demo shares are temporary previews on this device. Use the API
                  for secure, durable public or private links.
                </Notice>
              )}
              <Button
                loading={action.busy}
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
                    const localId = `local:${Date.now()}`;
                    const optimistic = {
                      id: localId,
                      expiresAt: new Date(
                        Date.now() + Number(hours) * 3600000,
                      ).toISOString(),
                      revokedAt: null,
                    };
                    const previous = links.data ?? [];
                    query.setQueryData(shareKey, [optimistic, ...previous]);
                    try {
                      const primary = preset?.ranges[0];
                      const created = await repository.share(d.account.id, {
                        ...(primary
                          ? { start: primary.start, end: primary.end }
                          : periodRange(period, "Asia/Kolkata")),
                        period: primary
                          ? undefined
                          : (period as
                              "DAY" | "WEEK" | "MONTH" | "LAST_30" | "YEAR"),
                        currency: d.account.currency,
                        ledgerIds,
                        tagIds,
                        includeTransactions: details,
                        showDescriptions: descriptions,
                        recipientPhone: privateLink ? phone : undefined,
                        expiresInHours: Number(hours),
                        comparisonRanges: preset?.ranges ?? [],
                        includeGoals: preset?.includeGoals ?? false,
                      });
                      setResult(created);
                      query.setQueryData(shareKey, [
                        {
                          id: created.id,
                          expiresAt: created.expiresAt,
                          revokedAt: null,
                        },
                        ...previous,
                      ]);
                    } catch (error) {
                      query.setQueryData(shareKey, previous);
                      throw error;
                    }
                  }, "Monitoring link created")
                }
              >
                Create read-only link
              </Button>
              {!!action.error && <Notice error>{action.error}</Notice>}
              {result && (
                <YStack
                  gap={13}
                  padding={14}
                  borderRadius={16}
                  backgroundColor="#F0F4F1"
                >
                  <XStack alignItems="center" gap={9}>
                    <Icon name="check" size={19} color="#3B6B5D" />
                    <Label bold>Monitoring link ready</Label>
                  </XStack>
                  <Field
                    label="Your link"
                    value={result.url}
                    editable={false}
                  />
                  <Label muted size={12}>
                    Expires {new Date(result.expiresAt).toLocaleString("en-IN")}
                  </Label>
                  <Button
                    onPress={() =>
                      action.run(() => copyText(result.url), "Link copied")
                    }
                  >
                    Copy monitoring link
                  </Button>
                  <Button
                    secondary
                    onPress={() =>
                      router.push(
                        `/shared/${result.url.split("/").pop()}` as any,
                      )
                    }
                  >
                    Preview monitoring view
                  </Button>
                  <Button
                    secondary
                    onPress={() =>
                      action.run(async () => {
                        const previous = links.data ?? [];
                        const previousResult = result;
                        const revokedAt = new Date().toISOString();
                        setResult(null);
                        query.setQueryData(
                          shareKey,
                          previous.map((link) =>
                            link.id === result.id
                              ? { ...link, revokedAt }
                              : link,
                          ),
                        );
                        try {
                          await extra(
                            d.account.id,
                            `/shares/${result.id}`,
                            undefined,
                            "DELETE",
                          );
                        } catch (error) {
                          setResult(previousResult);
                          query.setQueryData(shareKey, previous);
                          throw error;
                        }
                      }, "Monitoring link revoked")
                    }
                  >
                    Revoke this link
                  </Button>
                </YStack>
              )}
            </YStack>
          </Card>
          <Card>
            <SectionTitle title="Your shared links" />
            {links.data?.map((link) => (
              <XStack
                key={link.id}
                alignItems="center"
                justifyContent="space-between"
                gap={14}
                paddingVertical={12}
              >
                <YStack flex={1}>
                  <Label>
                    {link.id.startsWith("local:")
                      ? "Creating monitoring link…"
                      : link.revokedAt
                        ? "Revoked"
                        : Date.parse(link.expiresAt) <= Date.now()
                          ? "Expired"
                          : "Active monitoring link"}
                  </Label>
                  <Label muted size={11}>
                    Expires {new Date(link.expiresAt).toLocaleString("en-IN")}
                  </Label>
                </YStack>
                {!link.id.startsWith("local:") &&
                  !link.revokedAt &&
                  Date.parse(link.expiresAt) > Date.now() && (
                    <Button
                      secondary
                      compact
                      onPress={() =>
                        action.run(async () => {
                          const previous = links.data ?? [];
                          const revokedAt = new Date().toISOString();
                          query.setQueryData(
                            shareKey,
                            previous.map((entry) =>
                              entry.id === link.id
                                ? { ...entry, revokedAt }
                                : entry,
                            ),
                          );
                          try {
                            await extra(
                              d.account.id,
                              `/shares/${link.id}`,
                              undefined,
                              "DELETE",
                            );
                          } catch (error) {
                            query.setQueryData(shareKey, previous);
                            throw error;
                          }
                        }, "Monitoring link revoked")
                      }
                    >
                      Revoke
                    </Button>
                  )}
              </XStack>
            ))}
            {!links.data?.length && (
              <Label muted>No monitoring links shared yet.</Label>
            )}
          </Card>
          <SearchPicker
            visible={picker === "period"}
            title="Coverage period"
            options={[
              {
                id: "WEEK",
                label: "This week",
                detail: "Rolling Monday to Sunday",
              },
              {
                id: "MONTH",
                label: "This month",
                detail: "Updates through the current month",
              },
              {
                id: "LAST_30",
                label: "Last 30 days",
                detail: "Rolling thirty-day view",
              },
              {
                id: "YEAR",
                label: "This year",
                detail: "Current calendar year",
              },
            ]}
            selected={[period]}
            onSelect={(value) => setPeriod(value as Period)}
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "groups"}
            title="Groups to monitor"
            options={d.ledgers.map((ledger) => ({
              id: ledger.id,
              label: ledger.name,
              detail: `${ledger.members.length} members`,
            }))}
            selected={ledgerIds}
            multiple
            onSelect={(value) =>
              setLedgers((current) =>
                current.includes(value)
                  ? current.filter((entry) => entry !== value)
                  : [...current, value],
              )
            }
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "tags"}
            title="Tags to monitor"
            options={d.tags
              .filter((tag) => !tag.archived)
              .map((tag) => ({ id: tag.id, label: tag.name }))}
            selected={tagIds}
            multiple
            onSelect={(value) =>
              setTags((current) =>
                current.includes(value)
                  ? current.filter((entry) => entry !== value)
                  : [...current, value],
              )
            }
            onClose={() => setPicker(null)}
          />
        </YStack>
      )}
    </DataScreen>
  );
}
export function SharedScreen() {
  const { token } = useLocalSearchParams<{ token: string }>(),
    id = useSession((s) => s.activeId),
    router = useRouter();
  const q = useQuery({
    queryKey: ["account", id, "shared", token],
    queryFn: () => sharedSnapshot(token, id ?? undefined),
    retry: false,
    refetchInterval: 15000,
  });
  return (
    <Shell>
      <YStack gap={22} maxWidth={760} width="100%" alignSelf="center">
        <Heading>Trusted spending monitor</Heading>
        {q.isLoading ? (
          <YStack gap={14}>
            <Skeleton height={84} />
            <Skeleton height={210} />
          </YStack>
        ) : q.error ? (
          <>
            <Notice error>{q.error.message}</Notice>
            <Button onPress={() => router.push("/auth")}>
              Sign in to verify access
            </Button>
          </>
        ) : (
          q.data && (
            <>
              <Notice>
                Live read-only view · shared by {q.data.owner} · refreshes when
                opened
              </Notice>
              <Label muted>
                {new Date(q.data.coverage.start).toLocaleDateString()} –{" "}
                {new Date(q.data.coverage.end).toLocaleDateString()} · expires{" "}
                {new Date(q.data.expiresAt).toLocaleString()}
              </Label>
              {!!q.data.updatedAt && (
                <Label muted size={11}>
                  Last refreshed {new Date(q.data.updatedAt).toLocaleString()}
                </Label>
              )}
              <Card>
                <Label muted>Personal spending</Label>
                <Heading size={36}>
                  {money(q.data.spendingMinor, q.data.currency)}
                </Heading>
                <XStack gap={18} marginTop={16}>
                  <YStack flex={1}>
                    <Label muted size={11}>
                      This week
                    </Label>
                    <Label bold>
                      {money(q.data.weeklySpendingMinor ?? 0, q.data.currency)}
                    </Label>
                  </YStack>
                  <YStack flex={1}>
                    <Label muted size={11}>
                      This month
                    </Label>
                    <Label bold>
                      {money(q.data.monthlySpendingMinor ?? 0, q.data.currency)}
                    </Label>
                  </YStack>
                </XStack>
              </Card>
              {!!q.data.byDay?.length && (
                <Card>
                  <SectionTitle title="Daily spending" />
                  {q.data.byDay.slice(-10).map((day: any) => (
                    <XStack
                      key={day.date}
                      justifyContent="space-between"
                      paddingVertical={8}
                    >
                      <Label muted>
                        {new Date(day.date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </Label>
                      <Label bold>
                        {money(day.amountMinor, q.data.currency)}
                      </Label>
                    </XStack>
                  ))}
                </Card>
              )}
              {!!q.data.comparisons?.length && (
                <Card>
                  <SectionTitle title="Compared durations" />
                  {q.data.comparisons.map((comparison: any) => (
                    <YStack
                      key={`${comparison.label}-${comparison.start}`}
                      gap={8}
                      paddingVertical={12}
                    >
                      <XStack justifyContent="space-between" gap={12}>
                        <YStack flex={1}>
                          <Label bold>{comparison.label}</Label>
                          <Label muted size={11}>
                            {new Date(comparison.start).toLocaleDateString()} –{" "}
                            {new Date(comparison.end).toLocaleDateString()}
                          </Label>
                        </YStack>
                        <Label bold>
                          {money(comparison.spendingMinor, q.data.currency)}
                        </Label>
                      </XStack>
                      <XStack gap={4} height={44} alignItems="flex-end">
                        {comparison.byDay.map((day: any) => {
                          const maximum = Math.max(
                            1,
                            ...comparison.byDay.map(
                              (entry: any) => entry.amountMinor,
                            ),
                          );
                          return (
                            <View
                              key={day.date}
                              accessibilityLabel={`${day.date}: ${money(day.amountMinor, q.data.currency)}`}
                              style={{
                                flex: 1,
                                minWidth: 3,
                                height: `${Math.max(5, (day.amountMinor / maximum) * 100)}%`,
                                borderRadius: 3,
                                backgroundColor: "#7658B8",
                              }}
                            />
                          );
                        })}
                      </XStack>
                    </YStack>
                  ))}
                </Card>
              )}
              {!!q.data.goals?.length && (
                <Card>
                  <SectionTitle title="Active goal limits" />
                  {q.data.goals.map((goal: any) => (
                    <YStack key={goal.name} gap={6} paddingVertical={10}>
                      <Label bold>{goal.name}</Label>
                      <Label muted size={12}>
                        Daily {money(goal.daily, goal.currency)} · Weekly{" "}
                        {money(goal.weekly, goal.currency)} · Monthly{" "}
                        {money(goal.monthly, goal.currency)}
                      </Label>
                    </YStack>
                  ))}
                </Card>
              )}
              <Card>
                <SectionTitle title="Spending by category" />
                {q.data.categories.map((c: any, i: number) => (
                  <XStack
                    key={i}
                    justifyContent="space-between"
                    paddingVertical={12}
                  >
                    <Label>{c.name}</Label>
                    <Label bold>{money(c.amountMinor, q.data.currency)}</Label>
                  </XStack>
                ))}
              </Card>
              {q.data.transactions && (
                <Card>
                  {q.data.transactions.map((t: any, i: number) => (
                    <XStack
                      key={i}
                      justifyContent="space-between"
                      paddingVertical={12}
                    >
                      <Label>
                        {t.description ?? new Date(t.date).toLocaleDateString()}
                      </Label>
                      <Label>{money(t.amountMinor, q.data.currency)}</Label>
                    </XStack>
                  ))}
                </Card>
              )}
            </>
          )
        )}
      </YStack>
    </Shell>
  );
}
