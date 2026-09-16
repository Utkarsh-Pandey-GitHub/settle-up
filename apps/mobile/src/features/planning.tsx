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
} from "../components/ui";
import { repository, extra, sharedSnapshot } from "../data/repository";
import { useAction } from "../data/hooks";
import { DEMO, useSession } from "../data/session";
import { Shell } from "../components/Shell";
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
    action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22} maxWidth={800} width="100%" alignSelf="center">
          <Heading>A place for every little thing.</Heading>
          <Label muted>
            Use a few meaningful tags to see your spending more clearly.
          </Label>
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
                  }
                }}
              >
                {editing ? "Save changes" : "Create tag"}
              </Button>
              {!!action.error && <Notice error>{action.error}</Notice>}
            </YStack>
          </Card>
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
          <Heading>Share a picture. Keep control.</Heading>
          <Label muted>
            A frozen, read-only snapshot. Only what you choose, only for as long
            as you choose.
          </Label>
          <Card>
            <YStack gap={17}>
              <Label bold>Coverage period</Label>
              <XStack gap={8} flexWrap="wrap">
                {(
                  [
                    ["WEEK", "This week"],
                    ["MONTH", "This month"],
                    ["LAST_30", "Last 30 days"],
                    ["YEAR", "This year"],
                  ] as [Period, string][]
                ).map(([p, label]) => (
                  <Chip
                    selected={period === p}
                    key={p}
                    onPress={() => setPeriod(p)}
                  >
                    {label}
                  </Chip>
                ))}
              </XStack>
              <Label bold>Groups (empty means all accessible records)</Label>
              <XStack flexWrap="wrap" gap={8}>
                {d.ledgers.map((l) => (
                  <Chip
                    selected={ledgerIds.includes(l.id)}
                    key={l.id}
                    onPress={() =>
                      setLedgers((ids) =>
                        ids.includes(l.id)
                          ? ids.filter((id) => id !== l.id)
                          : [...ids, l.id],
                      )
                    }
                  >
                    {l.name}
                  </Chip>
                ))}
              </XStack>
              <Label bold>Tags (empty means all)</Label>
              <XStack gap={8} flexWrap="wrap">
                {d.tags.map((t) => (
                  <Chip
                    key={t.id}
                    selected={tagIds.includes(t.id)}
                    onPress={() =>
                      setTags((ids) =>
                        ids.includes(t.id)
                          ? ids.filter((id) => id !== t.id)
                          : [...ids, t.id],
                      )
                    }
                  >
                    {t.name}
                  </Chip>
                ))}
              </XStack>
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
                  ? "The recipient must sign in with the exact verified number. Unauthorized visitors cannot see the intended phone number."
                  : "Anyone who receives this link can view the selected snapshot until it expires or you revoke it."}
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
                        currency: d.account.currency,
                        ledgerIds,
                        tagIds,
                        includeTransactions: details,
                        showDescriptions: descriptions,
                        recipientPhone: privateLink ? phone : undefined,
                        expiresInHours: Number(hours),
                      }),
                    );
                  }, "Snapshot created")
                }
              >
                Create read-only link
              </Button>
              {!!action.error && <Notice error>{action.error}</Notice>}
              {result && (
                <YStack gap={13}>
                  <Field
                    label="Your link"
                    value={result.url}
                    editable={false}
                  />
                  <Label muted size={12}>
                    Expires {new Date(result.expiresAt).toLocaleString("en-IN")}
                  </Label>
                  <Button
                    secondary
                    onPress={() =>
                      router.push(
                        `/shared/${result.url.split("/").pop()}` as any,
                      )
                    }
                  >
                    Preview snapshot
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
                      }, "Link revoked")
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
                        : "Active snapshot"}
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
                      action.run(
                        () =>
                          extra(
                            d.account.id,
                            `/shares/${link.id}`,
                            undefined,
                            "DELETE",
                          ),
                        "Link revoked",
                      )
                    }
                  >
                    Revoke
                  </Button>
                )}
              </XStack>
            ))}
            {!links.data?.length && (
              <Label muted>No snapshots shared yet.</Label>
            )}
          </Card>
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
        <Heading>A shared little picture.</Heading>
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
              <Notice>Read-only snapshot · shared by {q.data.owner}</Notice>
              <Label muted>
                {new Date(q.data.coverage.start).toLocaleDateString()} –{" "}
                {new Date(q.data.coverage.end).toLocaleDateString()} · expires{" "}
                {new Date(q.data.expiresAt).toLocaleString()}
              </Label>
              <Card>
                <Label muted>Personal spending</Label>
                <Heading size={36}>
                  {money(q.data.spendingMinor, q.data.currency)}
                </Heading>
              </Card>
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
