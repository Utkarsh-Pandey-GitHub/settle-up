import { DEMO, useSession } from "../data/session";
import { HeroBackdrop } from "../components/illustrations";
import { PageHero } from "../components/illustrations";
import { chooseContact, chooseContacts } from "../services/device";
import { DateTime } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Switch,
  useWindowDimensions,
} from "react-native";
import { XStack, YStack } from "tamagui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Dashboard, CreateTransaction } from "@settleup/contracts";
import {
  money,
  currencyDigits,
  parseMoney,
  splitExpense,
  simplifyBalances,
  whatsappGroupInvite,
  type SplitMethod,
  type SettlementMatch,
} from "@settleup/domain";
import { BillEditor, type BillPhoto, type BillLine } from "./bill";
import { API_URL, repository, uuid, extra, request } from "../data/repository";
import { personName } from "../data/people";
import {
  outstandingByPerson,
  simplifiedIncoming,
  simplifiedOutgoing,
} from "../data/balances";
import { useAction } from "../data/hooks";
import {
  IncomingSettlements,
  OutgoingHelper,
  CrossGroupOffsets,
  consumeSmsMatch,
} from "./receive";
import { DataScreen, SectionTitle, TransactionRow } from "./overview";
import { KeyboardAwareScreen } from "../components/KeyboardAwareScreen";
import { DatePicker, DateTimePicker } from "../components/DateTimePicker";
import {
  Card,
  Heading,
  Label,
  Field,
  Button,
  Chip,
  Notice,
  Empty,
  Avatar,
  PipFeedback,
  ReferenceArt,
  Icon,
  useColors,
  SearchPicker,
  SearchBar,
  ActionDialog,
  IconButton,
  type IconName,
} from "../components/ui";
const expenseForm = z.object({
  title: z.string().trim().min(1, "Give this transaction a name.").max(120),
  amount: z.string().min(1, "Enter an amount."),
  notes: z.string().max(2000),
  date: z.string().min(10),
});
const splitMethodLabels: Record<SplitMethod, string> = {
  EQUAL: "Equal",
  EXACT: "Exact amounts",
  PERCENTAGE: "Percentage",
  SHARES: "By shares",
};
export function AddScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return (
    <DataScreen>
      {(d) =>
        edit &&
        !d.transactions.some(
          (entry) =>
            entry.id === edit &&
            ["PERSONAL_EXPENSE", "SHARED_EXPENSE"].includes(entry.type),
        ) ? (
          <Empty
            title="Transaction unavailable"
            detail="Only expenses can be edited here."
          />
        ) : (
          <ExpenseForm key={`${d.account.id}:${edit ?? "new"}`} data={d} />
        )
      }
    </DataScreen>
  );
}
function ExpenseForm({ data: d }: { data: Dashboard }) {
  const params = useLocalSearchParams<{
      ledger?: string;
      title?: string;
      amount?: string;
      pending?: string;
      capture?: string;
      bill?: string;
      edit?: string;
      members?: string;
      payer?: string;
      date?: string;
    }>(),
    router = useRouter(),
    action = useAction();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width / Math.max(fontScale, 1) < 320;
  const c = useColors();
  const editing = params.edit
    ? d.transactions.find((transaction) => transaction.id === params.edit)
    : undefined;
  const [editVersion] = useState(editing?.version);
  const editingSomeoneElsesPersonal =
    editing?.type === "PERSONAL_EXPENSE" && editing.sourceId !== d.account.id;
  const creatorId = editing?.createdById ?? editing?.sourceId ?? d.account.id;
  const editScale =
    10 ** currencyDigits(editing?.currency ?? d.account.currency);
  const groupLocked = !!(editing?.ledgerId || params.ledger);
  const includeCreator =
    editing?.type !== "SHARED_EXPENSE" ||
    editing.allocations.some((allocation) => allocation.userId === creatorId);
  const [ledgerId, setLedgerId] = useState(
      editing?.ledgerId ?? params.ledger ?? "",
    ),
    [selected, setSelected] = useState<string[]>(
      editing?.allocations
        .map((allocation) => allocation.userId)
        .filter((id) => !includeCreator || id !== creatorId) ??
        // AI Quick Add hands over the people to split with.
        (params.members
          ?.split(",")
          .filter((id) => !!id && id !== creatorId)
          .slice(0, 50) ??
          []),
    ),
    // "Paid for others": the creator can leave themselves out of the split.
    [includeMe, setIncludeMe] = useState(includeCreator),
    [multiPay, setMultiPay] = useState(!!editing?.payers?.length),
    [paidAmounts, setPaidAmounts] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        (editing?.payers ?? []).map((p) => [
          p.userId,
          String(p.amountMinor / editScale),
        ]),
      ),
    ),
    [chosenPayer, setChosenPayer] = useState(
      editing?.sourceId ?? params.payer ?? creatorId,
    ),
    [method, setMethod] = useState<SplitMethod>(
      editing?.splitMethod ?? "EQUAL",
    ),
    [weights, setWeights] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        (editing?.allocations ?? []).map(({ userId, amountMinor }) => {
          const weight = editing?.splitWeights?.[userId];
          return [
            userId,
            String(
              editing?.splitMethod === "EXACT"
                ? amountMinor / editScale
                : editing?.splitMethod === "PERCENTAGE"
                  ? (weight ?? 0) / 100
                  : (weight ?? 1),
            ),
          ];
        }),
      ),
    ),
    [tagIds, setTagIds] = useState<string[]>(editing?.tagIds ?? []),
    [transactionIcon, setTransactionIcon] = useState<IconName>(
      (editing?.icon as IconName) ?? "bag",
    ),
    [billOpen, setBillOpen] = useState(
      params.capture === "bill" ||
        params.bill === "1" ||
        params.bill === "camera",
    ),
    [picker, setPicker] = useState<
      "ledger" | "participants" | "payer" | "method" | "tags" | null
    >(null),
    [tagCreatorOpen, setTagCreatorOpen] = useState(false),
    [newTagName, setNewTagName] = useState(""),
    [newTagColor, setNewTagColor] = useState("#4F46E5"),
    [infoDialog, setInfoDialog] = useState<{
      title: string;
      detail: string;
    } | null>(null),
    [key, setKey] = useState(uuid());
  const [photo, setPhoto] = useState<BillPhoto | null>(null);
  const [lines, setLines] = useState<BillLine[]>(
    editing?.items?.map((item) => ({
      name: item.name,
      quantity: String(item.quantity),
      amount: String(item.amountMinor / editScale),
    })) ?? [],
  );
  const [includeBill, setIncludeBill] = useState(true);
  const [showShares, setShowShares] = useState(false);
  const [recurring, setRecurring] = useState<
    { frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" } | null
  >(editing?.recurring ? { frequency: (editing.recurring as any).frequency } : null);
  const [tripCurrency, setTripCurrency] = useState(editing?.tripCurrency ?? "");
  const [scanning, setScanning] = useState(false);
  const saving = useRef(false);
  const {
    setValue,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(expenseForm),
    defaultValues: {
      title: params.title ?? editing?.title ?? "",
      amount:
        params.amount ??
        (editing ? String(editing.amountMinor / editScale) : ""),
      notes: editing?.notes ?? "",
      date: editing
        ? DateTime.fromISO(editing.occurredAt)
            .setZone("Asia/Kolkata")
            .toFormat("yyyy-MM-dd HH:mm")
        : params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
          ? `${params.date} ${DateTime.now().setZone("Asia/Kolkata").toFormat("HH:mm")}`
          : DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd HH:mm"),
    },
  });
  const ledger = d.ledgers.find((l) => l.id === ledgerId);
  const amount = watch("amount");
  const splitMembers = [...(includeMe ? [creatorId] : []), ...selected];
  const payerOptions = [...new Set([creatorId, ...splitMembers])];
  const payerId = payerOptions.includes(chosenPayer) ? chosenPayer : creatorId;
  const currency = ledger?.currency ?? editing?.currency ?? d.account.currency;
  const currencyScale = 10 ** currencyDigits(currency);
  const splitInputSuffix =
    method === "EXACT" ? currency : method === "PERCENTAGE" ? "%" : "shares";
  const memberName = (id: string) => personName(d, id);
  const type: CreateTransaction["type"] =
    selected.length || editing?.type === "SHARED_EXPENSE"
      ? "SHARED_EXPENSE"
      : "PERSONAL_EXPENSE";
  const hasBill = !!photo || lines.length > 0;
  useEffect(() => {
    if (chosenPayer !== creatorId && !selected.includes(chosenPayer))
      setChosenPayer(creatorId);
  }, [chosenPayer, creatorId, selected]);
  const addFriend = (contactId: string) => {
    if (includeMe && contactId === creatorId) return;
    if (ledger && !ledger.members.some((member) => member.id === contactId)) {
      setInfoDialog({
        title: "Not in this group",
        detail: `${memberName(contactId)} is not a member of ${ledger.name}.`,
      });
      return;
    }
    setSelected((current) =>
      current.includes(contactId) ? current : [...current, contactId],
    );
  };
  const participants = () =>
    splitMembers.map((userId) => {
      const weight = weights[userId]?.trim();
      return {
        userId,
        value:
          method === "EXACT"
            ? parseMoney(weight || "0", currency, true)
            : method === "PERCENTAGE"
              ? parseMoney(weight || "0", "INR", true)
              : method === "SHARES"
                ? /^\d+$/.test(weight || "1")
                  ? Number(weight || "1")
                  : Number.NaN
                : undefined,
      };
    });
  const allocations = () =>
    splitExpense(parseMoney(amount, currency), participants(), method);
  let preview: ReturnType<typeof allocations> = [];
  let splitError = "";
  if (type === "SHARED_EXPENSE" && amount && splitMembers.length)
    try {
      preview = allocations();
    } catch (e) {
      splitError = (e as Error).message;
    }
  const submit = handleSubmit(async (values) => {
    if (editingSomeoneElsesPersonal) return;
    if (saving.current || scanning) return;
    saving.current = true;
    const ok = await action.run(
      async () => {
        const amountMinor = parseMoney(values.amount, currency);
        const localDate = DateTime.fromFormat(values.date, "yyyy-MM-dd HH:mm", {
          zone: "Asia/Kolkata",
        });
        if (!localDate.isValid)
          throw new Error(
            "Use a valid date and time, for example 2026-09-10 18:30.",
          );
        const occurredAt = localDate.toUTC().toISO()!;
        const input: CreateTransaction = {
          idempotencyKey: key,
          title: values.title,
          amountMinor,
          currency,
          type,
          status:
            type === "PERSONAL_EXPENSE" &&
            (params.pending === "1" || editing?.status === "PENDING")
              ? "PENDING"
              : "SETTLED",
          occurredAt,
          notes: values.notes,
          icon: transactionIcon,
          ledgerId: ledgerId || undefined,
          payerId:
            type !== "SHARED_EXPENSE"
              ? undefined
              : !multiPay
                ? payerId
                : // One filled-in payer is just a normal single payer.
                  (payerOptions.filter((userId) => paidAmounts[userId]?.trim() && Number(paidAmounts[userId]) > 0)
                    .length === 1
                    ? payerOptions.find((userId) => paidAmounts[userId]?.trim() && Number(paidAmounts[userId]) > 0)
                    : undefined),
          payers:
            type === "SHARED_EXPENSE" && multiPay
              ? payerOptions
                  .map((userId) => ({
                    userId,
                    amountMinor: paidAmounts[userId]?.trim()
                      ? parseMoney(paidAmounts[userId].trim(), currency, true)
                      : 0,
                  }))
                  .filter((p) => p.amountMinor > 0)
              : undefined,
          tagIds,
          items: includeBill
            ? lines.map((line) => ({
                name: line.name,
                quantity: Number(line.quantity),
                amountMinor:
                  parseMoney(line.amount.replace(/^-/, ""), currency, true) *
                  (line.amount.startsWith("-") ? -1 : 1),
              }))
            : [],
          splitMethod: method,
          participants: type === "SHARED_EXPENSE" ? participants() : [],
          recurring: recurring ?? undefined,
          tripCurrency: tripCurrency || undefined,
        };
        if (editing)
          await extra(
            d.account.id,
            `/transactions/${editing.id}`,
            { version: editVersion, transaction: input },
            "PATCH",
          );
        else await repository.create(d.account.id, input);
      },
      editing
        ? "Transaction updated."
        : "Expense saved. One less thing to keep in your head.",
    );
    saving.current = false;
    if (ok) {
      setKey(uuid());
      if (ledgerId) router.replace(`/group/${ledgerId}` as any);
      else router.replace("/activity");
    }
  });
  if (editingSomeoneElsesPersonal) {
    const ownerName = personName(
      d,
      editing.sourceId,
      editing.createdByName ?? "The person who recorded it",
    );
    const leave = () => router.replace(`/transaction/${editing.id}` as any);
    return (
      <YStack gap={14} maxWidth={620} width="100%" alignSelf="center">
        <ActionDialog
          visible
          icon="wallet"
          title="This is a personal expense"
          detail={`${ownerName} owns this record. Only they can edit it, add a split, or make it shared with the group.`}
          onClose={leave}
          actions={[{ label: "Back to transaction", onPress: leave }]}
        />
      </YStack>
    );
  }
  return (
    <YStack gap={10} maxWidth={640} width="100%" alignSelf="center">
      <View
        pointerEvents={action.busy ? "none" : "auto"}
        style={{ opacity: action.busy ? 0.72 : 1 }}
      >
        <YStack gap={10}>
          <XStack alignItems="center" gap={8}>
            <Heading size={22} flex={1} minWidth={0}>
              {editing ? "Edit transaction" : "Add a transaction"}
            </Heading>
            <Button
              secondary
              compact
              icon={lines.length && includeBill ? "check" : "image"}
              style={{
                backgroundColor: hasBill && includeBill ? c.mint : c.soft,
                borderWidth: 0,
              }}
              onPress={() => setBillOpen(true)}
            >
              {hasBill ? "View bill" : "Add bill"}
            </Button>
          </XStack>
          {hasBill && (
            <XStack
              alignItems="center"
              gap={10}
              borderRadius={12}
              paddingHorizontal={12}
              paddingVertical={4}
              backgroundColor={includeBill ? c.mint : c.rose}
            >
              <Icon
                name={includeBill && lines.length ? "check" : "image"}
                size={18}
                color={c.text}
              />
              <YStack flex={1} minWidth={0} gap={1}>
                <Label size={13} bold>
                  {lines.length
                    ? includeBill
                      ? "Bill items included"
                      : "Bill items excluded"
                    : "Bill photo ready"}
                </Label>
                <Label size={11} muted>
                  {lines.length
                    ? `${lines.length} ${lines.length === 1 ? "item" : "items"}`
                    : "Open the bill to add items."}
                </Label>
              </YStack>
              {!!lines.length && (
                <Switch
                  accessibilityLabel="Include bill items"
                  value={includeBill}
                  onValueChange={setIncludeBill}
                  trackColor={{ false: c.line, true: c.primary }}
                />
              )}
            </XStack>
          )}
          <Modal
            visible={billOpen}
            transparent
            animationType="slide"
            onRequestClose={() => !scanning && setBillOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(22,24,28,0.52)",
                padding: 16,
              }}
            >
              <KeyboardAwareScreen
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  width: "100%",
                  maxWidth: 760,
                  alignSelf: "center",
                  paddingVertical: 20,
                }}
              >
                <YStack gap={12}>
                  <XStack justifyContent="flex-end">
                    <Button
                      secondary
                      compact
                      disabled={scanning}
                      onPress={() => setBillOpen(false)}
                    >
                      Done
                    </Button>
                  </XStack>
                  <BillEditor
                    accountId={d.account.id}
                    autoCapture={params.capture === "bill"}
                    onAutoCaptureHandled={() =>
                      router.setParams({ capture: undefined })
                    }
                    currency={currency}
                    amount={amount}
                    lines={lines}
                    onLines={(next) => {
                      if (!lines.length && next.length) setIncludeBill(true);
                      setLines(next);
                    }}
                    onAmount={(value) =>
                      setValue("amount", value, { shouldValidate: true })
                    }
                    onMerchantName={(value) => {
                      if (!watch("title").trim())
                        setValue("title", value, { shouldValidate: true });
                    }}
                    photo={photo}
                    onPhoto={setPhoto}
                    onBusy={setScanning}
                    autoCamera={params.bill === "1" || params.bill === "camera"}
                  />
                </YStack>
              </KeyboardAwareScreen>
            </View>
          </Modal>
          <Card style={{ padding: 12 }}>
            <YStack gap={10}>
              <Controller
                control={control}
                name="title"
                render={({ field }) => (
                  <Field
                    label="What was it for?"
                    placeholder="e.g. Dinner"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.title?.message}
                    style={{ paddingVertical: 8 }}
                  />
                )}
              />
              <XStack gap={8} flexDirection={narrow ? "column" : "row"}>
                <YStack flex={1} minWidth={0}>
                  <Controller
                    control={control}
                    name="amount"
                    render={({ field }) => (
                      <Field
                        label={`Amount · ${currency}`}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        value={field.value}
                        onChangeText={field.onChange}
                        error={errors.amount?.message}
                        style={{ paddingVertical: 8 }}
                      />
                    )}
                  />
                </YStack>
                <YStack flex={1.4} minWidth={0}>
                  <Controller
                    control={control}
                    name="date"
                    render={({ field }) => (
                      <DateTimePicker
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.date?.message}
                      />
                    )}
                  />
                </YStack>
              </XStack>
              <XStack gap={8} flexDirection={narrow ? "column" : "row"}>
                <ExpenseOption
                  label="Group"
                  value={ledger?.name ?? "No group"}
                  icon={groupLocked ? "lock" : "groups"}
                  tint={c.soft}
                  onPress={groupLocked ? undefined : () => setPicker("ledger")}
                />
                <ExpenseOption
                  label="Split with"
                  value={
                    selected.length
                      ? `${selected.length} ${selected.length === 1 ? "person" : "people"}`
                      : "Add people"
                  }
                  icon="groups"
                  tint={c.amber}
                  onPress={() => setPicker("participants")}
                />
              </XStack>
              {type === "SHARED_EXPENSE" && (
                <YStack gap={8}>
                  <XStack gap={8} flexDirection={narrow ? "column" : "row"}>
                    <ExpenseOption
                      label="Paid by"
                      value={multiPay ? "Several people" : memberName(payerId)}
                      icon="wallet"
                      tint={c.mint}
                      onPress={() => setPicker("payer")}
                    />
                    <ExpenseOption
                      label="Split method"
                      value={splitMethodLabels[method]}
                      icon="transactions"
                      tint={c.amber}
                      onPress={() => setPicker("method")}
                    />
                  </XStack>
                  {multiPay && (
                    <YStack gap={8}>
                      {payerOptions.map((id) => (
                        <Field
                          key={id}
                          label={`Paid by ${memberName(id)}`}
                          value={paidAmounts[id] ?? ""}
                          onChangeText={(value) =>
                            setPaidAmounts((current) => ({ ...current, [id]: value }))
                          }
                          keyboardType="decimal-pad"
                          placeholder="0"
                        />
                      ))}
                      <Label muted size={11}>
                        {(() => {
                          try {
                            const paid = payerOptions.reduce(
                              (sum, id) =>
                                sum +
                                (paidAmounts[id]?.trim()
                                  ? parseMoney(paidAmounts[id].trim(), currency, true)
                                  : 0),
                              0,
                            );
                            const total = amount ? parseMoney(amount, currency) : 0;
                            return paid === total
                              ? "Payments add up to the total."
                              : `Payments add up to ${money(paid, currency)} of ${money(total, currency)}.`;
                          } catch {
                            return "Enter amounts like 1200 or 1200.50.";
                          }
                        })()}
                      </Label>
                    </YStack>
                  )}
                  <XStack gap={8} alignItems="center" flexWrap="wrap">
                    <Chip selected={includeMe} onPress={() => setIncludeMe(!includeMe)}>
                      {includeMe ? "Includes my share" : "Not including me"}
                    </Chip>
                    <Label muted size={11} flexShrink={1}>
                      {includeMe
                        ? "Tap if you paid only for others."
                        : "Everyone selected owes their share; you have none."}
                    </Label>
                  </XStack>
                  {method !== "EQUAL" && (
                    <YStack gap={8}>
                      {splitMembers.map((id) => (
                        <Field
                          key={id}
                          label={`${memberName(id)} · ${splitInputSuffix}`}
                          value={weights[id] ?? ""}
                          keyboardType="decimal-pad"
                          onChangeText={(value) =>
                            setWeights((current) => ({
                              ...current,
                              [id]: value,
                            }))
                          }
                        />
                      ))}
                    </YStack>
                  )}
                  {!!splitError && <Notice error>{splitError}</Notice>}
                  {!!preview.length && (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showShares }}
                        onPress={() => setShowShares(!showShares)}
                        style={{
                          minHeight: 44,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon
                          name={showShares ? "up" : "down"}
                          size={16}
                          color={c.primary}
                        />
                        <Label bold size={13}>
                          {showShares
                            ? "Hide shares"
                            : `View ${preview.length} shares`}
                        </Label>
                      </Pressable>
                      {showShares && (
                        <YStack gap={6}>
                          {preview.map((share) => (
                            <XStack
                              justifyContent="space-between"
                              gap={8}
                              key={share.userId}
                            >
                              <Label muted flex={1} minWidth={0}>
                                {memberName(share.userId)}
                              </Label>
                              <Label bold>
                                {money(share.amountMinor, currency)}
                              </Label>
                            </XStack>
                          ))}
                          <Label size={11} muted>
                            Other members owe their shares to{" "}
                            {payerId === d.account.id
                              ? "you"
                              : memberName(payerId)}
                            .
                          </Label>
                        </YStack>
                      )}
                    </>
                  )}
                </YStack>
              )}
              <YStack gap={10}>
                <XStack gap={8} alignItems="center">
                  <ExpenseOption
                    label="Tags"
                    value={
                      tagIds.length
                        ? `${tagIds.length} selected`
                        : "Choose tags"
                    }
                    icon="activity"
                    tint={c.rose}
                    onPress={() => setPicker("tags")}
                  />
                  <IconButton
                    name="plus"
                    label="Create a tag"
                    onPress={() => setTagCreatorOpen(true)}
                  />
                </XStack>
                <YStack gap={4}>
                  <Label size={13} bold>
                    Transaction icon
                  </Label>
                  <XStack gap={4} flexWrap="wrap">
                    {(
                      [
                        "bag",
                        "coffee",
                        "car",
                        "plane",
                        "bolt",
                        "wallet",
                      ] as const
                    ).map((name) => (
                      <Pressable
                        key={name}
                        accessibilityRole="radio"
                        accessibilityLabel={`${name} icon`}
                        accessibilityState={{
                          selected: transactionIcon === name,
                        }}
                        onPress={() => setTransactionIcon(name)}
                        style={({ pressed }) => ({
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor:
                            transactionIcon === name ? c.soft : "transparent",
                          opacity: pressed ? 0.72 : 1,
                        })}
                      >
                        <Icon
                          name={name}
                          size={20}
                          color={transactionIcon === name ? c.primary : c.muted}
                        />
                      </Pressable>
                    ))}
                  </XStack>
                </YStack>
                <Controller
                  control={control}
                  name="notes"
                  render={({ field }) => (
                    <Field
                      label="Note (optional)"
                      multiline
                      placeholder="Add a note"
                      value={field.value}
                      onChangeText={field.onChange}
                      error={errors.notes?.message}
                    />
                  )}
                />
              </YStack>
              <YStack gap={10}>
                <Label bold size={13}>Recurring</Label>
                <XStack gap={8} flexWrap="wrap">
                  {(["MONTHLY", "WEEKLY", "YEARLY"] as const).map((freq) => (
                    <Chip
                      key={freq}
                      selected={recurring?.frequency === freq}
                      onPress={() =>
                        setRecurring(
                          recurring?.frequency === freq
                            ? null
                            : { frequency: freq },
                        )
                      }
                    >
                      {freq[0] + freq.slice(1).toLowerCase()}
                    </Chip>
                  ))}
                </XStack>
                {!!recurring && (
                  <Label muted size={11}>
                    This expense will repeat {recurring.frequency.toLowerCase()}.
                  </Label>
                )}
              </YStack>
              {type === "SHARED_EXPENSE" && (
                <YStack gap={8}>
                  <Label bold size={13}>Trip currency</Label>
                  <Label muted size={11}>
                    If this expense was in a different currency (e.g. THB, USD), enter it here.
                  </Label>
                  <Field
                    label="Currency code"
                    placeholder="e.g. THB, USD"
                    autoCapitalize="characters"
                    maxLength={3}
                    value={tripCurrency}
                    onChangeText={setTripCurrency}
                  />
                </YStack>
              )}
              {!!action.error && (
                <>
                  <PipFeedback
                    mood="help"
                    message="One quick check, then you’re all set."
                  />
                  <Notice error>{action.error}</Notice>
                </>
              )}
              {!!action.success && <Notice>{action.success}</Notice>}
              <Button
                onPress={submit}
                loading={action.busy || scanning}
                disabled={action.busy || scanning}
              >
                {action.busy
                  ? "Saving…"
                  : type === "SHARED_EXPENSE"
                    ? editing
                      ? "Update split transaction"
                      : "Save & split expense"
                    : editing
                      ? "Update transaction"
                      : "Save transaction"}
              </Button>
            </YStack>
          </Card>
          <SearchPicker
            visible={picker === "ledger" && !groupLocked}
            title="Groups"
            options={[
              { id: "__personal", label: "No group" },
              ...d.ledgers
                .filter((entry) => !entry.deleted)
                .map((entry) => ({
                  id: entry.id,
                  label: entry.name,
                  detail: `${entry.members.length} members · ${entry.currency}`,
                })),
            ]}
            selected={[ledgerId || "__personal"]}
            onSelect={(id) => {
              const next = d.ledgers.find((entry) => entry.id === id);
              setLedgerId(next?.id ?? "");
              if (next)
                setSelected((current) =>
                  current.filter((person) =>
                    next.members.some((member) => member.id === person),
                  ),
                );
            }}
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "participants"}
            title="Add friends"
            options={(ledger ? ledger.members : d.savedContacts)
              .filter((member) => member.id !== creatorId)
              .map((member) => ({
                id: member.id,
                label: memberName(member.id),
              }))}
            selected={selected}
            multiple
            selectionIcon={null}
            footer={
              ledger ? undefined : (
                <Button
                  secondary
                  compact
                  icon="plus"
                  onPress={() =>
                    action.run(async () => {
                      const picked = await chooseContact();
                      if (!picked) return;
                      const digits = picked.phone.replace(/\D/g, "").slice(-10);
                      const saved = d.savedContacts.find(
                        (contact) =>
                          contact.phone?.replace(/\D/g, "").slice(-10) ===
                          digits,
                      );
                      if (!saved) {
                        setPicker(null);
                        setInfoDialog({
                          title: "Save this contact first",
                          detail:
                            "Add this phone contact to Saved contacts, then choose them here.",
                        });
                        return;
                      }
                      addFriend(saved.id);
                    }, "Contact selected")
                  }
                >
                  Phone contacts
                </Button>
              )
            }
            onSelect={(id) =>
              selected.includes(id)
                ? setSelected((current) =>
                    current.filter((memberId) => memberId !== id),
                  )
                : addFriend(id)
            }
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "payer"}
            title="Who paid?"
            options={[
              ...payerOptions.map((id) => ({
                id,
                label: memberName(id),
                detail: id === creatorId ? "Transaction creator" : undefined,
              })),
              {
                id: "__multiple",
                label: "Several people paid",
                detail: "Enter how much each person paid",
              },
            ]}
            selected={[multiPay ? "__multiple" : payerId]}
            selectionIcon={null}
            onSelect={(id) => {
              if (id === "__multiple") setMultiPay(true);
              else {
                setMultiPay(false);
                setChosenPayer(id);
              }
            }}
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "method"}
            title="Split method"
            options={(Object.keys(splitMethodLabels) as SplitMethod[]).map(
              (id) => ({
                id,
                label: splitMethodLabels[id],
              }),
            )}
            selected={[method]}
            selectionIcon={null}
            onSelect={(id) => {
              if (id === "EXACT" && method === "EQUAL" && preview.length)
                setWeights(
                  Object.fromEntries(
                    preview.map((share) => [
                      share.userId,
                      String(share.amountMinor / currencyScale),
                    ]),
                  ),
                );
              setMethod(id as SplitMethod);
            }}
            onClose={() => setPicker(null)}
          />
          <Modal
            visible={tagCreatorOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setTagCreatorOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(22,24,28,0.5)",
              }}
            >
              <KeyboardAwareScreen
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  padding: 20,
                }}
              >
                <Card
                  style={{ width: "100%", maxWidth: 480, alignSelf: "center" }}
                >
                  <YStack gap={15}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <Heading size={20}>Create a tag</Heading>
                      <IconButton
                        name="close"
                        label="Close"
                        onPress={() => setTagCreatorOpen(false)}
                      />
                    </XStack>
                    <Field
                      label="Tag name"
                      placeholder="Food, travel, subscriptions…"
                      value={newTagName}
                      onChangeText={setNewTagName}
                    />
                    <XStack gap={8} flexWrap="wrap">
                      {[
                        "#4F46E5",
                        "#ECA54C",
                        "#818CF8",
                        "#5EB69B",
                        "#E8898C",
                      ].map((color) => (
                        <Chip
                          key={color}
                          selected={newTagColor === color}
                          onPress={() => setNewTagColor(color)}
                        >
                          <Label color={color}>●</Label>
                        </Chip>
                      ))}
                    </XStack>
                    {!!action.error && <Notice error>{action.error}</Notice>}
                    <Button
                      loading={action.busy}
                      disabled={action.busy || !newTagName.trim()}
                      onPress={async () => {
                        await action.run(async () => {
                          const created = await extra(
                            d.account.id,
                            "/tags",
                            { name: newTagName.trim(), color: newTagColor },
                            "POST",
                          );
                          if (created?.id)
                            setTagIds((current) => [
                              ...new Set([...current, created.id]),
                            ]);
                          setNewTagName("");
                          setTagCreatorOpen(false);
                        }, "Tag created and selected");
                      }}
                    >
                      Create and select
                    </Button>
                  </YStack>
                </Card>
              </KeyboardAwareScreen>
            </View>
          </Modal>
          <SearchPicker
            visible={picker === "tags"}
            title="Tags"
            placeholder="Search and select multiple tags"
            selectionIcon="more"
            options={d.tags
              .filter((tag) => !tag.archived)
              .map((tag) => ({ id: tag.id, label: tag.name }))}
            selected={tagIds}
            multiple
            onSelect={(id) =>
              setTagIds((current) =>
                current.includes(id)
                  ? current.filter((tagId) => tagId !== id)
                  : [...current, id],
              )
            }
            onClear={() => setTagIds([])}
            onClose={() => setPicker(null)}
          />
          <ActionDialog
            visible={!!infoDialog}
            icon="groups"
            title={infoDialog?.title ?? "Contact unavailable"}
            detail={infoDialog?.detail ?? "Choose another contact."}
            onClose={() => setInfoDialog(null)}
            actions={[
              {
                label: "Got it",
                onPress: () => setInfoDialog(null),
              },
            ]}
          />
        </YStack>
      </View>
    </YStack>
  );
}
function ExpenseOption({
  label,
  value,
  icon,
  tint,
  onPress,
}: {
  label: string;
  value: string;
  icon: IconName;
  tint: string;
  onPress?(): void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}. ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        borderRadius: 10,
        backgroundColor: tint,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Icon name={icon} size={16} color={c.text} />
      <YStack flex={1} minWidth={0}>
        <Label size={11} muted>
          {label}
        </Label>
        <Label size={13} bold numberOfLines={1} ellipsizeMode="tail">
          {value}
        </Label>
      </YStack>
    </Pressable>
  );
}

