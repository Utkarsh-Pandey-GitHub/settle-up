import { chooseContact, chooseContacts } from "../services/device";
import { DateTime } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  ScrollView,
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
  type SplitMethod,
} from "@settleup/domain";
import { BillEditor, type BillPhoto, type BillLine } from "./bill";
import { repository, uuid, extra } from "../data/repository";
import { personName } from "../data/people";
import {
  outstandingByPerson,
  simplifiedIncoming,
  simplifiedOutgoing,
} from "../data/balances";
import { useAction } from "../data/hooks";
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
        .filter((id) => !includeCreator || id !== creatorId) ?? [],
    ),
    [chosenPayer, setChosenPayer] = useState(editing?.sourceId ?? creatorId),
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
    [newTagColor, setNewTagColor] = useState("#8252E3"),
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
  const [moreOptions, setMoreOptions] = useState(false);
  const [showShares, setShowShares] = useState(false);
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
        : DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd HH:mm"),
    },
  });
  const ledger = d.ledgers.find((l) => l.id === ledgerId);
  const amount = watch("amount");
  const splitMembers = [...(includeCreator ? [creatorId] : []), ...selected];
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
    if (includeCreator && contactId === creatorId) return;
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
          payerId: type === "SHARED_EXPENSE" ? payerId : undefined,
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
                      value={memberName(payerId)}
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
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: moreOptions }}
                onPress={() => setMoreOptions(!moreOptions)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                }}
              >
                <Icon
                  name={moreOptions ? "up" : "down"}
                  size={16}
                  color={c.primary}
                />
                <Label bold size={13} flex={1}>
                  {moreOptions ? "Fewer options" : "More options"}
                </Label>
                {!moreOptions && (
                  <Label muted size={11}>
                    Tags, icon, note
                  </Label>
                )}
              </Pressable>
              {moreOptions && (
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
                            color={
                              transactionIcon === name ? c.primary : c.muted
                            }
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
              .filter((member) => !includeCreator || member.id !== creatorId)
              .map((member) => ({
                id: member.id,
                label: memberName(member.id),
              }))}
            selected={selected}
            multiple
            selectionIcon={null}
            footer={
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
                        contact.phone?.replace(/\D/g, "").slice(-10) === digits,
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
            options={payerOptions.map((id) => ({
              id,
              label: memberName(id),
              detail: id === creatorId ? "Transaction creator" : undefined,
            }))}
            selected={[payerId]}
            selectionIcon={null}
            onSelect={setChosenPayer}
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
                        "#8252E3",
                        "#ECA54C",
                        "#8994D6",
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
        <Label size={13} bold numberOfLines={2}>
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
    [key, setKey] = useState(uuid());
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
            <YStack gap={22} maxWidth={600} width="100%" alignSelf="center">
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
          <YStack gap={22} maxWidth={720} width="100%" alignSelf="center">
            <Heading>Settle debts</Heading>
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
            {receiving ? (
              <Card>
                <YStack gap={12}>
                  <Heading size={19}>Who owes you</Heading>
                  <Label muted size={12}>
                    Each group or loan is netted so a person appears in one
                    direction only.
                  </Label>
                  {incoming.map((balance) => (
                    <XStack key={balance.id} gap={10} alignItems="center">
                      <YStack flex={1} minWidth={0}>
                        <Label bold>{personName(d, balance.personId)}</Label>
                        <Label muted size={11}>
                          {scopeName(balance.ledgerId)}
                        </Label>
                      </YStack>
                      <Label
                        bold
                        flexShrink={1}
                        maxWidth="48%"
                        textAlign="right"
                      >
                        {money(balance.amountMinor, balance.currency)}
                      </Label>
                    </XStack>
                  ))}
                  {!incoming.length && (
                    <Empty
                      title="No one owes you"
                      detail="There are no outstanding balances to receive."
                    />
                  )}
                </YStack>
              </Card>
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
                                selectedId === o.id ? "#AA94D5" : c.line,
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
                                color="#7B63B0"
                              />
                            </XStack>
                          </Pressable>
                        );
                      })}
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
                              },
                            );
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
  { icon: "plane", accent: "#6652A3", background: "#F0ECF8" },
  { icon: "home", accent: "#9981BF", background: "#EEE8F8" },
  { icon: "coffee", accent: "#B9A7D5", background: "#F2EEF9" },
] as const;
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
        <YStack gap={22}>
          <XStack justifyContent="space-between" flexWrap="wrap" gap={12}>
            <YStack maxWidth="100%" flexShrink={1}>
              <Heading>Your groups</Heading>
              <Label muted>Shared spending, all in one place.</Label>
            </YStack>
            <Button icon="plus" onPress={() => setCreating(!creating)}>
              Create a group
            </Button>
          </XStack>
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
                        <Icon name={visual.icon} color="#555269" size={20} />
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
    { width, height, fontScale } = useWindowDimensions(),
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
            <YStack
              gap={14}
              padding={18}
              borderRadius={24}
              backgroundColor={c.card}
            >
              <XStack gap={12} alignItems="center">
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: visual.background,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={visual.icon} size={22} color="#555269" />
                </View>
                <YStack flex={1} minWidth={0} gap={5} alignItems="flex-start">
                  <Heading size={23}>{l.name}</Heading>
                  <Label muted size={12}>
                    {l.description &&
                    l.description.trim() !== "A little better, together."
                      ? `${l.description} · `
                      : ""}
                    {l.currency}
                  </Label>
                </YStack>
              </XStack>
              <XStack gap={8} alignItems="center">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View group members"
                  onPress={() => setMembersOpen(true)}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    borderRadius: 16,
                    backgroundColor: c.mint,
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 9,
                  }}
                >
                  <Icon name="groups" size={18} color={c.primary} />
                  <YStack flex={1} minWidth={0} gap={1}>
                    <Label bold size={13}>
                      Members
                    </Label>
                    <Label muted size={11}>
                      {l.members.length}{" "}
                      {l.members.length === 1 ? "person" : "people"} in this
                      group
                    </Label>
                  </YStack>
                  <Icon name="chevron" size={15} color={c.muted} />
                </Pressable>
                {currentMember?.role === "OWNER" && !l.deleted && (
                  <Button
                    secondary
                    compact
                    icon="trash"
                    onPress={() => setDeleteGroupOpen(true)}
                    style={{ minHeight: 52, paddingHorizontal: 12 }}
                  >
                    Delete
                  </Button>
                )}
              </XStack>
            </YStack>
            {l.deleted && (
              <Notice>This group is deleted. Its history is read-only.</Notice>
            )}
            {!!action.error && <Notice error>{action.error}</Notice>}
            <XStack backgroundColor={c.soft} borderRadius={15} padding={4}>
              {(["records", "balances"] as const).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setView(item)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: view === item ? c.card : "transparent",
                  }}
                >
                  <Label
                    bold
                    size={12}
                    color={view === item ? c.text : c.muted}
                  >
                    {item === "records" ? "All transactions" : "Who owes who"}
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
                  <Heading size={19} flexShrink={1}>
                    All activity
                  </Heading>
                  <XStack gap={6} flexWrap="wrap" alignItems="center">
                    <IconButton
                      name="sync"
                      label="Refresh group transactions"
                      disabled={refreshing}
                      onPress={async () => {
                        action.setError("");
                        const result = await refresh();
                        if (result.error) action.setError(result.error.message);
                      }}
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
                {d.transactions
                  .filter((t) => t.ledgerId === id)
                  .map((t, index, rows) => (
                    <TransactionRow
                      key={t.id}
                      data={d}
                      transaction={t}
                      showCreator
                      last={index === rows.length - 1}
                    />
                  ))}
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
                  <Heading size={19}>Who owes who</Heading>
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
                <ScrollView showsVerticalScrollIndicator={false}>
                  {balances.map((o, i) => (
                    <XStack
                      key={`${o.debtorId}-${o.creditorId}-${i}`}
                      alignItems="center"
                      paddingVertical={12}
                      gap={12}
                      borderBottomWidth={i === balances.length - 1 ? 0 : 1}
                      borderBottomColor={c.line}
                    >
                      <YStack flex={1} minWidth={0} gap={2}>
                        <Label size={13}>
                          {name(o.debtorId)} → {name(o.creditorId)}
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
                  backgroundColor: "#59458F",
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
                  justifyContent: "center",
                  padding: 20,
                }}
              >
                <Pressable
                  onPress={() => {}}
                  style={{
                    backgroundColor: c.card,
                    borderRadius: 22,
                    padding: 16,
                    width: "100%",
                    maxWidth: 520,
                    alignSelf: "center",
                    maxHeight: height - 48,
                    height: Math.min(520, height - 48),
                  }}
                >
                  <YStack gap={14}>
                    <XStack
                      justifyContent="space-between"
                      alignItems="center"
                      gap={8}
                      flexWrap="wrap"
                    >
                      <Heading size={20}>Members</Heading>
                      <XStack gap={7}>
                        {canManageMembers && !l.deleted && (
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
                            Add
                          </Button>
                        )}
                        <Button
                          secondary
                          compact
                          onPress={() => setMembersOpen(false)}
                        >
                          Done
                        </Button>
                      </XStack>
                    </XStack>
                    <SearchBar
                      value={memberSearch}
                      onChangeText={setMemberSearch}
                      placeholder="Search members"
                    />
                    <ScrollView showsVerticalScrollIndicator={false}>
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

export function GroupChangesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useColors();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
        const rows = d.activity.filter((entry) => {
          if (entry.ledgerId !== id) return false;
          const day = entry.createdAt.slice(0, 10);
          return (!from || day >= from) && (!to || day <= to);
        });
        return (
          <YStack gap={16} maxWidth={720} width="100%" alignSelf="center">
            <Button secondary compact icon="back" onPress={() => router.back()}>
              Back to group
            </Button>
            <YStack gap={4}>
              <Heading>Group changes</Heading>
              <Label muted>{group.name} · member and group updates</Label>
            </YStack>
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
                  <Icon name="activity" size={17} color="#7770A4" />
                  <YStack flex={1} gap={3}>
                    <Label>{entry.message}</Label>
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
              {!rows.length && (
                <Empty
                  title="No changes found"
                  detail="Try a wider date range."
                />
              )}
            </YStack>
          </YStack>
        );
      }}
    </DataScreen>
  );
}
