import { chooseContact } from "../services/device";
import { DateTime } from "luxon";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Linking,
  Image,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useQuery } from "@tanstack/react-query";
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
import { saveBillPhoto, getDemoBillPhoto } from "../data/repository";
import { repository, uuid, extra } from "../data/repository";
import { DEMO } from "../data/session";
import { useAction } from "../data/hooks";
import { DataScreen, SectionTitle, TransactionRow } from "./overview";
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
  const [type, setType] = useState<CreateTransaction["type"]>(
      params.ledger ? "SHARED_EXPENSE" : "PERSONAL_EXPENSE",
    ),
    [ledgerId, setLedgerId] = useState(params.ledger ?? ""),
    [selected, setSelected] = useState<string[]>([]),
    [method, setMethod] = useState<SplitMethod>("EQUAL"),
    [weights, setWeights] = useState<Record<string, string>>({}),
    [tagIds, setTagIds] = useState<string[]>([]),
    [transactionIcon, setTransactionIcon] = useState<IconName>("bag"),
    [borrower, setBorrower] = useState(""),
    [contactPayee, setContactPayee] = useState(""),
    [contactName, setContactName] = useState(""),
    [billOpen, setBillOpen] = useState(
      params.capture === "bill" ||
        params.bill === "1" ||
        params.bill === "camera",
    ),
    [picker, setPicker] = useState<
      "ledger" | "participants" | "borrower" | "payee" | "tags" | null
    >(null),
    [key, setKey] = useState(uuid());
  const [photo, setPhoto] = useState<BillPhoto | null>(null);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saving = useRef(false);
  const isExpense = type === "PERSONAL_EXPENSE" || type === "SHARED_EXPENSE";
  const {
    setValue,
    control,
    handleSubmit,
    getValues,
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
  useEffect(() => {
    if (ledger) setSelected(ledger.members.map((m) => m.id));
  }, [ledgerId]);
  const choosePayee = (peerId: string) => {
    if (peerId === "__none") {
      setContactPayee("");
      setContactName("");
      return;
    }
    const peer = d.peers.find((candidate) => candidate.id === peerId);
    if (!peer) return;
    const rawPhone = (peer.phone || "").replace(/[^0-9]/g, "");
    const phone10 = rawPhone.length >= 10 ? rawPhone.slice(-10) : rawPhone;
    const handle = phone10 ? `${phone10}@paytm` : peer.name;
    setContactPayee(handle);
    setContactName(peer.name);
    const currentNotes = getValues("notes") || "";
    const baseNotes = currentNotes.replace(/\n?Paid to: .*/, "");
    setValue(
      "notes",
      baseNotes
        ? `${baseNotes}\nPaid to: ${peer.name} (UPI: ${handle})`
        : `Paid to: ${peer.name} (UPI: ${handle})`,
      { shouldValidate: true },
    );
    if (!getValues("title"))
      setValue("title", `Payment to ${peer.name}`, { shouldValidate: true });
  };
  const allocations = () =>
    splitExpense(
      parseMoney(amount, d.account.currency),
      selected.map((userId) => ({
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
  if (type === "SHARED_EXPENSE" && amount && selected.length)
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
        status:
          type === "LOAN"
            ? "PENDING_LOAN"
            : params.pending === "1"
              ? "PENDING"
              : "SETTLED",
        occurredAt,
        notes: values.notes,
        icon: transactionIcon,
        ledgerId: type === "ADJUSTMENT" ? undefined : ledgerId || undefined,
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
            ? selected.map((userId) => ({
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
        destinationId: type === "LOAN" ? borrower || undefined : undefined,
      };
      const record = savedId
        ? { id: savedId }
        : ((await repository.create(d.account.id, input)) as { id: string });
      setSavedId(record.id);
      if (photo && isExpense) {
        try {
          await saveBillPhoto(d.account.id, record.id, photo);
        } catch (error) {
          throw new Error(
            `Expense saved, but the photo was not attached. ${(error as Error).message} Retry below or open the saved expense.`,
          );
        }
      }
    }, "Expense saved. One less thing to keep in your head.");
    saving.current = false;
    if (ok) {
      setKey(uuid());
      router.replace("/activity");
    }
  });
  return (
    <YStack gap={14} maxWidth={800} width="100%" alignSelf="center">
      <Heading>A little entry. A clearer picture.</Heading>
      {savedId ? (
        <Card>
          <YStack gap={14}>
            <PipFeedback
              mood={action.busy ? "reading" : "help"}
              message={
                action.busy
                  ? "Finishing your entry…"
                  : "Your expense is safe. The photo needs another try."
              }
            />
            {!!action.error && <Notice error>{action.error}</Notice>}
            <Button
              loading={action.busy}
              disabled={action.busy}
              onPress={submit}
            >
              {action.busy ? "Saving…" : "Retry bill attachment"}
            </Button>
            <Button
              secondary
              disabled={action.busy}
              onPress={() => router.replace(`/transaction/${savedId}` as any)}
            >
              Open saved expense
            </Button>
          </YStack>
        </Card>
      ) : null}
      <View
        pointerEvents={savedId || action.busy ? "none" : "auto"}
        style={{ opacity: savedId ? 0.5 : 1 }}
      >
        <YStack gap={14}>
          <XStack alignItems="center" justifyContent="space-between" gap={12}>
            <Label muted flex={1}>
              Record it once. Keep the maths fair.
            </Label>
            {isExpense && (
              <Button
                secondary
                compact
                icon={photo ? "check" : "image"}
                onPress={() => setBillOpen(true)}
              >
                {photo ? `Bill · ${lines.length} items` : "Add bill"}
              </Button>
            )}
          </XStack>
          <XStack gap={8} flexWrap="wrap">
            {(
              [
                ["PERSONAL_EXPENSE", "Just me"],
                ["SHARED_EXPENSE", "Split with friends"],
                ["LOAN", "Lend money"],
                ["ADJUSTMENT", "Money in"],
              ] as const
            ).map(([value, text]) => (
              <Chip
                key={value}
                selected={type === value}
                onPress={() => setType(value)}
              >
                {text}
              </Chip>
            ))}
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
              <ScrollView
                keyboardShouldPersistTaps="handled"
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
              </ScrollView>
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
                    label="Date and time · India (YYYY-MM-DD HH:mm)"
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
                        color={transactionIcon === name ? "#5552B4" : undefined}
                      />
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
              <Label size={13} bold>
                Group or ledger{" "}
                {type === "PERSONAL_EXPENSE" ? "(optional)" : "(required)"}
              </Label>
              <Button
                secondary
                icon="groups"
                onPress={() => setPicker("ledger")}
              >
                {ledger?.name ??
                  (type === "PERSONAL_EXPENSE" ? "Personal" : "Choose a group")}
              </Button>
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
                      ? `${selected.length} ${selected.length === 1 ? "person" : "people"} selected`
                      : "Choose people"}
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
                    selected.map((id) => (
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
              {type === "LOAN" && (
                <YStack gap={10}>
                  <Label bold>Who is borrowing?</Label>
                  <Button
                    secondary
                    icon="groups"
                    disabled={!ledger}
                    onPress={() => setPicker("borrower")}
                  >
                    {ledger?.members.find((member) => member.id === borrower)
                      ?.name ?? "Choose borrower"}
                  </Button>
                </YStack>
              )}
              <Label size={13} bold>
                Tags
              </Label>
              <Button secondary onPress={() => setPicker("tags")}>
                {tagIds.length
                  ? `${tagIds.length} ${tagIds.length === 1 ? "tag" : "tags"}`
                  : "Choose tags"}
              </Button>
              <YStack gap={10}>
                <Label size={13} bold>
                  Paid to contact / UPI (optional)
                </Label>
                <XStack gap={8} flexWrap="wrap" alignItems="center">
                  <Button
                    secondary
                    compact
                    icon="groups"
                    onPress={() =>
                      action.run(async () => {
                        const contact = await chooseContact();
                        if (contact) {
                          const rawPhone = contact.phone.replace(/[^0-9]/g, "");
                          const phone10 =
                            rawPhone.length >= 10
                              ? rawPhone.slice(-10)
                              : rawPhone;
                          const handle = phone10
                            ? `${phone10}@paytm`
                            : contact.phone;
                          setContactPayee(handle);
                          setContactName(contact.name);
                          const currentNotes = getValues("notes") || "";
                          const newNotes = currentNotes
                            ? `${currentNotes}\nPaid to: ${contact.name} (UPI: ${handle})`
                            : `Paid to: ${contact.name} (UPI: ${handle})`;
                          setValue("notes", newNotes, { shouldValidate: true });
                          if (!getValues("title")) {
                            setValue("title", `Payment to ${contact.name}`, {
                              shouldValidate: true,
                            });
                          }
                        }
                      }, "Contact selected")
                    }
                  >
                    Phone Book
                  </Button>
                  <Button secondary compact onPress={() => setPicker("payee")}>
                    {contactName || "Choose saved peer"}
                  </Button>
                </XStack>
                {!!contactPayee && (
                  <YStack gap={6} marginTop={4}>
                    <Field
                      label="Payee UPI ID / Handle"
                      value={contactPayee}
                      onChangeText={(val) => {
                        setContactPayee(val);
                        const currentNotes = getValues("notes") || "";
                        const baseNotes = currentNotes.replace(
                          /\n?Paid to: .*/,
                          "",
                        );
                        const updated = baseNotes
                          ? `${baseNotes}\nPaid to: ${contactName || "Contact"} (UPI: ${val})`
                          : `Paid to: ${contactName || "Contact"} (UPI: ${val})`;
                        setValue("notes", updated, { shouldValidate: true });
                      }}
                    />
                    <Label muted size={11}>
                      Tap handle extension to set:
                    </Label>
                    <XStack flexWrap="wrap" gap={6}>
                      {[
                        "@paytm",
                        "@ybl",
                        "@okicici",
                        "@oksbi",
                        "@upi",
                        "@axl",
                      ].map((ext) => (
                        <Chip
                          key={ext}
                          selected={contactPayee.endsWith(ext)}
                          onPress={() => {
                            const base = contactPayee.includes("@")
                              ? contactPayee.split("@")[0]
                              : contactPayee;
                            const newHandle = `${base}${ext}`;
                            setContactPayee(newHandle);
                            const currentNotes = getValues("notes") || "";
                            const baseNotes = currentNotes.replace(
                              /\n?Paid to: .*/,
                              "",
                            );
                            const updated = baseNotes
                              ? `${baseNotes}\nPaid to: ${contactName || "Contact"} (UPI: ${newHandle})`
                              : `Paid to: ${contactName || "Contact"} (UPI: ${newHandle})`;
                            setValue("notes", updated, {
                              shouldValidate: true,
                            });
                          }}
                        >
                          {ext}
                        </Chip>
                      ))}
                    </XStack>
                  </YStack>
                )}
              </YStack>
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
                disabled={action.busy || scanning || !!savedId}
              >
                {action.busy
                  ? "Saving…"
                  : type === "SHARED_EXPENSE"
                    ? "Save & split expense"
                    : type === "LOAN"
                      ? "Record loan"
                      : "Save transaction"}
              </Button>
            </YStack>
          </Card>
          <SearchPicker
            visible={picker === "ledger"}
            title="Groups and ledgers"
            options={[
              ...(type === "PERSONAL_EXPENSE"
                ? [{ id: "__personal", label: "Personal" }]
                : []),
              ...d.ledgers
                .filter((entry) => !entry.archived)
                .map((entry) => ({
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
            title="People in this split"
            options={(ledger?.members ?? []).map((member) => ({
              id: member.id,
              label: member.name,
              detail: member.id === d.account.id ? "Your share" : undefined,
            }))}
            selected={selected}
            multiple
            onSelect={(id) =>
              setSelected((current) =>
                current.includes(id)
                  ? current.filter((memberId) => memberId !== id)
                  : [...current, id],
              )
            }
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "borrower"}
            title="Choose borrower"
            options={(ledger?.members ?? [])
              .filter((member) => member.id !== d.account.id)
              .map((member) => ({ id: member.id, label: member.name }))}
            selected={borrower ? [borrower] : []}
            onSelect={setBorrower}
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "payee"}
            title="Saved peers"
            options={[
              ...(contactName
                ? [{ id: "__none", label: "Clear selection" }]
                : []),
              ...d.peers.map((peer) => ({
                id: peer.id,
                label: peer.name,
                detail: peer.phone,
              })),
            ]}
            selected={d.peers
              .filter((peer) => peer.name === contactName)
              .map((peer) => peer.id)}
            onSelect={choosePayee}
            onClose={() => setPicker(null)}
          />
          <SearchPicker
            visible={picker === "tags"}
            title="Tags"
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
                            : (d.peers.find((p) => p.id === a.userId)?.name ??
                              "Member")}
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
            <Receipts transactionId={t.id} accountId={d.account.id} />
            <Card>
              <SectionTitle title="Activity" />
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
                View activity
              </Button>
            </YStack>
          );

        return (
          <YStack gap={22} maxWidth={720} width="100%" alignSelf="center">
            <Heading>A clean slate feels good.</Heading>
            <Label muted>
              Record a payment you have actually made. SettleUp does not move
              money.
            </Label>
            <Notice>
              Settle up clears what you owe after you pay someone outside the
              app. Choose the person, confirm the amount you paid, and SettleUp
              will reduce that balance and record the repayment in Activity.
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
                        d.peers.find((p) => p.id === o.creditorId)?.name ??
                        "Member";
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
                              d.peers.find((p) => p.id === selected.creditorId)
                                ?.name ?? "Member",
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
            <YStack>
              <Heading>Good company. Fair shares.</Heading>
              <Label muted>
                Less awkward maths. More doing things together.
              </Label>
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
                      const contact = await chooseContact();
                      if (!contact) return;
                      const peer = d.peers.find(
                        (p) => p.phone === contact.phone,
                      );
                      if (!peer) {
                        setContacts((items) =>
                          items.some((p) => p.phone === contact.phone)
                            ? items
                            : [...items, contact],
                        );
                        return;
                      }
                      setMembers((ms) =>
                        ms.includes(peer.id) ? ms : [...ms, peer.id],
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
                  Manage contacts and invitations
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
                  {d.peers.map((p) => (
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
            <Card
              key={l.id}
              style={{
                borderTopWidth: 5,
                borderTopColor: ["#B6A2E2", "#90BDB2", "#E4B297"][index % 3],
                backgroundColor: c.card,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  backgroundColor: ["#EDE7F9", "#E5F2ED", "#FAEDE4"][index % 3],
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Icon
                  name={(["plane", "home", "coffee"] as const)[index % 3]}
                  color="#555269"
                  size={25}
                />
              </View>
              <YStack gap={14}>
                <XStack justifyContent="space-between" alignItems="center">
                  <Heading size={21}>{l.name}</Heading>
                  <Label muted size={12}>
                    {l.archived ? "Archived" : l.currency}
                  </Label>
                </XStack>
                <Label muted>{l.description}</Label>
                <XStack gap={-5}>
                  {l.members.map((m) => (
                    <Avatar key={m.id} name={m.name} />
                  ))}
                </XStack>
                <XStack justifyContent="space-between" alignItems="center">
                  <Label muted size={12}>
                    {l.members.length} people, one shared ledger
                  </Label>
                  <Button
                    secondary
                    compact
                    onPress={() => router.push(`/group/${l.id}` as any)}
                  >
                    Open ledger
                  </Button>
                </XStack>
              </YStack>
            </Card>
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
    [simplified, setSimplified] = useState(false);
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
        return (
          <YStack gap={22}>
            <Card style={{ backgroundColor: c.soft, borderWidth: 0 }}>
              <XStack gap={14} alignItems="center">
                <Icon name="groups" size={32} color="#7770A4" />
                <YStack flex={1} gap={5} alignItems="flex-start">
                  <Heading>{l.name}</Heading>
                  <Label muted size={12}>
                    {l.description} · {l.currency}
                    {l.archived ? " · archived" : ""}
                  </Label>
                </YStack>
              </XStack>
            </Card>
            <XStack gap={10} flexWrap="wrap">
              <Button
                icon="plus"
                disabled={l.archived}
                onPress={() =>
                  router.push({ pathname: "/add", params: { ledger: id } })
                }
              >
                Split an expense
              </Button>
              <Button secondary onPress={() => router.push("/settle")}>
                Record repayment
              </Button>
              <Button
                secondary
                onPress={() =>
                  action.run(() =>
                    extra(
                      d.account.id,
                      `/ledgers/${id}`,
                      { archived: !l.archived },
                      "PATCH",
                    ),
                  )
                }
              >
                {l.archived ? "Unarchive" : "Archive ledger"}
              </Button>
            </XStack>
            {!!action.error && <Notice error>{action.error}</Notice>}
            <Card>
              <SectionTitle title="The people" />
              {l.members.map((m) => (
                <XStack
                  key={m.id}
                  alignItems="center"
                  gap={12}
                  marginBottom={12}
                >
                  <Avatar name={m.name} />
                  <Label flex={1}>{m.name}</Label>
                  <Label muted size={11}>
                    {m.role.toLowerCase()}
                  </Label>
                </XStack>
              ))}
            </Card>
            <Card>
              <SectionTitle title="Who owes whom" />
              <Chip
                selected={simplified}
                onPress={() => setSimplified(!simplified)}
              >
                {simplified
                  ? "Show original obligations"
                  : "Preview simplified balances"}
              </Chip>
              {simplified && (
                <Notice>
                  Advisory only. Original obligations remain unchanged.
                  Repayments still apply to original user pairs.
                </Notice>
              )}
              {balances.map((o, i) => (
                <XStack
                  key={i}
                  justifyContent="space-between"
                  paddingVertical={14}
                  gap={12}
                >
                  <Label flex={1} size={13}>
                    {name(o.debtorId)} → {name(o.creditorId)}
                  </Label>
                  <Label bold>{money(o.amountMinor, l.currency)}</Label>
                </XStack>
              ))}
              {!balances.length && (
                <Label muted marginTop={16}>
                  Everyone is settled up.
                </Label>
              )}
            </Card>
            <Card>
              <SectionTitle title="The shared story" />
              {d.transactions
                .filter((t) => t.ledgerId === id)
                .map((t) => (
                  <TransactionRow key={t.id} data={d} transaction={t} />
                ))}
            </Card>
          </YStack>
        );
      }}
    </DataScreen>
  );
}

function Receipts({
  transactionId,
  accountId,
}: {
  transactionId: string;
  accountId: string;
}) {
  const action = useAction();
  const q = useQuery({
    queryKey: ["account", accountId, "receipts", transactionId],
    queryFn: () =>
      DEMO
        ? getDemoBillPhoto(accountId, transactionId)
        : extra(accountId, `/transactions/${transactionId}/attachments`),
  });
  return (
    <Card>
      <YStack gap={14}>
        <SectionTitle title="Receipts" />
        <Label muted size={12}>
          JPEG, PNG or PDF, up to 10 MB. Receipts stay private to authorized
          ledger viewers.
        </Label>
        {DEMO ? (
          <YStack gap={12}>
            {q.data ? (
              <Image
                source={{ uri: q.data }}
                accessibilityLabel="Saved bill photo"
                resizeMode="contain"
                style={{ width: "100%", height: 280 }}
              />
            ) : (
              <Label muted>No bill photo attached.</Label>
            )}
            <Label muted size={11}>
              Demo bill photos stay on this device, under this account.
            </Label>
            <Button
              secondary
              onPress={() =>
                action.run(async () => {
                  const picked = await DocumentPicker.getDocumentAsync({
                    type: ["image/jpeg", "image/png"],
                    copyToCacheDirectory: true,
                  });
                  if (picked.canceled) return;
                  const file = picked.assets[0];
                  await saveBillPhoto(accountId, transactionId, {
                    uri: file.uri,
                    contentType: file.mimeType ?? "image/jpeg",
                  });
                  await q.refetch();
                }, "Bill photo attached.")
              }
            >
              Attach bill photo
            </Button>
          </YStack>
        ) : (
          <>
            <Button
              secondary
              onPress={() =>
                action.run(async () => {
                  const result = await DocumentPicker.getDocumentAsync({
                    type: ["image/jpeg", "image/png", "application/pdf"],
                    copyToCacheDirectory: true,
                  });
                  if (result.canceled) return;
                  const file = result.assets[0];
                  if (!file.size || file.size > 10485760)
                    throw new Error("Choose a receipt up to 10 MB.");
                  const upload = await extra(
                    accountId,
                    `/transactions/${transactionId}/attachments`,
                    { contentType: file.mimeType, size: file.size },
                  );
                  const blob = await (await fetch(file.uri)).blob();
                  const response = await fetch(upload.uploadUrl, {
                    method: "PUT",
                    headers: { "content-type": file.mimeType! },
                    body: blob,
                  });
                  if (!response.ok)
                    throw new Error("Upload failed. Please try again.");
                  await extra(
                    accountId,
                    `/attachments/${upload.id}/complete`,
                    {},
                  );
                  await q.refetch();
                }, "Receipt uploaded")
              }
            >
              Attach receipt
            </Button>
            {q.data?.map((a: any) => (
              <Button
                key={a.id}
                secondary
                disabled={a.state !== "READY"}
                onPress={() =>
                  action.run(async () => {
                    const result = await extra(
                      accountId,
                      `/attachments/${a.id}/download`,
                    );
                    await Linking.openURL(result.url);
                  }, "Receipt opened")
                }
              >
                {a.contentType} · {a.state.toLowerCase()}
              </Button>
            ))}
          </>
        )}
        {!!action.error && <Notice error>{action.error}</Notice>}
        {!!action.success && <Notice>{action.success}</Notice>}
      </YStack>
    </Card>
  );
}
