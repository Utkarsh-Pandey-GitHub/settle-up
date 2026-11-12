import React, { useState } from "react";
import { XStack, YStack } from "tamagui";
import type { Dashboard, GoalView } from "@settleup/contracts";
import { currencyDigits, parseMoney, periodRange } from "@settleup/domain";
import { extra, repository } from "../data/repository";
import { useAction } from "../data/hooks";
import { Button, Chip, Field, Label, Notice } from "../components/ui";

export function GoalCreator({
  data,
  goal,
  onSaved,
  onCancel,
}: {
  data: Dashboard;
  goal?: GoalView;
  onSaved(): void;
  onCancel(): void;
}) {
  const amountInput = (value?: number | null) => {
    if (value == null) return "";
    const digits = currencyDigits(data.account.currency);
    return (value / 10 ** digits).toFixed(digits).replace(/\.00$/, "");
  };
  const [name, setName] = useState(goal?.name ?? "");
  const [daily, setDaily] = useState(
    amountInput(
      goal?.dailyLimitMinor ??
        (goal?.period === "DAY" ? goal.amountMinor : null),
    ),
  );
  const [weekly, setWeekly] = useState(
    amountInput(
      goal?.weeklyLimitMinor ??
        (goal?.period === "WEEK" ? goal.amountMinor : null),
    ),
  );
  const [monthly, setMonthly] = useState(
    amountInput(
      goal?.monthlyLimitMinor ??
        (goal && !["DAY", "WEEK"].includes(goal.period)
          ? goal.amountMinor
          : null),
    ),
  );
  const [active, setActive] = useState(goal?.active !== false);
  const [tags, setTags] = useState<string[]>(goal?.tagIds ?? []);
  const action = useAction();
  return (
    <YStack gap={14}>
      <Field
        label="Goal name"
        placeholder="Monthly essentials"
        value={name}
        onChangeText={setName}
      />
      <Label muted size={12}>
        Add any combination. Blank limits are automatically prorated from the
        broadest limit you set.
      </Label>
      <XStack gap={10} flexWrap="wrap">
        {[
          ["Daily (optional)", daily, setDaily, "—"],
          ["Weekly (optional)", weekly, setWeekly, "—"],
          ["Monthly (optional)", monthly, setMonthly, "—"],
        ].map(([label, value, setter, placeholder]) => (
          <YStack key={String(label)} flex={1} minWidth={145}>
            <Field
              label={`${label} · ${data.account.currency}`}
              placeholder={String(placeholder)}
              value={String(value)}
              onChangeText={setter as (value: string) => void}
              keyboardType="decimal-pad"
            />
          </YStack>
        ))}
      </XStack>
      <Chip selected={active} onPress={() => setActive((value) => !value)}>
        {active ? "Active goal" : "Inactive goal"}
      </Chip>
      <Label bold size={12}>
        Categories · leave empty for all spending
      </Label>
      <XStack gap={7} flexWrap="wrap">
        {data.tags
          .filter((tag) => !tag.archived)
          .map((tag) => (
            <Chip
              key={tag.id}
              selected={tags.includes(tag.id)}
              onPress={() =>
                setTags((current) =>
                  current.includes(tag.id)
                    ? current.filter((id) => id !== tag.id)
                    : [...current, tag.id],
                )
              }
            >
              {tag.name}
            </Chip>
          ))}
      </XStack>
      {!!action.error && <Notice error>{action.error}</Notice>}
      <XStack gap={8} justifyContent="flex-end" flexWrap="wrap">
        <Button secondary onPress={onCancel}>
          Cancel
        </Button>
        <Button
          loading={action.busy}
          disabled={
            action.busy ||
            !name.trim() ||
            (!daily.trim() && !weekly.trim() && !monthly.trim())
          }
          onPress={async () => {
            const dailyMinor = daily.trim()
              ? parseMoney(daily, data.account.currency)
              : null;
            const weeklyMinor = weekly.trim()
              ? parseMoney(weekly, data.account.currency)
              : null;
            const monthlyMinor = monthly.trim()
              ? parseMoney(monthly, data.account.currency)
              : null;
            const primary = monthlyMinor ?? weeklyMinor ?? dailyMinor!;
            const period: "DAY" | "WEEK" | "MONTH" = monthlyMinor
              ? "MONTH"
              : weeklyMinor
                ? "WEEK"
                : "DAY";
            const range = periodRange(period, "Asia/Kolkata");
            const input = {
              name: name.trim(),
              amountMinor: primary,
              dailyLimitMinor: dailyMinor,
              weeklyLimitMinor: weeklyMinor,
              monthlyLimitMinor: monthlyMinor,
              active,
              currency: data.account.currency,
              ...range,
              period,
              tagIds: tags,
              ledgerIds: [],
              thresholds: [50, 80, 100],
            };
            const saved = await action.run(
              () =>
                goal
                  ? extra(data.account.id, `/goals/${goal.id}`, input, "PATCH")
                  : repository.createGoal(data.account.id, input),
              goal ? "Goal updated" : "Goal created",
            );
            if (saved) onSaved();
          }}
        >
          {goal ? "Save changes" : "Save goal"}
        </Button>
      </XStack>
    </YStack>
  );
}
