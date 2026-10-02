import { chooseContact } from "../services/device";
import { DateTime } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import { View, Alert, Modal, Pressable, ScrollView } from "react-native";
import { XStack, YStack } from "tamagui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Dashboard, CreateTransaction } from "@settleup/contracts";
import {
  money,
  parseMoney,
  splitExpense,
  simplifyBalances,
  type SplitMethod,
} from "@settleup/domain";
import { BillEditor, type BillPhoto, type BillLine } from "./bill";
import { repository, uuid, extra } from "../data/repository";
import { useAction } from "../data/hooks";
import { DataScreen, SectionTitle, TransactionRow } from "./overview";
import { KeyboardAwareScreen } from "../components/KeyboardAwareScreen";
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
  type IconName,
} from "../components/ui";
const expenseForm = z.object({
  title: z.string().trim().min(1, "Give this transaction a name.").max(120),
  amount: z.string().min(1, "Enter an amount."),
  notes: z.string().max(2000),
  date: z.string().min(10),
});
export function AddScreen() {
  return (
    <DataScreen>
      {(d) => <ExpenseForm key={d.account.id} data={d} />}
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
    }>(),
    router = useRouter(),
    action = useAction();
  const [ledgerId, setLedgerId] = useState(params.ledger ?? ""),
    [selected, setSelected] = useState<string[]>([]),
    [method, setMethod] = useState<SplitMethod>("EQUAL"),
    [weights, setWeights] = useState<Record<string, string>>({}),
    [tagIds, setTagIds] = useState<string[]>([]),
    [transactionIcon, setTransactionIcon] = useState<IconName>("bag"),
    [billOpen, setBillOpen] = useState(
      params.capture === "bill" ||
        params.bill === "1" ||
        params.bill === "camera",
    ),
    [picker, setPicker] = useState<"ledger" | "participants" | "tags" | null>(
      null,
    ),
    [key, setKey] = useState(uuid());
  const [photo, setPhoto] = useState<BillPhoto | null>(null);
  const [lines, setLines] = useState<BillLine[]>([]);
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
      title: params.title ?? "",
      amount: params.amount ?? "",
      notes: "",
      date: DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd HH:mm"),
    },
  });
  const ledger = d.ledgers.find((l) => l.id === ledgerId);
  const amount = watch("amount");
  const splitMembers = selected.length
    ? [d.account.id, ...selected.filter((id) => id !== d.account.id)]
    : [];
  const type: CreateTransaction["type"] = selected.length
    ? "SHARED_EXPENSE"
    : "PERSONAL_EXPENSE";
  const isExpense = true;
  useEffect(() => {
    setSelected((current) =>
      current.filter((id) =>
        ledger?.members.some((member) => member.id === id),
      ),
    );
  }, [ledgerId]);
  const addFriend = (contactId: string) => {
    const target = ledger?.members.some((member) => member.id === contactId)
      ? ledger
      : d.ledgers.find((group) =>
          group.members.some((member) => member.id === contactId),
        );
    if (!target) {
      Alert.alert(
        "No shared group yet",
        "Add this contact as a member of a group before splitting a transaction with them.",
      );
      return;
    }
    if (ledger && ledger.id !== target.id) {
      Alert.alert(
        "Choose their group",
        `${d.savedContacts.find((contact) => contact.id === contactId)?.name ?? "This contact"} is not a member of ${ledger.name}.`,
      );
      return;
    }
    if (!ledger) setLedgerId(target.id);
    setSelected((current) =>
      current.includes(contactId) ? current : [...current, contactId],
    );
  };
  const allocations = () =>
    splitExpense(
      parseMoney(amount, d.account.currency),
      splitMembers.map((userId) => ({
        userId,
        value:
          method === "EXACT"
            ? parseMoney(weights[userId] || "0", d.account.currency, true)
            : method === "PERCENTAGE"
              ? Math.round(Number(weights[userId] || 0) * 100)
              : Number(weights[userId] || 1),
      })),
      method,
    );
  let preview: ReturnType<typeof allocations> = [];
  let splitError = "";
  if (type === "SHARED_EXPENSE" && amount && splitMembers.length)
    try {
      preview = allocations();
    } catch (e) {
      splitError = (e as Error).message;
    }
  const submit = handleSubmit(async (values) => {
    if (saving.current || scanning) return;
    saving.current = true;
    const ok = await action.run(async () => {
      const amountMinor = parseMoney(values.amount, d.account.currency);
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
        currency: d.account.currency,
        type,
        status: params.pending === "1" ? "PENDING" : "SETTLED",
        occurredAt,
        notes: values.notes,
        icon: transactionIcon,
        ledgerId: ledgerId || undefined,
        tagIds,
        items: isExpense
          ? lines.map((line) => ({
              name: line.name,
              quantity: Number(line.quantity),
              amountMinor:
                parseMoney(
                  line.amount.replace(/^-/, ""),
                  d.account.currency,
                  true,
                ) * (line.amount.startsWith("-") ? -1 : 1),
            }))
          : undefined,
        splitMethod: method,
        participants:
          type === "SHARED_EXPENSE"
            ? splitMembers.map((userId) => ({
                userId,
                value:
                  method === "EXACT"
                    ? parseMoney(
                        weights[userId] || "0",
                        d.account.currency,
                        true,
                      )
                    : method === "PERCENTAGE"
                      ? Math.round(Number(weights[userId] || 0) * 100)
                      : Number(weights[userId] || 1),
              }))
            : [],
      };
      await repository.create(d.account.id, input);
    }, "Expense saved. One less thing to keep in your head.");
    saving.current = false;
    if (ok) {
      setKey(uuid());
      router.replace("/activity");
    }
  });
  return (
    <YStack gap={14} maxWidth={800} width="100%" alignSelf="center">
      <Heading>Add a transaction</Heading>
      <View
        pointerEvents={action.busy ? "none" : "auto"}
        style={{ opacity: action.busy ? 0.72 : 1 }}
      >
        <YStack gap={14}>
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <Label muted flex={1}>
              Add the details or scan a bill.
            </Label>
            {isExpense && (
              <Button
                secondary
                compact
                icon={photo ? "check" : "image"}
                style={{
                  borderWidth: 2,
                  borderColor: "#9B84D6",
                  borderRadius: 12,
                }}
                onPress={() => setBillOpen(true)}
              >
                {photo ? `Bill · ${lines.length} items` : "Add bill"}
              </Button>
            )}
          </XStack>
          <Modal
            visible={isExpense && billOpen}
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
                    currency={d.account.currency}
                    amount={amount}
                    lines={lines}
                    onLines={setLines}
                    onAmount={(value) =>
                      setValue("amount", value, { shouldValidate: true })
                    }
                    photo={photo}
                    onPhoto={setPhoto}
                    onBusy={setScanning}
                    autoCamera={params.bill === "1" || params.bill === "camera"}
                  />
                </YStack>
              </KeyboardAwareScreen>
            </View>
          </Modal>
          <Card style={{ padding: 16 }}>
            <YStack gap={14}>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <Field
                    label={`Amount · ${d.account.currency}`}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.amount?.message}
                    style={{ fontSize: 30, minHeight: 64, padding: 10 }}
                  />
                )}
              />
              <Controller
                control={control}
                name="title"
                render={({ field }) => (
                  <Field
                    label="What was it for?"
                    placeholder="Dinner, groceries, a little adventure…"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.title?.message}
                    style={{ minHeight: 44, padding: 10 }}
                  />
                )}
              />
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <Field
                    label="Date and time"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.date?.message}
                    style={{ minHeight: 44, padding: 10 }}
                  />
                )}
              />
              <YStack gap={8}>
                <Label size={13} bold>
                  Transaction icon
                </Label>
                <XStack gap={7} flexWrap="wrap">
                  {(
                    [
                      "bag",
                      "coffee",
                      "car",
                      "plane",
                      "bolt",
                      "wallet",
                    ] as IconName[]
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
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          transactionIcon === name ? "#E8E3F6" : "transparent",
                        opacity: pressed ? 0.72 : 1,
                      })}
                    >
                      <Icon
                        name={name}
                        size={20}
                        color={transactionIcon === name ? "#59458F" : undefined}
                      />
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
              <XStack gap={10} alignItems="flex-end">
                <YStack flex={1} gap={6}>
                  <Label size={13} bold>
                    Group
                  </Label>
                  <Button
                    secondary
                    icon="groups"
                    onPress={() => setPicker("ledger")}
                  >
                    {ledger?.name ?? "Optional"}
                  </Button>
                </YStack>
                <YStack flex={1} gap={6}>
                  <Label size={13} bold>
                    Tags
                  </Label>
                  <Button secondary onPress={() => setPicker("tags")}>
                    {tagIds.length
                      ? `${tagIds.length} ${tagIds.length === 1 ? "tag" : "tags"}`
                      : "Choose tags"}
                  </Button>
                </YStack>
              </XStack>
              <YStack gap={8}>
                <Label size={13} bold>
                  Friends (optional)
                </Label>
                <XStack gap={8} flexWrap="wrap">
                  <Button
                    secondary
                    icon="groups"
                    onPress={() => setPicker("participants")}
                  >
                    {selected.length
                      ? `${selected.length} ${selected.length === 1 ? "friend" : "friends"}`
                      : "Choose saved friends"}
                  </Button>
                  <Button
                    secondary
                    compact
                    icon="plus"
                    onPress={() =>
                      action.run(async () => {
                        const picked = await chooseContact();
                        if (!picked) return;
                        const digits = picked.phone
                          .replace(/\D/g, "")
                          .slice(-10);
                        const saved = d.savedContacts.find(
                          (contact) =>
                            contact.phone?.replace(/\D/g, "").slice(-10) ===
                            digits,
                        );
                        if (!saved) {
                          Alert.alert(
                            "Add them to a group first",
                            "Create a group with this phone contact, then you can split transactions together.",
                          );
                          return;
                        }
                        addFriend(saved.id);
                      }, "Contact selected")
                    }
                  >
                    Phone contacts
                  </Button>
                </XStack>
                {!!selected.length && (
                  <XStack gap={7} flexWrap="wrap">
                    {selected.map((friendId) => (
                      <Chip
                        key={friendId}
                        selected
                        onPress={() =>
                          setSelected((current) =>
                            current.filter((id) => id !== friendId),
                          )
                        }
                      >
                        {ledger?.members.find(
                          (member) => member.id === friendId,
                        )?.name ?? "Friend"}
                      </Chip>
                    ))}
                  </XStack>
                )}
              </YStack>
              {type === "SHARED_EXPENSE" && (
                <YStack gap={14}>
                  <Label bold>
                    Paid by {d.account.name.split(" ")[0]} · split between
                  </Label>
                  <Button
                    secondary
                    icon="groups"
                    disabled={!ledger}
                    onPress={() => setPicker("participants")}
                  >
                    {selected.length
                      ? `${selected.length + 1} people including you`
                      : "Choose friends"}
                  </Button>
                  <XStack gap={8} flexWrap="wrap">
                    {(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"] as const).map(
                      (m) => (
                        <Chip
                          key={m}
                          selected={method === m}
                          onPress={() => setMethod(m)}
                        >
                          {m.toLowerCase()}
                        </Chip>
                      ),
                    )}
                  </XStack>
                  {method !== "EQUAL" &&
                    splitMembers.map((id) => (
                      <Field
                        key={id}
                        label={`${ledger?.members.find((m) => m.id === id)?.name} · ${method === "EXACT" ? d.account.currency : method === "PERCENTAGE" ? "%" : "shares"}`}
                        value={weights[id] ?? ""}
                        keyboardType="decimal-pad"
                        onChangeText={(value) =>
                          setWeights((w) => ({ ...w, [id]: value }))
                        }
                      />
                    ))}
                  {!!splitError && <Notice error>{splitError}</Notice>}
                  {preview.map((a) => (
                    <XStack justifyContent="space-between" key={a.userId}>
                      <Label muted>
                        {ledger?.members.find((m) => m.id === a.userId)?.name}
                        {a.userId === d.account.id ? " (your share)" : ""}
                      </Label>
                      <Label bold>
                        {money(a.amountMinor, d.account.currency)}
                      </Label>
                    </XStack>
                  ))}
                  <Label size={11} muted>
                    Your share stays in the allocation. Only other members’
                    shares become amounts owed to you.
                  </Label>
                </YStack>
              )}
              <Controller
                control={control}
                name="notes"
                render={({ field }) => (
                  <Field
                    label="A note for later (optional)"
                    multiline
                    placeholder="Anything worth remembering"
                    value={field.value}
                    onChangeText={field.onChange}
                  />
                )}
              />
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
                    ? "Save & split expense"
                    : "Save transaction"}
              </Button>
            </YStack>
          </Card>
          <SearchPicker
            visible={picker === "ledger"}
            title="Groups"
            options={[
              { id: "__personal", label: "No group" },
              ...d.ledgers.map((entry) => ({
                id: entry.id,
                label: entry.name,
                detail: `${entry.members.length} members · ${entry.currency}`,
              })),
            ]}
            selected={[ledgerId || "__personal"]}
            onSelect={(id) => setLedgerId(id === "__personal" ? "" : id)}
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "participants"}
            title="Add friends"
            options={(ledger
              ? ledger.members.filter((member) => member.id !== d.account.id)
              : d.savedContacts.filter((contact) =>
                  d.ledgers.some((group) =>
                    group.members.some((member) => member.id === contact.id),
                  ),
                )
            ).map((member) => ({ id: member.id, label: member.name }))}
            selected={selected}
            multiple
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
        </YStack>
      </View>
    </YStack>
  );
}
export function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    action = useAction(),
    [reason, setReason] = useState("");
  const router = useRouter();
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
        const perform = (name: string) =>
          action.run(async () => {
            if (reason.trim().length < 3)
              throw new Error("Add a short reason for the audit trail.");
            await repository.action(d.account.id, id, name, t.version, reason);
          });
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
                      <XStack justifyContent="space-between" key={a.userId}>
                        <Label>
                          {a.userId === d.account.id
                            ? "You"
                            : (d.savedContacts.find((p) => p.id === a.userId)
                                ?.name ?? "Member")}
                        </Label>
                        <Label bold>{money(a.amountMinor, t.currency)}</Label>
                      </XStack>
                    ))}
                  </>
                )}
              </YStack>
            </Card>
            <Card>
              <YStack gap={16}>
                <Heading size={18}>Keep the story accurate</Heading>
                <Label muted size={12}>
                  Posted records are preserved. To correct an amount, reverse it
                  and create a replacement. Repayments must be reversed before
                  the original expense.
                </Label>
                <Field
                  label="Reason or resolution"
                  placeholder="What changed?"
                  value={reason}
                  onChangeText={setReason}
                />
                {!!action.error && <Notice error>{action.error}</Notice>}
                {!!action.success && <Notice>{action.success}</Notice>}
                <XStack gap={10} flexWrap="wrap">
                  {t.status === "PENDING" && (
                    <Button
                      loading={action.busy}
                      disabled={action.busy}
                      onPress={() => perform("complete")}
                    >
                      Confirm payment completed
                    </Button>
                  )}
                  {["SETTLED", "PENDING_LOAN"].includes(t.status) &&
                    t.type !== "REVERSAL" && (
                      <Button
                        secondary
                        disabled={action.busy}
                        onPress={() => perform("dispute")}
                      >
                        Raise dispute
                      </Button>
                    )}
                  {t.status === "DISPUTED" && (
                    <Button
                      loading={action.busy}
                      disabled={action.busy}
                      onPress={() => perform("resolve")}
                    >
                      Resolve dispute
                    </Button>
                  )}
                  {!["REVERSED", "DISPUTED"].includes(t.status) &&
                    t.type !== "REVERSAL" && (
                      <Button
                        secondary
                        disabled={action.busy}
                        onPress={() => perform("reverse")}
                      >
                        {t.status === "PENDING"
                          ? "Cancel pending entry"
                          : "Reverse entry"}
                      </Button>
                    )}
                  {t.status === "REVERSED" && (
                    <Button
                      onPress={() =>
                        router.push({
                          pathname: "/add",
                          params: {
                            title: t.title,
                            amount: String(t.amountMinor / 100),
                          },
                        })
                      }
                    >
                      Create corrected entry
                    </Button>
                  )}
                </XStack>
              </YStack>
            </Card>
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
  const [receipt, setReceipt] = useState<{
    accountId: string;
    name: string;
    amountMinor: number;
    currency: string;
    date: string;
  } | null>(null);
  const action = useAction(),
    [debtId, setDebtId] = useState(""),
    [amount, setAmount] = useState(""),
    [key, setKey] = useState(uuid());
  return (
    <DataScreen>
      {(d) => {
        const owed = d.obligations.filter(
          (o) => o.debtorId === d.account.id && o.remainingMinor > 0,
        );
        const selected = owed.find((o) => o.id === debtId);
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
                  <Avatar name={receipt.name} size={64} />
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
            <Label muted>
              Record a payment you have actually made. SettleUp does not move
              money.
            </Label>
            <Notice>
              Settle up clears what you owe after you pay someone outside the
              app. Choose the person, confirm the amount you paid, and SettleUp
              will reduce that balance and record the repayment in Transactions.
            </Notice>
            <Card>
              <YStack gap={18}>
                {!owed.length ? (
                  <Empty
                    title="You’re all settled up"
                    detail="No outstanding repayments for this account."
                  />
                ) : (
                  <>
                    <Label bold>Choose a balance to repay</Label>
                    {owed.map((o) => {
                      const person =
                        d.savedContacts.find((p) => p.id === o.creditorId)
                          ?.name ?? "Member";
                      return (
                        <Pressable
                          key={o.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Repay ${person}, ${money(o.remainingMinor, o.currency)}`}
                          accessibilityState={{ selected: debtId === o.id }}
                          onPress={() => {
                            setDebtId(o.id);
                            setAmount(
                              String(
                                o.remainingMinor /
                                  10 **
                                    new Intl.NumberFormat("en", {
                                      style: "currency",
                                      currency: o.currency,
                                    }).resolvedOptions().maximumFractionDigits!,
                              ),
                            );
                            setKey(uuid());
                          }}
                          style={{
                            padding: 16,
                            borderRadius: 17,
                            borderWidth: 1,
                            borderColor: debtId === o.id ? "#AA94D5" : c.line,
                            backgroundColor: debtId === o.id ? c.soft : c.card,
                          }}
                        >
                          <XStack gap={12} alignItems="center">
                            <Avatar name={person} size={44} />
                            <YStack flex={1}>
                              <Label bold>{person}</Label>
                              <Label muted size={11}>
                                {
                                  d.ledgers.find((l) => l.id === o.ledgerId)
                                    ?.name
                                }
                              </Label>
                            </YStack>
                            <Label bold>
                              {money(o.remainingMinor, o.currency)}
                            </Label>
                            <Icon
                              name={debtId === o.id ? "check" : "chevron"}
                              size={18}
                              color="#7B63B0"
                            />
                          </XStack>
                        </Pressable>
                      );
                    })}
                    <Field
                      label="Amount paid"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                    />
                    {!!action.error && <Notice error>{action.error}</Notice>}
                    {!!action.success && <Notice>{action.success}</Notice>}
                    <Button
                      loading={action.busy}
                      disabled={!selected || action.busy}
                      onPress={() =>
                        action.run(async () => {
                          if (!selected) return;
                          await repository.settle(d.account.id, {
                            idempotencyKey: key,
                            ledgerId: selected.ledgerId,
                            debtorId: d.account.id,
                            creditorId: selected.creditorId,
                            amountMinor: parseMoney(amount, selected.currency),
                            currency: selected.currency,
                          });
                          setReceipt({
                            accountId: d.account.id,
                            name:
                              d.savedContacts.find(
                                (p) => p.id === selected.creditorId,
                              )?.name ?? "Member",
                            amountMinor: parseMoney(amount, selected.currency),
                            currency: selected.currency,
                            date: new Date().toISOString(),
                          });
                          setKey(uuid());
                          setDebtId("");
                          setAmount("");
                        }, "Repayment recorded. Your balance has been updated.")
                      }
                    >
                      I paid this amount · record repayment
                    </Button>
                  </>
                )}
              </YStack>
            </Card>
          </YStack>
        );
      }}
    </DataScreen>
  );
}
export function GroupsScreen() {
  const params = useLocalSearchParams(),
    [creating, setCreating] = useState(params.new === "1"),
    [name, setName] = useState(""),
    [members, setMembers] = useState<string[]>([]),
    [contacts, setContacts] = useState<{ name: string; phone: string }[]>([]),
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
          {creating && (
            <Card>
              <YStack gap={15}>
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
                      const picked = await chooseContact();
                      if (!picked) return;
                      const saved = d.savedContacts.find(
                        (contact) => contact.phone === picked.phone,
                      );
                      if (!saved) {
                        setContacts((items) =>
                          items.some(
                            (contact) => contact.phone === picked.phone,
                          )
                            ? items
                            : [...items, picked],
                        );
                        return;
                      }
                      setMembers((ms) =>
                        ms.includes(saved.id) ? ms : [...ms, saved.id],
                      );
                    })
                  }
                >
                  Choose a phone contact
                </Button>
                <Button
                  secondary
                  compact
                  onPress={() => router.push("/contacts")}
                >
                  View saved contacts
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
                  {d.savedContacts.map((p) => (
                    <Chip
                      selected={members.includes(p.id)}
                      key={p.id}
                      onPress={() =>
                        setMembers((ms) =>
                          ms.includes(p.id)
                            ? ms.filter((id) => id !== p.id)
                            : [...ms, p.id],
                        )
                      }
                    >
                      {p.name}
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
                          description: "A little better, together.",
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
          )}
          {d.ledgers.map((l, index) => (
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
                  borderLeftColor: ["#6652A3", "#9981BF", "#B9A7D5"][index % 3],
                  backgroundColor: c.card,
                }}
              >
                <XStack gap={10} alignItems="center">
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      backgroundColor: ["#F0ECF8", "#EEE8F8", "#F2EEF9"][
                        index % 3
                      ],
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      name={(["plane", "home", "coffee"] as const)[index % 3]}
                      color="#555269"
                      size={20}
                    />
                  </View>
                  <YStack flex={1} gap={3}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <Heading size={16}>{l.name}</Heading>
                      <Label muted size={10}>
                        {l.currency}
                      </Label>
                    </XStack>
                    <Label muted size={11} numberOfLines={1}>
                      {l.description}
                    </Label>
                    <XStack gap={-4} alignItems="center">
                      {l.members.slice(0, 5).map((m) => (
                        <Avatar key={m.id} name={m.name} size={27} />
                      ))}
                      {l.members.length > 5 && (
                        <Label muted size={12} marginLeft={8}>
                          +{l.members.length - 5} more
                        </Label>
                      )}
                      <Label muted size={10} marginLeft={8}>
                        {l.members.length} members
                      </Label>
                    </XStack>
                  </YStack>
                  <Icon name="chevron" size={15} color={c.muted} />
                </XStack>
              </Card>
            </Pressable>
          ))}
          {!d.ledgers.length && (
            <Empty
              title="Start something together"
              detail="Create a group for your home, a trip, or the next dinner."
            />
          )}
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
    [simplified, setSimplified] = useState(false),
    [view, setView] = useState<"records" | "balances">("records"),
    [membersOpen, setMembersOpen] = useState(false),
    [addingMember, setAddingMember] = useState(false),
    [memberSearch, setMemberSearch] = useState("");
  return (
    <DataScreen>
      {(d) => {
        const l = d.ledgers.find((l) => l.id === id);
        if (!l)
          return (
            <Empty
              title="Ledger unavailable"
              detail="Switch accounts or ask an owner to add you."
            />
          );
        const debts = d.obligations.filter((o) => o.ledgerId === id);
        const balances = simplified
          ? simplifyBalances(debts, l.currency)
          : debts
              .filter((o) => o.remainingMinor > 0)
              .map((o) => ({ ...o, amountMinor: o.remainingMinor }));
        const name = (id: string) =>
          l.members.find((m) => m.id === id)?.name ?? "Member";
        const currentMember = l.members.find(
          (member) => member.id === d.account.id,
        );
        const canManageMembers =
          currentMember?.role === "OWNER" || currentMember?.role === "ADMIN";
        const visibleMembers = l.members.filter((member) =>
          member.name.toLowerCase().includes(memberSearch.trim().toLowerCase()),
        );
        return (
          <YStack gap={16} paddingBottom={88} minHeight={620}>
            <YStack
              gap={12}
              padding={16}
              borderRadius={20}
              backgroundColor={c.soft}
            >
              <XStack gap={12} alignItems="center">
                <Icon name="groups" size={32} color="#7770A4" />
                <YStack flex={1} gap={5} alignItems="flex-start">
                  <Heading>{l.name}</Heading>
                  <Label muted size={12}>
                    {l.description} · {l.currency}
                  </Label>
                </YStack>
                <Pressable
                  onPress={() => setMembersOpen(true)}
                  style={{
                    borderRadius: 13,
                    backgroundColor: c.card,
                    paddingHorizontal: 11,
                    paddingVertical: 9,
                    flexDirection: "row",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <Icon name="groups" size={15} color="#7770A4" />
                  <Label bold size={12}>
                    {l.members.length} members
                  </Label>
                </Pressable>
              </XStack>
            </YStack>
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
                <XStack justifyContent="space-between" alignItems="center">
                  <Heading size={19}>All activity</Heading>
                  <Button
                    secondary
                    compact
                    onPress={() => router.push(`/group/${id}/changes` as any)}
                  >
                    Group changes
                  </Button>
                </XStack>
                {d.transactions
                  .filter((t) => t.ledgerId === id)
                  .map((t, index, rows) => (
                    <TransactionRow
                      key={t.id}
                      data={d}
                      transaction={t}
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
              <YStack gap={12} height={280}>
                <XStack justifyContent="space-between" alignItems="center">
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
                      justifyContent="space-between"
                      paddingVertical={12}
                      gap={12}
                      borderBottomWidth={i === balances.length - 1 ? 0 : 1}
                      borderBottomColor={c.line}
                    >
                      <Label flex={1} size={13}>
                        {name(o.debtorId)} → {name(o.creditorId)}
                      </Label>
                      <Label bold>{money(o.amountMinor, l.currency)}</Label>
                    </XStack>
                  ))}
                  {!balances.length && (
                    <Label muted>Everyone is settled up.</Label>
                  )}
                </ScrollView>
              </YStack>
            )}
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
                height: 54,
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
              <Label color="#FFFFFF" bold>
                Add transaction
              </Label>
            </Pressable>
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
                    maxHeight: "72%",
                  }}
                >
                  <YStack gap={14}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <Heading size={20}>Members</Heading>
                      <XStack gap={7}>
                        {canManageMembers && (
                          <Button
                            compact
                            icon="plus"
                            loading={addingMember}
                            disabled={action.busy || addingMember}
                            onPress={async () => {
                              setAddingMember(true);
                              try {
                                const picked = await chooseContact();
                                if (!picked) return;
                                const saved = d.savedContacts.find(
                                  (contact) => contact.phone === picked.phone,
                                );
                                if (
                                  saved &&
                                  l.members.some(
                                    (member) => member.id === saved.id,
                                  )
                                )
                                  throw new Error(
                                    `${saved.name} is already a member.`,
                                  );
                                await action.run(
                                  () =>
                                    extra(
                                      d.account.id,
                                      `/groups/${l.groupId}/members`,
                                      saved
                                        ? {
                                            memberIds: [saved.id],
                                            contacts: [],
                                          }
                                        : { memberIds: [], contacts: [picked] },
                                    ),
                                  `${picked.name} added to the group`,
                                );
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
                          <Avatar name={m.name} />
                          <YStack flex={1}>
                            <Label bold>{m.name}</Label>
                            <Label muted size={10}>
                              {m.role.toLowerCase()}
                            </Label>
                          </YStack>
                          {canManageMembers &&
                            m.id !== d.account.id &&
                            m.role !== "OWNER" && (
                              <Button
                                secondary
                                compact
                                disabled={action.busy}
                                onPress={() =>
                                  Alert.alert(
                                    "Remove member?",
                                    `${m.name} will lose access. Past records stay visible.`,
                                    [
                                      { text: "Cancel", style: "cancel" },
                                      {
                                        text: "Remove",
                                        style: "destructive",
                                        onPress: () =>
                                          void action.run(
                                            () =>
                                              extra(
                                                d.account.id,
                                                `/groups/${l.groupId}/members/${m.id}`,
                                                undefined,
                                                "DELETE",
                                              ),
                                            `${m.name} removed from the group`,
                                          ),
                                      },
                                    ],
                                  )
                                }
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
                <Field
                  label="From"
                  placeholder="YYYY-MM-DD"
                  value={from}
                  onChangeText={setFrom}
                />
              </YStack>
              <YStack flex={1} minWidth={150}>
                <Field
                  label="To"
                  placeholder="YYYY-MM-DD"
                  value={to}
                  onChangeText={setTo}
                />
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
                  <Label flex={1}>{entry.message}</Label>
                  <Label muted size={10}>
                    {new Date(entry.createdAt).toLocaleDateString("en-IN")}
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