export function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    action = useAction();
  const router = useRouter();
  const [ownerOnlyOpen, setOwnerOnlyOpen] = useState(false);
  return (
    <DataScreen>
      {(d) => {
        const t = d.transactions.find((t) => t.id === id);
        if (!t)
          return (
            <Empty
              title="Entry unavailable"
              detail="This entry is not available in the active account."
            />
          );
        const perform = () =>
          action.run(() =>
            repository.action(
              d.account.id,
              id,
              "complete",
              t.version,
              "completed",
            ),
          );
        const ownerOnly =
          t.type === "PERSONAL_EXPENSE" && t.sourceId !== d.account.id;
        const expense =
          t.type === "PERSONAL_EXPENSE" || t.type === "SHARED_EXPENSE";
        const ownerName = personName(
          d,
          t.createdById ?? t.sourceId,
          "The person who recorded it",
        );
        return (
          <YStack maxWidth={760} width="100%" alignSelf="center" gap={22}>
            <Heading>{t.title}</Heading>
            <Card>
              <YStack gap={17}>
                <Label bold size={38}>
                  {money(t.amountMinor, t.currency)}
                </Label>
                <Label color="#4D1CAF">
                  {t.type.toLowerCase().replace(/_/g, " ")} ·{" "}
                  {t.status.toLowerCase().replace(/_/g, " ")}
                </Label>
                <Label muted>
                  {new Date(t.occurredAt).toLocaleString("en-IN")}
                </Label>
                {!!t.ledgerId && (
                  <Label muted>
                    Recorded by{" "}
                    {personName(
                      d,
                      t.createdById ?? t.sourceId,
                      t.createdByName,
                    )}
                  </Label>
                )}
                {t.type === "SHARED_EXPENSE" && (
                  <Label muted>
                    Paid by {personName(d, t.sourceId, t.payerName)}
                  </Label>
                )}
                {!!t.notes && <Label>{t.notes}</Label>}
                {!!t.items?.length && (
                  <YStack gap={12}>
                    <SectionTitle title="Bill items" />
                    {t.items.map((item, index) => (
                      <XStack
                        gap={16}
                        justifyContent="space-between"
                        key={index}
                      >
                        <Label flex={1}>
                          {item.quantity} × {item.name}
                        </Label>
                        <Label bold>
                          {money(item.amountMinor, t.currency)}
                        </Label>
                      </XStack>
                    ))}
                  </YStack>
                )}
                {t.allocations.length > 0 && (
                  <>
                    <SectionTitle title="The original split" />
                    {t.allocations.map((a) => (
                      <XStack
                        justifyContent="space-between"
                        gap={8}
                        key={a.userId}
                      >
                        <Label flex={1} minWidth={0}>
                          {personName(d, a.userId)}
                        </Label>
                        <Label bold flexShrink={1} textAlign="right">
                          {money(a.amountMinor, t.currency)}
                        </Label>
                      </XStack>
                    ))}
                  </>
                )}
              </YStack>
            </Card>
            <Card>
              <YStack gap={16}>
                <Heading size={18}>Manage transaction</Heading>
                <Label muted size={12}>
                  {ownerOnly
                    ? `${ownerName} owns this personal expense. Only they can edit it or make it shared.`
                    : "Group members can edit shared transactions. Every change is recorded in group changes."}
                </Label>
                {!!action.error && <Notice error>{action.error}</Notice>}
                {!!action.success && <Notice>{action.success}</Notice>}
                <XStack gap={10} flexWrap="wrap">
                  {expense && (
                    <Button
                      secondary
                      icon="edit"
                      onPress={() => {
                        if (ownerOnly) setOwnerOnlyOpen(true);
                        else
                          router.push({
                            pathname: "/add",
                            params: { edit: t.id },
                          });
                      }}
                    >
                      {ownerOnly ? "Why can’t I edit?" : "Edit transaction"}
                    </Button>
                  )}
                  {t.status === "PENDING" && !ownerOnly && (
                    <Button
                      loading={action.busy}
                      disabled={action.busy}
                      onPress={perform}
                    >
                      Confirm payment completed
                    </Button>
                  )}
                </XStack>
              </YStack>
            </Card>
            <ActionDialog
              visible={ownerOnlyOpen}
              icon="wallet"
              title="Personal expense belongs to its owner"
              detail={`${ownerName} can edit this expense and choose group members to make it shared. Other group members can view it here but cannot change or delete it.`}
              onClose={() => setOwnerOnlyOpen(false)}
              actions={[
                {
                  label: "Got it",
                  onPress: () => setOwnerOnlyOpen(false),
                },
              ]}
            />
            <Card>
              <SectionTitle title="Transactions" />
              {d.activity
                .filter((a) => a.message.includes(t.title))
                .map((a) => (
                  <Label key={a.id} muted size={12} marginBottom={10}>
                    {a.message}
                  </Label>
                ))}
              <Label muted size={11}>
                Record version {t.version}. Changes are preserved in the audit
                history.
              </Label>
            </Card>
          </YStack>
        );
      }}
    </DataScreen>
  );
}
export function SettlementScreen() {
  const c = useColors(),
    router = useRouter();
  const {
    view,
    ledger: requestedLedger,
    creditor: requestedCreditor,
    amount: requestedAmount,
    original,
  } = useLocalSearchParams<{
    view?: string;
    ledger?: string;
    creditor?: string;
    amount?: string;
    original?: string;
  }>();
  const originalPair =
    original === "1" && !!requestedLedger && !!requestedCreditor;
  const receiving = view === "owed";
  const [receipt, setReceipt] = useState<{
    accountId: string;
    name: string;
    avatar?: string;
    amountMinor: number;
    currency: string;
    date: string;
  } | null>(null);
  const action = useAction(),
    [debtId, setDebtId] = useState(""),
    [amount, setAmount] = useState(requestedAmount ?? ""),
    [key, setKey] = useState(uuid()),
    [smsMatch, setSmsMatch] = useState<SettlementMatch | null>(null);
  return (
    <DataScreen>
      {(d) => {
        const activeDebts = d.obligations.filter(
          (debt) =>
            !debt.ledgerId ||
            d.ledgers.some(
              (ledger) => ledger.id === debt.ledgerId && !ledger.deleted,
            ),
        );
        const incoming = simplifiedIncoming(activeDebts, d.account.id);
        const originalDebts = originalPair
          ? activeDebts.filter(
              (debt) =>
                debt.ledgerId === requestedLedger &&
                debt.debtorId === d.account.id &&
                debt.creditorId === requestedCreditor,
            )
          : [];
        const plan = originalPair
          ? outstandingByPerson(originalDebts, d.account.id, "outgoing", true)
          : simplifiedOutgoing(activeDebts, d.account.id);
        const scopeName = (ledgerId?: string) =>
          ledgerId
            ? (d.ledgers.find((ledger) => ledger.id === ledgerId)?.name ??
              "Group")
            : "Outside groups";
        const requested = plan.find(
          (o) =>
            o.ledgerId === requestedLedger && o.personId === requestedCreditor,
        );
        const selectedId = debtId || requested?.id || "";
        const selected = plan.find((o) => o.id === selectedId);
        if (receipt && receipt.accountId === d.account.id)
          return (
            <YStack gap={18} maxWidth={600} width="100%" alignSelf="center">
              <Card
                style={{
                  backgroundColor: c.soft,
                  borderColor: c.soft,
                  padding: 30,
                }}
              >
                <YStack gap={20} alignItems="center">
                  <ReferenceArt scene="coins" size={170} />
                  <PipFeedback
                    mood="success"
                    message="A little lighter. All recorded."
                  />
                  <Heading size={29}>Repayment recorded</Heading>
                  <Label muted>You confirmed a payment to</Label>
                  <Avatar
                    name={receipt.name}
                    avatar={receipt.avatar}
                    size={64}
                  />
                  <Label bold size={18}>
                    {receipt.name}
                  </Label>
                  <Label bold size={38}>
                    {money(receipt.amountMinor, receipt.currency)}
                  </Label>
                  <Label muted size={12}>
                    {new Date(receipt.date).toLocaleString("en-IN")}
                  </Label>
                  <Label muted size={12} textAlign="center">
                    Your ledger is updated. This records your confirmation;
                    SettleUp does not transfer funds.
                  </Label>
                </YStack>
              </Card>
              <Button onPress={() => setReceipt(null)}>Back to balances</Button>
              <Button secondary onPress={() => router.push("/activity")}>
                View transactions
              </Button>
            </YStack>
          );

        return (
          <YStack gap={18} maxWidth={720} width="100%" alignSelf="center">
            <PageHero
              eyebrow="Balances"
              title="Settle up"
              subtitle="Clear what you owe and collect what’s yours."
            />
            <XStack gap={8} flexWrap="wrap">
              <Chip
                selected={!receiving}
                onPress={() => router.setParams({ view: "pay", original: "" })}
              >
                You owe
              </Chip>
              <Chip
                selected={receiving}
                onPress={() => router.setParams({ view: "owed" })}
              >
                Owed to you
              </Chip>
            </XStack>
            <CrossGroupOffsets
              d={d}
              incoming={incoming}
              outgoing={simplifiedOutgoing(activeDebts, d.account.id)}
              scopeName={scopeName}
            />
            {receiving ? (
              <IncomingSettlements
                d={d}
                incoming={incoming}
                scopeName={scopeName}
              />
            ) : (
              <Card>
                <YStack gap={18}>
                  {!plan.length ? (
                    <Empty
                      title="You’re all settled up"
                      detail="No simplified repayments are due for this account."
                    />
                  ) : (
                    <>
                      <Heading size={19}>
                        {originalPair ? "Group repayment" : "Simplified debts"}
                      </Heading>
                      <Label muted size={12}>
                        {originalPair
                          ? "Record a payment against this group balance."
                          : "Select a balance to record a repayment."}
                      </Label>
                      {plan.map((o) => {
                        const contact = d.savedContacts.find(
                          (p) => p.id === o.personId,
                        );
                        const person = personName(d, o.personId);
                        return (
                          <Pressable
                            key={o.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Repay ${person}, ${money(o.amountMinor, o.currency)}`}
                            accessibilityState={{
                              selected: selectedId === o.id,
                            }}
                            onPress={() => {
                              setDebtId(o.id);
                              setSmsMatch(null);
                              setAmount(
                                String(
                                  o.amountMinor /
                                    10 **
                                      new Intl.NumberFormat("en", {
                                        style: "currency",
                                        currency: o.currency,
                                      }).resolvedOptions()
                                        .maximumFractionDigits!,
                                ),
                              );
                              setKey(uuid());
                            }}
                            style={{
                              padding: 16,
                              borderRadius: 17,
                              borderWidth: 1,
                              borderColor:
                                selectedId === o.id ? "#A5B4FC" : c.line,
                              backgroundColor:
                                selectedId === o.id ? c.soft : c.card,
                            }}
                          >
                            <XStack gap={12} alignItems="center">
                              <Avatar
                                name={person}
                                avatar={contact?.avatar}
                                size={44}
                              />
                              <YStack flex={1} minWidth={0}>
                                <Label bold>{person}</Label>
                                <Label muted size={11}>
                                  {scopeName(o.ledgerId)}
                                </Label>
                              </YStack>
                              <Label
                                bold
                                flexShrink={1}
                                maxWidth="43%"
                                textAlign="right"
                              >
                                {money(o.amountMinor, o.currency)}
                              </Label>
                              <Icon
                                name={selectedId === o.id ? "check" : "chevron"}
                                size={18}
                                color="#4F46E5"
                              />
                            </XStack>
                          </Pressable>
                        );
                      })}
                      {selected && (
                        <OutgoingHelper
                          d={d}
                          selected={selected}
                          onUseSms={(match) => {
                            setSmsMatch(match);
                            setAmount((match.amountMinor / 100).toFixed(2));
                          }}
                        />
                      )}
                      {selected && (
                        <Field
                          label={`Amount paid · ${scopeName(selected.ledgerId)}`}
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                        />
                      )}
                      {!!action.error && <Notice error>{action.error}</Notice>}
                      {!!action.success && <Notice>{action.success}</Notice>}
                      <Button
                        loading={action.busy}
                        disabled={!selected || !amount || action.busy}
                        onPress={() =>
                          action.run(async () => {
                            if (!selected) return;
                            const amountMinor = parseMoney(
                              amount,
                              selected.currency,
                            );
                            if (amountMinor > selected.amountMinor)
                              throw new Error(
                                "Enter an amount within this outstanding balance.",
                              );
                            const result = await repository.settle(
                              d.account.id,
                              {
                                idempotencyKey: key,
                                ledgerId: selected.ledgerId ?? undefined,
                                simplified: originalPair ? undefined : true,
                                debtorId: d.account.id,
                                creditorId: selected.personId,
                                amountMinor,
                                currency: selected.currency,
                                reference: smsMatch?.suggestion.reference,
                              },
                            );
                            if (smsMatch) {
                              await consumeSmsMatch(d.account.id, smsMatch);
                              setSmsMatch(null);
                            }
                            if (!(
                              result &&
                              typeof result === "object" &&
                              "queued" in result
                            ))
                              setReceipt({
                                accountId: d.account.id,
                                name: personName(d, selected.personId),
                                avatar: d.savedContacts.find(
                                  (p) => p.id === selected.personId,
                                )?.avatar,
                                amountMinor,
                                currency: selected.currency,
                                date: new Date().toISOString(),
                              });
                            setKey(uuid());
                            setDebtId("");
                            setAmount("");
                            return result;
                          }, "Repayment recorded. Your balance has been updated.")
                        }
                      >
                        I paid this amount · record repayment
                      </Button>
                    </>
                  )}
                </YStack>
              </Card>
            )}
          </YStack>
        );
      }}
    </DataScreen>
  );
}
const groupStyles = [
  { icon: "plane" as const, accent: "#4A93A3", background: "#F2FAFB" },
  { icon: "home" as const, accent: "#6A9479", background: "#F3F9F5" },
  { icon: "coffee" as const, accent: "#C07A5A", background: "#FDF7F4" },
  { icon: "groups" as const, accent: "#7C72B4", background: "#F5F4FA" },
  { icon: "bag" as const, accent: "#A97492", background: "#FAF4F8" },
  { icon: "bolt" as const, accent: "#C29A4E", background: "#FDFAF2" },
  { icon: "car" as const, accent: "#5B7DB1", background: "#F4F7FB" },
  { icon: "goal" as const, accent: "#5C9A82", background: "#F2FAF7" },
];
function groupStyle(groupId: string) {
  let hash = 0;
  for (const character of groupId)
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return groupStyles[hash % groupStyles.length];
}
function groupUpdatedAt(data: Dashboard, ledgerId: string, updatedAt?: string) {
  const lastActivity = data.activity.find(
    (entry) => entry.ledgerId === ledgerId,
  )?.createdAt;
  return Math.max(
    Date.parse(updatedAt ?? "") || 0,
    Date.parse(lastActivity ?? "") || 0,
  );
}
export function GroupsScreen() {
  const params = useLocalSearchParams(),
    [creating, setCreating] = useState(params.new === "1"),
    [name, setName] = useState(""),
    [members, setMembers] = useState<string[]>([]),
    [contacts, setContacts] = useState<{ name: string; phone: string }[]>([]),
    [phoneContacts, setPhoneContacts] = useState<
      { name: string; phone: string }[]
    >([]),
    [contactsOpen, setContactsOpen] = useState(false),
    [savedContactsOpen, setSavedContactsOpen] = useState(false),
    [showDeleted, setShowDeleted] = useState(false),
    action = useAction(),
    router = useRouter(),
    c = useColors();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={18}>
          <PageHero
            eyebrow="Groups"
            title="Your groups"
            subtitle="Shared spending, all in one place."
            action={{ label: "New group", onPress: () => setCreating(!creating) }}
          />
          <Modal
            visible={creating}
            transparent
            animationType="slide"
            onRequestClose={() => setCreating(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(22,24,28,0.48)",
              }}
            >
              <KeyboardAwareScreen
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  padding: 16,
                }}
              >
                <Card
                  style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}
                >
                  <YStack gap={15}>
                    <XStack
                      alignItems="center"
                      justifyContent="space-between"
                      gap={10}
                    >
                      <Heading size={20}>Create a group</Heading>
                      <IconButton
                        name="close"
                        label="Close create group"
                        onPress={() => setCreating(false)}
                      />
                    </XStack>
                    <Field
                      label="Group name"
                      placeholder="Your next adventure"
                      value={name}
                      onChangeText={setName}
                    />
                    <Label bold>Choose your people</Label>
                    <Button
                      secondary
                      icon="groups"
                      disabled={action.busy}
                      onPress={() =>
                        action.run(async () => {
                          setPhoneContacts(await chooseContacts());
                          setContactsOpen(true);
                        }, "Choose the contacts to add")
                      }
                    >
                      Choose multiple phone contacts
                    </Button>
                    <Button
                      secondary
                      compact
                      onPress={() => setSavedContactsOpen(true)}
                    >
                      Choose saved contacts
                      {members.length ? ` · ${members.length}` : ""}
                    </Button>
                    <XStack gap={8} flexWrap="wrap">
                      {contacts.map((contact) => (
                        <Chip
                          key={contact.phone}
                          selected
                          onPress={() =>
                            setContacts((items) =>
                              items.filter((p) => p.phone !== contact.phone),
                            )
                          }
                        >
                          {contact.name}
                        </Chip>
                      ))}
                    </XStack>
                    {!!action.error && <Notice error>{action.error}</Notice>}
                    <Button
                      loading={action.busy}
                      disabled={action.busy}
                      onPress={async () => {
                        if (
                          await action.run(async () => {
                            if (!name.trim())
                              throw new Error("Give your group a name.");
                            await extra(d.account.id, "/groups", {
                              name,
                              currency: d.account.currency,
                              memberIds: members,
                              contacts,
                            });
                          })
                        ) {
                          setCreating(false);
                          setName("");
                          setContacts([]);
                          setMembers([]);
                        }
                      }}
                    >
                      Create group
                    </Button>
                  </YStack>
                </Card>
              </KeyboardAwareScreen>
            </View>
          </Modal>
          <SearchPicker
            visible={contactsOpen}
            title="Phone contacts"
            options={phoneContacts.map((contact) => ({
              id: contact.phone,
              label: contact.name,
              detail: contact.phone,
            }))}
            selected={contacts.map((contact) => contact.phone)}
            multiple
            onSelect={(phone) => {
              const picked = phoneContacts.find(
                (contact) => contact.phone === phone,
              );
              if (!picked) return;
              setContacts((current) =>
                current.some((contact) => contact.phone === phone)
                  ? current.filter((contact) => contact.phone !== phone)
                  : [...current, picked],
              );
            }}
            onClear={() => {
              setContacts([]);
              setMembers([]);
            }}
            onClose={() => setContactsOpen(false)}
          />
          <SearchPicker
            visible={savedContactsOpen}
            title="Saved contacts"
            options={d.savedContacts.map((contact) => ({
              id: contact.id,
              label: personName(d, contact.id),
              detail: contact.phone,
            }))}
            selected={members}
            multiple
            onSelect={(id) =>
              setMembers((current) =>
                current.includes(id)
                  ? current.filter((memberId) => memberId !== id)
                  : [...current, id],
              )
            }
            onClear={() => setMembers([])}
            onClose={() => setSavedContactsOpen(false)}
          />
          {d.ledgers
            .filter((ledger) => !!ledger.deleted === showDeleted)
            .sort(
              (a, b) =>
                groupUpdatedAt(d, b.id, b.updatedAt) -
                  groupUpdatedAt(d, a.id, a.updatedAt) ||
                a.id.localeCompare(b.id),
            )
            .map((l) => {
              const visual = groupStyle(l.groupId);
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ledger ${l.name}`}
                  onPress={() => router.push(`/group/${l.id}` as any)}
                >
                  <Card
                    style={{
                      padding: 10,
                      borderLeftWidth: 4,
                      borderLeftColor: visual.accent,
                      backgroundColor: c.card,
                    }}
                  >
                    <XStack gap={10} alignItems="flex-start">
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 12,
                          backgroundColor: visual.background,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={visual.icon} color="#1E293B" size={20} />
                      </View>
                      <YStack flex={1} minWidth={0} gap={6}>
                        <XStack
                          justifyContent="space-between"
                          alignItems="flex-start"
                          gap={8}
                        >
                          <Heading size={16} flex={1} minWidth={0}>
                            {l.name}
                          </Heading>
                          <Label muted size={10}>
                            {l.currency}
                          </Label>
                        </XStack>
                        {!!l.description &&
                          l.description.trim() !==
                            "A little better, together." && (
                            <Label muted size={11} numberOfLines={2}>
                              {l.description}
                            </Label>
                          )}
                        <XStack gap={8} alignItems="center" flexWrap="wrap">
                          <XStack gap={-4}>
                            {l.members.slice(0, 4).map((m) => (
                              <Avatar
                                key={m.id}
                                name={personName(d, m.id)}
                                avatar={m.avatar}
                                size={27}
                              />
                            ))}
                          </XStack>
                          <Label muted size={11}>
                            {l.members.length}{" "}
                            {l.members.length === 1 ? "member" : "members"}
                          </Label>
                        </XStack>
                      </YStack>
                      <Icon name="chevron" size={15} color={c.muted} />
                    </XStack>
                  </Card>
                </Pressable>
              );
            })}
          {!d.ledgers.some((ledger) => !!ledger.deleted === showDeleted) && (
            <Empty
              title={
                showDeleted ? "No deleted groups" : "Start something together"
              }
              detail={
                showDeleted
                  ? "Groups you delete remain safely available as read-only history."
                  : "Create a group for your home, a trip, or the next dinner."
              }
            />
          )}
          <Button secondary onPress={() => setShowDeleted((value) => !value)}>
            {showDeleted ? "Back to your groups" : "View deleted groups"}
          </Button>
        </YStack>
      )}
    </DataScreen>
  );
}
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    router = useRouter(),
    c = useColors(),
    action = useAction(),
    { width, fontScale } = useWindowDimensions(),
    [simplified, setSimplified] = useState(false),
    [view, setView] = useState<"records" | "balances">("records"),
    [membersOpen, setMembersOpen] = useState(false),
    [addingMember, setAddingMember] = useState(false),
    [availableContacts, setAvailableContacts] = useState<
      { name: string; phone: string }[]
    >([]),
    [pendingContacts, setPendingContacts] = useState<string[]>([]),
    [memberContactsOpen, setMemberContactsOpen] = useState(false),
    [memberSearch, setMemberSearch] = useState(""),
    [deleteGroupOpen, setDeleteGroupOpen] = useState(false),
    [leaveGroupOpen, setLeaveGroupOpen] = useState(false),
    [removeMember, setRemoveMember] = useState<{
      id: string;
      name: string;
    } | null>(null);
  return (
    <DataScreen>
      {(d, refresh, refreshing) => {
        const l = d.ledgers.find((l) => l.id === id);
        if (!l)
          return (
            <Empty
              title="Ledger unavailable"
              detail="Switch accounts or ask an owner to add you."
            />
          );
        const debts = l.deleted
          ? []
          : d.obligations.filter((o) => o.ledgerId === id);
        const balances = simplified
          ? simplifyBalances(debts, l.currency)
          : debts
              .filter((o) => o.remainingMinor > 0)
              .map((o) => ({ ...o, amountMinor: o.remainingMinor }));
        const personalByMember = [
          ...d.transactions
            .filter(
              (transaction) =>
                transaction.ledgerId === id &&
                transaction.type === "PERSONAL_EXPENSE",
            )
            .reduce((totals, transaction) => {
              totals.set(
                transaction.sourceId,
                (totals.get(transaction.sourceId) ?? 0) +
                  transaction.amountMinor,
              );
              return totals;
            }, new Map<string, number>()),
        ];
        const name = (id: string) => personName(d, id);
        const visual = groupStyle(l.groupId);
        const narrow = width / Math.max(1, fontScale) < 400;
        const shellInset = width >= 1050 ? 36 : width < 360 ? 14 : 20;
        const currentMember = l.members.find(
          (member) => member.id === d.account.id,
        );
        const canManageMembers =
          currentMember?.role === "OWNER" || currentMember?.role === "ADMIN";
        const visibleMembers = l.members.filter((member) =>
          name(member.id)
            .toLowerCase()
            .includes(memberSearch.trim().toLowerCase()),
        );
        return (
          <YStack gap={16} paddingBottom={88} minHeight={620}>
            <View
              style={{
                borderRadius: 20,
                overflow: "hidden",
                padding: 20,
                backgroundColor: visual.accent,
                gap: 16,
              }}
            >
              <HeroBackdrop animated={false} />
              <XStack gap={12} alignItems="flex-start">
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.14)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={visual.icon} size={22} color="#FFFFFF" />
                </View>
                <YStack flex={1} minWidth={0} gap={3}>
                  <Label size={11} bold color="rgba(224,231,255,0.85)" letterSpacing={1.1}>
                    {`GROUP · ${l.currency}`}
                  </Label>
                  <Label bold size={22} color="#FFFFFF" numberOfLines={2}>
                    {l.name}
                  </Label>
                  {!!l.description &&
                    l.description.trim() !== "A little better, together." && (
                      <Label size={12} color="rgba(255,255,255,0.78)" numberOfLines={2}>
                        {l.description}
                      </Label>
                    )}
                </YStack>
                {!l.deleted && (
                  <XStack gap={6}>
                    {(
                      [
                        {
                          icon: "link" as const,
                          label: "Create group invite link",
                          onPress: () =>
                            void action.run(async () => {
                              const invite = await extra(
                                d.account.id,
                                `/groups/${l.groupId}/invites`,
                                {},
                              );
                              const url = `${API_URL}/g/${invite.token}`;
                              const wa = whatsappGroupInvite({
                                groupName: l.name,
                                inviterName: d.account.name,
                                joinLink: url,
                              });
                              const canWa = await Linking.canOpenURL("whatsapp://send");
                              if (canWa) await Linking.openURL(wa.url);
                              else await Share.share({ message: wa.message });
                            }, "Invite link ready to share"),
                        },
                        {
                          icon: "settings" as const,
                          label: "Group settings",
                          onPress: () => setMembersOpen(true),
                        },
                      ]
                    ).map((b) => (
                      <Pressable
                        key={b.icon}
                        accessibilityRole="button"
                        accessibilityLabel={b.label}
                        disabled={action.busy}
                        onPress={b.onPress}
                        style={({ pressed }) => ({
                          width: 36,
                          height: 36,
                          borderRadius: 11,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: pressed
                            ? "rgba(255,255,255,0.24)"
                            : "rgba(255,255,255,0.12)",
                        })}
                      >
                        <Icon name={b.icon} size={16} color="#FFFFFF" />
                      </Pressable>
                    ))}
                  </XStack>
                )}
              </XStack>
              <XStack gap={10}>
                {(() => {
                  const spent = d.transactions
                    .filter((t) => t.ledgerId === id && t.type === "SHARED_EXPENSE" && t.status === "SETTLED")
                    .reduce((sum, t) => sum + t.amountMinor, 0);
                  const net = debts.reduce(
                    (sum, o) =>
                      sum +
                      (o.creditorId === d.account.id ? o.remainingMinor : 0) -
                      (o.debtorId === d.account.id ? o.remainingMinor : 0),
                    0,
                  );
                  return (
                    [
                      { label: "Group spend", value: money(spent, l.currency), color: "#FFFFFF" },
                      {
                        label: net > 0 ? "You get back" : net < 0 ? "You owe" : "Your balance",
                        value: net ? money(Math.abs(net), l.currency) : "Settled",
                        color: net > 0 ? "#A7F3D0" : net < 0 ? "#FECACA" : "#FFFFFF",
                      },
                    ] as const
                  ).map((tile) => (
                    <View
                      key={tile.label}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: "rgba(255,255,255,0.12)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.16)",
                        gap: 2,
                      }}
                    >
                      <Label size={12} color="rgba(255,255,255,0.75)">
                        {tile.label}
                      </Label>
                      <Label bold size={17} color={tile.color} numberOfLines={1} adjustsFontSizeToFit>
                        {tile.value.replace(/\.00$/, "")}
                      </Label>
                    </View>
                  ));
                })()}
              </XStack>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View group members"
                onPress={() => setMembersOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <XStack>
                  {l.members.slice(0, 5).map((member, index) => (
                    <View
                      key={member.id}
                      style={{
                        marginLeft: index ? -10 : 0,
                        borderRadius: 16,
                        borderWidth: 2,
                        borderColor: "#4338CA",
                      }}
                    >
                      <Avatar name={name(member.id)} size={28} />
                    </View>
                  ))}
                </XStack>
                <Label bold size={12} color="#FFFFFF">
                  {l.members.length} {l.members.length === 1 ? "member" : "members"}
                </Label>
                <Icon name="chevron" size={14} color="rgba(255,255,255,0.75)" />
              </Pressable>
            </View>
            {l.deleted && (
              <Notice>This group is deleted. Its history is read-only.</Notice>
            )}
            {!!action.error && <Notice error>{action.error}</Notice>}
            <XStack
              backgroundColor={c.card}
              borderRadius={12}
              padding={4}
              borderWidth={1}
              borderColor={c.line}
            >
              {(["records", "balances"] as const).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setView(item)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 9,
                    borderRadius: 9,
                    backgroundColor: view === item ? c.accentSoft : "transparent",
                  }}
                >
                  <Label
                    bold
                    size={12}
                    color={view === item ? c.accent : c.muted}
                  >
                    {item === "records" ? "Activity" : "Balances"}
                  </Label>
                </Pressable>
              ))}
            </XStack>
            {view === "records" ? (
              <YStack gap={8}>
                <XStack
                  justifyContent="space-between"
                  alignItems="center"
                  gap={8}
                  flexWrap="wrap"
                >
                  <Heading size={17} flexShrink={1}>
                    All activity
                  </Heading>
                  <XStack gap={6} flexWrap="wrap" alignItems="center">
                    <IconButton
                      name="refresh"
                      label="Refresh group transactions"
                      disabled={refreshing}
                      onPress={() =>
                        void action.run(async () => {
                          const result = await refresh();
                          if (result.error) throw result.error;
                        }, "Group activity is up to date")
                      }
                    />
                    <Button
                      secondary
                      compact
                      onPress={() => router.push(`/group/${id}/changes` as any)}
                    >
                      Group changes
                    </Button>
                  </XStack>
                </XStack>
                {d.transactions.some((t) => t.ledgerId === id) && (
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
                    {d.transactions
                      .filter((t) => t.ledgerId === id)
                      .map((t, index, rows) => (
                        <TransactionRow
                          key={t.id}
                          data={d}
                          transaction={t}
                          showCreator
                          previousOccurredAt={rows[index - 1]?.occurredAt}
                          last={index === rows.length - 1}
                        />
                      ))}
                  </View>
                )}
                {!d.transactions.some((t) => t.ledgerId === id) && (
                  <Empty
                    title="No records yet"
                    detail="Add the first shared transaction."
                  />
                )}
              </YStack>
            ) : (
              <YStack gap={12}>
                <XStack
                  justifyContent="space-between"
                  alignItems="center"
                  gap={8}
                  flexWrap="wrap"
                >
                  <Heading size={17}>Who owes who</Heading>
                  <Chip
                    selected={simplified}
                    onPress={() => setSimplified(!simplified)}
                  >
                    {simplified ? "Original records" : "Simplify transaction"}
                  </Chip>
                </XStack>
                {simplified && (
                  <Label muted size={11}>
                    Preview only. Your original records stay unchanged.
                  </Label>
                )}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{
                    backgroundColor: c.card,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: c.line,
                  }}
                  contentContainerStyle={{ paddingHorizontal: 14 }}
                >
                  {balances.map((o, i) => (
                    <XStack
                      key={`${o.debtorId}-${o.creditorId}-${i}`}
                      alignItems="center"
                      paddingVertical={12}
                      gap={12}
                      borderBottomWidth={i === balances.length - 1 ? 0 : 1}
                      borderBottomColor={c.line}
                    >
                      <XStack>
                        <Avatar name={name(o.debtorId)} size={30} />
                        <View style={{ marginLeft: -8, borderRadius: 17, borderWidth: 2, borderColor: c.card }}>
                          <Avatar name={name(o.creditorId)} size={30} />
                        </View>
                      </XStack>
                      <YStack flex={1} minWidth={0} gap={2}>
                        <Label size={13}>
                          <Label bold size={13}>{name(o.debtorId)}</Label> owes{" "}
                          <Label bold size={13}>{name(o.creditorId)}</Label>
                        </Label>
                        {o.debtorId === d.account.id && (
                          <Label muted size={11}>
                            You can settle this balance
                          </Label>
                        )}
                      </YStack>
                      <YStack
                        alignItems="flex-end"
                        gap={6}
                        flexShrink={1}
                        maxWidth="53%"
                      >
                        <Label bold textAlign="right">
                          {money(o.amountMinor, l.currency)}
                        </Label>
                        {o.debtorId === d.account.id && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Settle ${name(o.creditorId)}`}
                            onPress={() =>
                              router.push({
                                pathname: "/settle",
                                params: {
                                  view: "pay",
                                  ledger: id,
                                  creditor: o.creditorId,
                                  original: simplified ? undefined : "1",
                                  amount: String(
                                    o.amountMinor /
                                      10 ** currencyDigits(l.currency),
                                  ),
                                },
                              })
                            }
                            style={({ pressed }) => ({
                              minHeight: 44,
                              borderRadius: 17,
                              paddingHorizontal: 12,
                              backgroundColor: c.soft,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              opacity: pressed ? 0.82 : 1,
                            })}
                          >
                            <Label bold size={12} color={c.primary}>
                              Settle
                            </Label>
                            <Icon name="arrow" size={14} color={c.primary} />
                          </Pressable>
                        )}
                      </YStack>
                    </XStack>
                  ))}
                  {!balances.length && (
                    <Label muted>Everyone is settled up.</Label>
                  )}
                  {!!personalByMember.length && (
                    <YStack gap={8} paddingTop={14}>
                      <Heading size={16}>Personal expenses by member</Heading>
                      <Label muted size={11}>
                        These records have no split and do not affect who owes
                        who.
                      </Label>
                      {personalByMember.map(([memberId, amountMinor]) => (
                        <XStack
                          key={memberId}
                          justifyContent="space-between"
                          gap={8}
                          paddingVertical={8}
                        >
                          <Label flex={1} minWidth={0}>
                            {name(memberId)}
                          </Label>
                          <Label
                            bold
                            flexShrink={1}
                            maxWidth="48%"
                            textAlign="right"
                          >
                            {money(amountMinor, l.currency)}
                          </Label>
                        </XStack>
                      ))}
                    </YStack>
                  )}
                </ScrollView>
              </YStack>
            )}
            {!l.deleted && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
                onPress={() =>
                  router.push({ pathname: "/add", params: { ledger: id } })
                }
                style={{
                  position: "absolute",
                  right: 2,
                  bottom: 4,
                  minHeight: 54,
                  maxWidth: narrow ? "85%" : undefined,
                  paddingHorizontal: 18,
                  borderRadius: 18,
                  backgroundColor: "#4338CA",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  shadowColor: "#26214A",
                  shadowOpacity: 0.2,
                  shadowRadius: 12,
                  elevation: 8,
                }}
              >
                <Icon name="plus" color="#FFFFFF" size={20} />
                <Label color="#FFFFFF" bold flexShrink={1}>
                  Add transaction
                </Label>
              </Pressable>
            )}
            <Modal
              visible={membersOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setMembersOpen(false)}
            >
              <Pressable
                onPress={() => setMembersOpen(false)}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(20,22,25,0.55)",
                  alignItems: "flex-end",
                }}
              >
                <Pressable
                  onPress={() => {}}
                  style={{
                    backgroundColor: c.card,
                    borderTopLeftRadius: 24,
                    borderBottomLeftRadius: 24,
                    paddingHorizontal: 16,
                    paddingTop: 30,
                    paddingBottom: 20,
                    width: Math.min(380, width * 0.9),
                    height: "100%",
                  }}
                >
                  <YStack gap={14} flex={1}>
                    <XStack
                      justifyContent="space-between"
                      alignItems="center"
                      gap={8}
                      flexWrap="wrap"
                    >
                      <YStack gap={2} flex={1} minWidth={0}>
                        <Heading size={20}>Group settings</Heading>
                        <Label muted size={11} numberOfLines={1}>
                          {l.name}
                        </Label>
                      </YStack>
                      <IconButton
                        name="close"
                        label="Close group settings"
                        onPress={() => setMembersOpen(false)}
                      />
                    </XStack>
                    {!l.deleted && (
                      <XStack gap={8} flexWrap="wrap">
                        {canManageMembers && (
                          <Button
                            compact
                            icon="plus"
                            loading={addingMember}
                            disabled={action.busy || addingMember}
                            onPress={async () => {
                              setAddingMember(true);
                              try {
                                setAvailableContacts(await chooseContacts());
                                setPendingContacts([]);
                                setMembersOpen(false);
                                setMemberContactsOpen(true);
                              } catch (error) {
                                action.setError(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not add this member.",
                                );
                              } finally {
                                setAddingMember(false);
                              }
                            }}
                          >
                            Add people
                          </Button>
                        )}
                        <Button
                          secondary
                          compact
                          icon="link"
                          disabled={action.busy}
                          onPress={() =>
                            void action.run(async () => {
                              const invite = await extra(
                                d.account.id,
                                `/groups/${l.groupId}/invites`,
                                {},
                              );
                              const wa = whatsappGroupInvite({
                                groupName: l.name,
                                inviterName: d.account.name,
                                joinLink: `${API_URL}/g/${invite.token}`,
                              });
                              const canWa = await Linking.canOpenURL("whatsapp://send");
                              if (canWa) await Linking.openURL(wa.url);
                              else await Share.share({ message: wa.message });
                            }, "Invite link ready to share")
                          }
                        >
                          Invite link
                        </Button>
                      </XStack>
                    )}
                    <Heading size={15}>Members · {l.members.length}</Heading>
                    <SearchBar
                      value={memberSearch}
                      onChangeText={setMemberSearch}
                      placeholder="Search members"
                    />
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      style={{ flex: 1 }}
                    >
                      {visibleMembers.map((m) => (
                        <XStack
                          key={m.id}
                          alignItems="center"
                          gap={10}
                          paddingVertical={9}
                        >
                          <Avatar name={name(m.id)} avatar={m.avatar} />
                          <YStack flex={1} minWidth={0}>
                            <Label bold>{name(m.id)}</Label>
                            <Label muted size={10}>
                              {m.role.toLowerCase()}
                            </Label>
                          </YStack>
                          {canManageMembers &&
                            !l.deleted &&
                            m.id !== d.account.id &&
                            m.role !== "OWNER" && (
                              <Button
                                secondary
                                compact
                                disabled={action.busy}
                                onPress={() => {
                                  setMembersOpen(false);
                                  setRemoveMember({
                                    id: m.id,
                                    name: name(m.id),
                                  });
                                }}
                              >
                                Remove
                              </Button>
                            )}
                        </XStack>
                      ))}
                    </ScrollView>
                    {!l.deleted && currentMember?.role !== "OWNER" && (
                      <Button
                        secondary
                        icon="logout"
                        onPress={() => {
                          setMembersOpen(false);
                          setLeaveGroupOpen(true);
                        }}
                      >
                        Leave group
                      </Button>
                    )}
                    {!l.deleted && currentMember?.role === "OWNER" && (
                      <Button
                        secondary
                        icon="trash"
                        onPress={() => {
                          setMembersOpen(false);
                          setDeleteGroupOpen(true);
                        }}
                        style={{ backgroundColor: c.rose }}
                      >
                        Delete group
                      </Button>
                    )}
                  </YStack>
                </Pressable>
              </Pressable>
            </Modal>
            <SearchPicker
              visible={memberContactsOpen}
              title="Add phone contacts"
              options={availableContacts.map((contact) => ({
                id: contact.phone,
                label: contact.name,
                detail: contact.phone,
              }))}
              selected={pendingContacts}
              multiple
              onSelect={(phone) =>
                setPendingContacts((current) =>
                  current.includes(phone)
                    ? current.filter((item) => item !== phone)
                    : [...current, phone],
                )
              }
              onClear={() => setPendingContacts([])}
              onClose={() => {
                setMemberContactsOpen(false);
                setMembersOpen(true);
                const selectedContacts = availableContacts.filter((contact) =>
                  pendingContacts.includes(contact.phone),
                );
                if (selectedContacts.length)
                  void action.run(
                    () =>
                      extra(d.account.id, `/groups/${l.groupId}/members`, {
                        memberIds: [],
                        contacts: selectedContacts,
                      }),
                    `${selectedContacts.length} member${selectedContacts.length === 1 ? "" : "s"} added`,
                  );
              }}
            />
            <ActionDialog
              visible={leaveGroupOpen}
              icon="logout"
              title="Leave this group?"
              detail="You will lose access to the group. Settle any outstanding balance first."
              onClose={() => setLeaveGroupOpen(false)}
              actions={[
                {
                  label: "Cancel",
                  secondary: true,
                  onPress: () => setLeaveGroupOpen(false),
                },
                {
                  label: "Leave group",
                  destructive: true,
                  loading: action.busy,
                  onPress: () => {
                    setLeaveGroupOpen(false);
                    void action.run(async () => {
                      await extra(
                        d.account.id,
                        `/groups/${l.groupId}/leave`,
                        {},
                      );
                      router.replace("/groups");
                    }, "You left the group");
                  },
                },
              ]}
            />
            <ActionDialog
              visible={deleteGroupOpen}
              icon="trash"
              title="Delete this group?"
              detail="Choose whether its transactions should remain in your history. The deleted group becomes read-only and hidden."
              onClose={() => setDeleteGroupOpen(false)}
              actions={[
                {
                  label: "Cancel",
                  secondary: true,
                  onPress: () => setDeleteGroupOpen(false),
                },
                {
                  label: "Keep transactions",
                  secondary: true,
                  loading: action.busy,
                  onPress: () => {
                    setDeleteGroupOpen(false);
                    void action.run(
                      () =>
                        extra(
                          d.account.id,
                          `/groups/${l.groupId}`,
                          { deleteTransactions: false },
                          "DELETE",
                        ),
                      "Group deleted. Transactions were kept.",
                    );
                  },
                },
                {
                  label: "Delete all",
                  destructive: true,
                  loading: action.busy,
                  onPress: () => {
                    setDeleteGroupOpen(false);
                    void action.run(
                      () =>
                        extra(
                          d.account.id,
                          `/groups/${l.groupId}`,
                          { deleteTransactions: true },
                          "DELETE",
                        ),
                      "Group and its transactions were deleted.",
                    );
                  },
                },
              ]}
            />
            <ActionDialog
              visible={!!removeMember}
              icon="groups"
              title="Remove member?"
              detail={`${removeMember?.name ?? "This member"} will lose access. Past records stay visible.`}
              onClose={() => {
                setRemoveMember(null);
                setMembersOpen(true);
              }}
              actions={[
                {
                  label: "Cancel",
                  secondary: true,
                  onPress: () => {
                    setRemoveMember(null);
                    setMembersOpen(true);
                  },
                },
                {
                  label: "Remove",
                  destructive: true,
                  loading: action.busy,
                  onPress: () => {
                    const member = removeMember;
                    setRemoveMember(null);
                    if (!member) return;
                    void action.run(
                      () =>
                        extra(
                          d.account.id,
                          `/groups/${l.groupId}/members/${member.id}`,
                          undefined,
                          "DELETE",
                        ),
                      `${member.name} removed from the group`,
                    );
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

/** Old server versions wrote raw ids and paise into edit messages. */
function readableChange(message: string, d: Dashboard) {
  const legacy = message.match(
    /^(.*): amount (\d+) → (\d+); group (\S+) → (\S+)$/,
  );
  if (!legacy) return message;
  const [, title, before, after, fromGroup, toGroup] = legacy;
  const name = (gid: string) =>
    gid === "none" ? "no group" : (d.ledgers.find((l) => l.id === gid)?.name ?? "another group");
  const parts = [] as string[];
  if (before !== after)
    parts.push(`amount ${money(Number(before))} → ${money(Number(after))}`);
  if (fromGroup !== toGroup) parts.push(`moved from ${name(fromGroup)} to ${name(toGroup)}`);
  return parts.length ? `${title} edited · ${parts.join(" · ")}` : `${title} was edited`;
}
type ChangeRow = Dashboard["activity"][number] & {
  actorName?: string;
  event?: string;
};
export function GroupChangesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useColors();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const accountId = useSession((s) => s.activeId);
  const [remote, setRemote] = useState<{ key: string; items: ChangeRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const rangeKey = `${id}|${from}|${to}`;
  useEffect(() => {
    if (DEMO || !accountId || !id) return;
    let live = true;
    const zone = "Asia/Kolkata";
    const params = new URLSearchParams();
    if (from) params.set("from", DateTime.fromISO(from, { zone }).startOf("day").toUTC().toISO()!);
    if (to) params.set("to", DateTime.fromISO(to, { zone }).plus({ days: 1 }).startOf("day").toUTC().toISO()!);
    setLoading(true);
    request<{ items: ChangeRow[] }>(`/ledgers/${id}/changes?${params}`, { accountId })
      .then((r) => live && setRemote({ key: rangeKey, items: r.items }))
      .catch(() => live && setRemote(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [rangeKey, accountId]);
  return (
    <DataScreen>
      {(d) => {
        const group = d.ledgers.find((ledger) => ledger.id === id);
        if (!group)
          return (
            <Empty
              title="Group unavailable"
              detail="You may no longer have access."
            />
          );
        const istDay = (iso: string) =>
          DateTime.fromISO(iso).setZone("Asia/Kolkata").toISODate()!;
        const rows: ChangeRow[] =
          remote && remote.key === rangeKey
            ? remote.items
            : d.activity.filter((entry) => {
                if (entry.ledgerId !== id) return false;
                const day = istDay(entry.createdAt);
                return (!from || day >= from) && (!to || day <= to);
              });
        const invalidRange = !!from && !!to && from > to;
        return (
          <YStack gap={16} maxWidth={720} width="100%" alignSelf="center">
            <Button secondary compact icon="back" onPress={() => router.back()}>
              Back to group
            </Button>
            <PageHero
              eyebrow={group.name}
              title="Group changes"
              subtitle="Member and group updates"
            />
            <XStack gap={10} flexWrap="wrap">
              <YStack flex={1} minWidth={150}>
                <DatePicker
                  label="From"
                  value={from}
                  onChange={setFrom}
                  clearable
                />
              </YStack>
              <YStack flex={1} minWidth={150}>
                <DatePicker label="To" value={to} onChange={setTo} clearable />
              </YStack>
            </XStack>
            <YStack gap={0}>
              {rows.map((entry, index) => (
                <XStack
                  key={entry.id}
                  gap={12}
                  paddingVertical={12}
                  borderBottomWidth={index === rows.length - 1 ? 0 : 1}
                  borderBottomColor={c.line}
                >
                  <Icon name="activity" size={17} color="#64748B" />
                  <YStack flex={1} gap={3}>
                    <Label>{readableChange(entry.message, d)}</Label>
                    <Label muted size={10}>
                      {entry.actorName ?? "A member"} ·{" "}
                      {entry.event?.toLowerCase().replace(/_/g, " ")}
                    </Label>
                  </YStack>
                  <Label muted size={10} textAlign="right">
                    {new Date(entry.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Label>
                </XStack>
              ))}
              {invalidRange && (
                <Notice error>The start date is after the end date.</Notice>
              )}
              {loading && !rows.length && <Label muted>Loading changes…</Label>}
              {!rows.length && !loading && !invalidRange && (
                <Empty
                  title="No changes found"
                  detail={from || to ? "Try a wider date range." : "Nothing has changed in this group yet."}
                />
              )}
            </YStack>
          </YStack>
        );
      }}
    </DataScreen>
  );
}
