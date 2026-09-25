import React, { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { XStack, YStack } from "tamagui";
import { useQuery } from "@tanstack/react-query";
import {
  money,
  parseMoney,
  periodRange,
  goalProgress,
  type Period,
} from "@settleup/domain";
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
export function GoalsScreen() {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [period, setPeriod] = useState<"DAY" | "WEEK" | "MONTH" | "YEAR">("MONTH"),
    [tags, setTags] = useState<string[]>([]),
    action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22}>
          <XStack justifyContent="space-between" flexWrap="wrap" gap={12}>
            <YStack>
              <Heading>Room for what matters.</Heading>
              <Label muted>
                A spending plan, with a little breathing room.
              </Label>
            </YStack>
            <Button icon="plus" onPress={() => setEditing(!editing)}>
              New goal
            </Button>
          </XStack>
          {editing && (
            <Card>
              <YStack gap={17}>
                <Field
                  label="Goal name"
                  placeholder="Fewer takeaways, more adventures"
                  value={name}
                  onChangeText={setName}
                />
                <Field
                  label={`Budget · ${d.account.currency}`}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                <XStack gap={8} flexWrap="wrap">
                  {(["DAY", "WEEK", "MONTH", "YEAR"] as const).map((p) => (
                    <Chip
                      selected={period === p}
                      key={p}
                      onPress={() => setPeriod(p)}
                    >
                      {p.toLowerCase()}
                    </Chip>
                  ))}
                </XStack>
                <Label bold>Apply to tags (leave empty for all spending)</Label>
                <XStack gap={8} flexWrap="wrap">
                  {d.tags.map((t) => (
                    <Chip
                      key={t.id}
                      selected={tags.includes(t.id)}
                      onPress={() =>
                        setTags((ts) =>
                          ts.includes(t.id)
                            ? ts.filter((id) => id !== t.id)
                            : [...ts, t.id],
                        )
                      }
                    >
                      {t.name}
                    </Chip>
                  ))}
                </XStack>
                <Button
                  loading={action.busy}
                  disabled={action.busy}
                  onPress={async () => {
                    if (
                      await action.run(() =>
                        repository.createGoal(d.account.id, {
                          name,
                          amountMinor: parseMoney(amount, d.account.currency),
                          currency: d.account.currency,
                          ...periodRange(period, "Asia/Kolkata"),
                          period,
                          tagIds: tags,
                          ledgerIds: [],
                          thresholds: [50, 80, 100],
                        }),
                      )
                    )
                      setEditing(false);
                  }}
                >
                  Save goal
                </Button>
              </YStack>
            </Card>
          )}
          {!!action.error && <Notice error>{action.error}</Notice>}
          {d.goals.map((g) => {
            const p = goalProgress(g.amountMinor, g.spentMinor, g.start, g.end);
            return (
              <Card key={g.id}>
                <YStack gap={16}>
                  <XStack justifyContent="space-between">
                    <Heading size={20}>{g.name}</Heading>
                    <Label
                      color={p.status === "EXCEEDED" ? "#B42332" : "#218262"}
                      size={12}
                    >
                      {p.status.toLowerCase()}
                    </Label>
                  </XStack>
                  <Label bold size={27}>
                    {money(g.spentMinor, g.currency)}{" "}
                    <Label muted size={14}>
                      of {money(g.amountMinor, g.currency)}
                    </Label>
                  </Label>
                  <Progress
                    value={p.percentage}
                    color={p.percentage >= 100 ? "#D66169" : "#8252E3"}
                  />
                  <XStack justifyContent="space-between">
                    <Label muted size={12}>
                      {p.percentage}% used · {p.daysRemaining} days left
                    </Label>
                    <Label bold size={12}>
                      {money(p.remaining, g.currency)} remaining
                    </Label>
                  </XStack>
                  {p.projectedOverspend > 0 && (
                    <Notice>
                      At this pace, projected overspend is{" "}
                      {money(p.projectedOverspend, g.currency)}. A small
                      adjustment now can help.
                    </Notice>
                  )}
                  <Label muted size={11}>
                    Reminder thresholds: {g.thresholds.join("%, ")}%.
                    Notifications require permission in Settings.
                  </Label>
                  <Button
                    secondary
                    onPress={() =>
                      action.run(
                        () =>
                          extra(
                            d.account.id,
                            `/goals/${g.id}`,
                            undefined,
                            "DELETE",
                          ),
                        "Goal removed",
                      )
                    }
                  >
                    Remove goal
                  </Button>
                </YStack>
              </Card>
            );
          })}
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
  const [phone, setPhone] = useState(""),
    [privateLink, setPrivate] = useState(false),
    [details, setDetails] = useState(false),
    [descriptions, setDescriptions] = useState(false),
    [hours, setHours] = useState("24"),
    [period, setPeriod] = useState<Period>("MONTH"),
    [ledgerIds, setLedgers] = useState<string[]>([]),
    [tagIds, setTags] = useState<string[]>([]),
    [picker, setPicker] = useState<"period" | "groups" | "tags" | null>(null),
    [result, setResult] = useState<{
      id: string;
      url: string;
      expiresAt: string;
    } | null>(null),
    action = useAction(),
    router = useRouter();
  const accountId = useSession((s) => s.activeId);
  const links = useQuery<
    { id: string; expiresAt: string; revokedAt: string | null }[]
  >({
    queryKey: ["account", accountId, "shares"],
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
                    setResult(
                      await repository.share(d.account.id, {
                        ...periodRange(period, "Asia/Kolkata"),
                        period: period as
                          "DAY" | "WEEK" | "MONTH" | "LAST_30" | "YEAR",
                        currency: d.account.currency,
                        ledgerIds,
                        tagIds,
                        includeTransactions: details,
                        showDescriptions: descriptions,
                        recipientPhone: privateLink ? phone : undefined,
                        expiresInHours: Number(hours),
                      }),
                    );
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
                        await extra(
                          d.account.id,
                          `/shares/${result.id}`,
                          undefined,
                          "DELETE",
                        );
                        setResult(null);
                        await links.refetch();
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
                    {link.revokedAt
                      ? "Revoked"
                      : Date.parse(link.expiresAt) <= Date.now()
                        ? "Expired"
                        : "Active monitoring link"}
                  </Label>
                  <Label muted size={11}>
                    Expires {new Date(link.expiresAt).toLocaleString("en-IN")}
                  </Label>
                </YStack>
                {!link.revokedAt && Date.parse(link.expiresAt) > Date.now() && (
                  <Button
                    secondary
                    compact
                    onPress={() =>
                      action.run(async () => {
                        await extra(
                          d.account.id,
                          `/shares/${link.id}`,
                          undefined,
                          "DELETE",
                        );
                        await links.refetch();
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
