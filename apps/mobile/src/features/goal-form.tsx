import React, { useState } from "react";
import { XStack, YStack } from "tamagui";
import type { Dashboard } from "@settleup/contracts";
import { parseMoney, periodRange } from "@settleup/domain";
import { repository } from "../data/repository";
import { useAction } from "../data/hooks";
import { Button, Chip, Field, Label, Notice } from "../components/ui";

export function GoalCreator({
  data,
  onSaved,
  onCancel,
}: {
  data: Dashboard;
  onSaved(): void;
  onCancel(): void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<"DAY" | "WEEK" | "MONTH" | "YEAR">(
    "MONTH",
  );
  const [tags, setTags] = useState<string[]>([]);
  const action = useAction();
  return (
    <YStack gap={14}>
      <Field
        label="Goal name"
        placeholder="Monthly essentials"
        value={name}
        onChangeText={setName}
      />
      <Field
        label={`Budget · ${data.account.currency}`}
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Label bold size={12}>
        Time period
      </Label>
      <XStack gap={7} flexWrap="wrap">
        {(["DAY", "WEEK", "MONTH", "YEAR"] as const).map((value) => (
          <Chip
            key={value}
            selected={period === value}
            onPress={() => setPeriod(value)}
          >
            {value.toLowerCase()}
          </Chip>
        ))}
      </XStack>
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
          disabled={action.busy || !name.trim() || !amount.trim()}
          onPress={async () => {
            const range = periodRange(period, "Asia/Kolkata");
            const saved = await action.run(
              () =>
                repository.createGoal(data.account.id, {
                  name: name.trim(),
                  amountMinor: parseMoney(amount, data.account.currency),
                  currency: data.account.currency,
                  ...range,
                  period,
                  tagIds: tags,
                  ledgerIds: [],
                  thresholds: [50, 80, 100],
                }),
              "Goal created",
            );
            if (saved) onSaved();
          }}
        >
          Save goal
        </Button>
      </XStack>
    </YStack>
  );
}
