import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { XStack, YStack } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Dashboard } from "@settleup/contracts";
import {
  isUpiId,
  matchSettlementSms,
  money,
  receiveUpiUri,
  type ImportSuggestion,
  type SettlementCandidate,
  type SettlementMatch,
} from "@settleup/domain";
import {
  AndroidSmsProvider,
  upiDirectory,
  type SavedUpi,
} from "../services/device";
import { personName } from "../data/people";
import { repository, uuid } from "../data/repository";
import { useAction } from "../data/hooks";
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Icon,
  Label,
  Notice,
  Avatar,
  Empty,
  useColors,
} from "../components/ui";

/** The signed-in person's own UPI ID, kept on this device. */
export function useMyUpi(accountId: string) {
  const [upiId, setUpiId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void upiDirectory.mine(accountId).then((value) => live && setUpiId(value));
    return () => {
      live = false;
    };
  }, [accountId]);
  const save = async (value: string) => {
    const trimmed = value.trim();
    if (!isUpiId(trimmed))
      throw new Error("Enter a valid UPI ID, like name@okaxis.");
    await upiDirectory.setMine(accountId, trimmed);
    setUpiId(trimmed);
  };
  return { upiId, save };
}

/** UPI IDs saved for people by scanning their QR code. */
export function useSavedUpis(accountId: string) {
  const [saved, setSaved] = useState<Record<string, SavedUpi>>({});
  const reload = () =>
    upiDirectory.contacts(accountId).then(setSaved, () => setSaved({}));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);
  return { saved, reload };
}

/**
 * Bank SMS suggestions (from the existing 7-day inbox cache) matched against
 * open balances. Only works where SMS review is available and permitted.
 */
export function useSettlementSmsMatches(
  accountId: string,
  candidates: SettlementCandidate[],
) {
  const provider = useMemo(
    () => new AndroidSmsProvider(accountId),
    [accountId],
  );
  const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    if (!provider.available()) return;
    void provider.hasPermission().then((granted) => {
      if (!granted || !live) return;
      void provider.cachedSuggestions().then((items) => {
        if (live) setSuggestions(items);
      });
    });
    const sub = provider.subscribeCachedSuggestions((items) => {
      if (live) setSuggestions(items);
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [provider]);
  const key = JSON.stringify(candidates);
  const matches = useMemo(() => {
    const byCandidate = new Map<string, SettlementMatch>();
    for (const match of matchSettlementSms(
      suggestions.filter((item) => !dismissed.has(item.fingerprint)),
      candidates,
    ))
      byCandidate.set(match.candidateId, match);
    return byCandidate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, dismissed, key]);
  return {
    matches,
    /** Marks the SMS as used for a settlement so it is not offered again. */
    async consume(match: SettlementMatch) {
      await consumeSmsMatch(accountId, match);
      setDismissed((set) => new Set(set).add(match.suggestion.fingerprint));
    },
    dismiss(match: SettlementMatch) {
      setDismissed((set) => new Set(set).add(match.suggestion.fingerprint));
    },
  };
}

export async function consumeSmsMatch(
  accountId: string,
  match: SettlementMatch,
) {
  const provider = new AndroidSmsProvider(accountId);
  if (!provider.available()) return;
  await provider.markHandled(
    match.suggestion.fingerprint,
    "ACCEPTED",
    match.suggestion.occurredAt,
    { title: match.suggestion.title, amountMinor: match.amountMinor },
  );
}

export function SmsMatchNotice({
  match,
  verb,
  busy,
  onConfirm,
  onDismiss,
}: {
  match: SettlementMatch;
  verb: "received" | "paid";
  busy?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const when = new Date(match.suggestion.occurredAt).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "short" },
  );
  return (
    <View
      style={{
        borderRadius: 14,
        padding: 12,
        backgroundColor: c.soft,
        gap: 8,
      }}
    >
      <XStack gap={8} alignItems="center">
        <Icon name="sms" size={16} color="#6652A3" />
        <Label size={12} flex={1}>
          Bank SMS: {money(match.amountMinor)} {verb} on {when}
          {match.suggestion.title ? ` · ${match.suggestion.title}` : ""}
        </Label>
      </XStack>
      <XStack gap={8} flexWrap="wrap">
        <Button compact loading={busy} disabled={busy} onPress={onConfirm}>
          {verb === "received" ? "Mark as received" : "Use this payment"}
        </Button>
        <Button compact secondary disabled={busy} onPress={onDismiss}>
          Not this
        </Button>
      </XStack>
    </View>
  );
}

/** Lets you set your own UPI ID once, inline. */
export function MyUpiSetup({
  onSave,
  initial = "",
}: {
  onSave: (value: string) => Promise<void>;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <YStack gap={10}>
      <Field
        label="Your UPI ID"
        placeholder="yourname@okaxis"
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={setValue}
        error={error}
      />
      <Label muted size={11}>
        Stored only on this phone. It goes into the QR people scan to pay you.
      </Label>
      <Button
        loading={busy}
        disabled={busy || !value.trim()}
        onPress={async () => {
          setBusy(true);
          try {
            await onSave(value);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save UPI ID
      </Button>
    </YStack>
  );
}

/**
 * Full-screen sheet with a QR for your UPI ID and the amount owed. The payer
 * scans it in their own UPI app, which is the P2P flow UPI apps allow.
 */
export function ReceiveQrSheet({
  visible,
  onClose,
  accountId,
  accountName,
  payerName,
  amountMinor,
  currency,
  note,
}: {
  visible: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  payerName: string;
  amountMinor?: number;
  currency: string;
  note?: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const mine = useMyUpi(accountId);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const inr = currency === "INR";
  const uri = useMemo(() => {
    if (!mine.upiId) return "";
    try {
      return receiveUpiUri({
        payeeAddress: mine.upiId,
        payeeName: accountName,
        amountMinor,
        note,
      });
    } catch {
      return "";
    }
  }, [mine.upiId, accountName, amountMinor, note]);
  const amountLabel =
    amountMinor !== undefined ? money(amountMinor, currency) : "";
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 20 + insets.top,
          gap: 18,
          paddingBottom: 48 + insets.bottom,
        }}
      >
        <XStack alignItems="center" justifyContent="space-between">
          <Heading size={22}>Get paid</Heading>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}
          >
            <Icon name="close" size={22} />
          </Pressable>
        </XStack>
        {!inr ? (
          <Notice>UPI only works for INR balances.</Notice>
        ) : mine.upiId === null ? null : !mine.upiId || editing ? (
          <Card>
            <MyUpiSetup
              initial={mine.upiId}
              onSave={async (value) => {
                await mine.save(value);
                setEditing(false);
              }}
            />
          </Card>
        ) : (
          <Card style={{ padding: 22 }}>
            <YStack gap={14} alignItems="center">
              <Label muted>
                {payerName} scans this in their UPI app
              </Label>
              {!!amountLabel && (
                <Label bold size={34}>
                  {amountLabel}
                </Label>
              )}
              <View
                style={{
                  padding: 14,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 18,
                }}
              >
                {!!uri && <QRCode value={uri} size={220} quietZone={6} />}
              </View>
              <Label bold>{mine.upiId}</Label>
              <XStack gap={8} flexWrap="wrap" justifyContent="center">
                <Chip
                  selected={copied}
                  onPress={async () => {
                    await Clipboard.setStringAsync(mine.upiId ?? "");
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy UPI ID"}
                </Chip>
                <Chip onPress={() => setEditing(true)}>Change UPI ID</Chip>
              </XStack>
            </YStack>
          </Card>
        )}
        {inr && !!mine.upiId && !editing && (
          <>
            <Button
              icon="link"
              onPress={() =>
                Share.share({
                  message:
                    `Hi ${payerName}, ${amountLabel ? `${amountLabel} ` : ""}is pending on SettleUp` +
                    `${note ? ` for ${note}` : ""}. ` +
                    `You can pay me on UPI at ${mine.upiId} from any UPI app.`,
                })
              }
            >
              Send reminder
            </Button>
            <Notice>
              When the money arrives, your bank SMS shows up on the settle
              screen so you can mark it received in one tap.
            </Notice>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

/** Everyone you share a balance or contact with, excluding yourself. */
export function knownPeople(d: Dashboard) {
  const ids = new Set<string>();
  for (const contact of d.savedContacts) ids.add(contact.id);
  for (const ledger of d.ledgers)
    if (!ledger.deleted)
      for (const member of ledger.members) ids.add(member.id);
  ids.delete(d.account.id);
  return [...ids]
    .map((id) => ({ id, name: personName(d, id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Scanner result: store a friend's UPI ID against a person. */
export function SaveUpiToPerson({
  d,
  upiId,
  payeeName,
}: {
  d: Dashboard;
  upiId: string;
  payeeName: string;
}) {
  const people = useMemo(() => knownPeople(d), [d]);
  const { saved, reload } = useSavedUpis(d.account.id);
  const [query, setQuery] = useState("");
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const existing = Object.entries(saved).find(([, v]) => v.upiId === upiId);
  const guess = people
    .map((p) => ({
      ...p,
      score: p.name
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2 && payeeName.toLowerCase().includes(t))
        .length,
    }))
    .sort((a, b) => b.score - a.score);
  const shown = (
    query.trim()
      ? people.filter((p) =>
          p.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : guess
  ).slice(0, 8);
  return (
    <YStack gap={12}>
      <XStack gap={8} flexWrap="wrap">
        <Chip
          selected={copied}
          onPress={async () => {
            await Clipboard.setStringAsync(upiId);
            setCopied(true);
          }}
        >
          {copied ? "UPI ID copied" : "Copy UPI ID"}
        </Chip>
      </XStack>
      {(savedFor || existing) && (
        <Notice>
          Saved for {personName(d, (savedFor ?? existing?.[0])!)}. When you owe
          them, the settle screen shows this UPI ID to pay from your UPI app.
        </Notice>
      )}
      <Label bold size={13}>
        Save this UPI ID to
      </Label>
      {people.length > 8 && (
        <Field
          label="Search people"
          value={query}
          onChangeText={setQuery}
          placeholder="Name"
        />
      )}
      <XStack gap={8} flexWrap="wrap">
        {shown.map((person) => (
          <Chip
            key={person.id}
            selected={(savedFor ?? existing?.[0]) === person.id}
            onPress={async () => {
              await upiDirectory.saveContact(
                d.account.id,
                person.id,
                upiId,
                payeeName,
              );
              await reload();
              setSavedFor(person.id);
            }}
          >
            {person.name}
          </Chip>
        ))}
      </XStack>
      {!people.length && (
        <Label muted size={12}>
          Add this person to a group first, then scan again to save their UPI
          ID.
        </Label>
      )}
    </YStack>
  );
}

type Balance = {
  id: string;
  personId: string;
  currency: string;
  ledgerId?: string;
  amountMinor: number;
};

/** "Owed to you": show a receive QR per person and match incoming bank SMS. */
export function IncomingSettlements({
  d,
  incoming,
  scopeName,
}: {
  d: Dashboard;
  incoming: Balance[];
  scopeName: (ledgerId?: string) => string;
}) {
  const action = useAction();
  const [qrFor, setQrFor] = useState<Balance | null>(null);
  const [busyId, setBusyId] = useState("");
  const candidates = useMemo<SettlementCandidate[]>(
    () =>
      incoming
        .filter((b) => b.currency === "INR")
        .map((b) => ({
          id: b.id,
          personId: b.personId,
          personName: personName(d, b.personId),
          amountMinor: b.amountMinor,
          direction: "CREDIT" as const,
        })),
    [d, incoming],
  );
  const sms = useSettlementSmsMatches(d.account.id, candidates);
  return (
    <Card>
      <YStack gap={14}>
        <Heading size={19}>Who owes you</Heading>
        <Label muted size={12}>
          Show your QR so they can scan and pay from their UPI app. Matching
          bank SMS appear here to confirm in one tap.
        </Label>
        {incoming.map((balance) => {
          const name = personName(d, balance.personId);
          const match = sms.matches.get(balance.id);
          const contact = d.savedContacts.find(
            (p) => p.id === balance.personId,
          );
          return (
            <YStack key={balance.id} gap={10}>
              <XStack gap={10} alignItems="center">
                <Avatar name={name} avatar={contact?.avatar} size={40} />
                <YStack flex={1} minWidth={0}>
                  <Label bold>{name}</Label>
                  <Label muted size={11}>
                    {scopeName(balance.ledgerId)}
                  </Label>
                </YStack>
                <Label bold flexShrink={1} maxWidth="40%" textAlign="right">
                  {money(balance.amountMinor, balance.currency)}
                </Label>
              </XStack>
              {balance.currency === "INR" && (
                <XStack gap={8} flexWrap="wrap">
                  <Button
                    compact
                    secondary
                    icon="scan"
                    onPress={() => setQrFor(balance)}
                  >
                    Show my QR
                  </Button>
                </XStack>
              )}
              {match && (
                <SmsMatchNotice
                  match={match}
                  verb="received"
                  busy={busyId === balance.id}
                  onDismiss={() => sms.dismiss(match)}
                  onConfirm={() => {
                    setBusyId(balance.id);
                    void action
                      .run(async () => {
                        const result = await repository.settle(d.account.id, {
                          idempotencyKey: uuid(),
                          ledgerId: balance.ledgerId ?? undefined,
                          simplified: true,
                          debtorId: balance.personId,
                          creditorId: d.account.id,
                          amountMinor: match.amountMinor,
                          currency: balance.currency,
                          reference: match.suggestion.reference,
                        });
                        await sms.consume(match);
                        return result;
                      }, `Marked ${money(match.amountMinor)} from ${name} as received.`)
                      .finally(() => setBusyId(""));
                  }}
                />
              )}
            </YStack>
          );
        })}
        {!!action.error && <Notice error>{action.error}</Notice>}
        {!!action.success && <Notice>{action.success}</Notice>}
        {!incoming.length && (
          <Empty
            title="No one owes you"
            detail="There are no outstanding balances to receive."
          />
        )}
      </YStack>
      {qrFor && (
        <ReceiveQrSheet
          visible
          onClose={() => setQrFor(null)}
          accountId={d.account.id}
          accountName={d.account.name}
          payerName={personName(d, qrFor.personId)}
          amountMinor={qrFor.amountMinor}
          currency={qrFor.currency}
          note={`SettleUp ${scopeName(qrFor.ledgerId)}`}
        />
      )}
    </Card>
  );
}

/**
 * "You owe": the creditor's saved UPI ID to pay from your own UPI app, plus a
 * matching outgoing bank SMS to fill in the amount you actually paid.
 */
export function OutgoingHelper({
  d,
  selected,
  onUseSms,
}: {
  d: Dashboard;
  selected: Balance;
  onUseSms: (match: SettlementMatch) => void;
}) {
  const { saved } = useSavedUpis(d.account.id);
  const [copied, setCopied] = useState(false);
  const name = personName(d, selected.personId);
  const candidates = useMemo<SettlementCandidate[]>(
    () =>
      selected.currency === "INR"
        ? [
            {
              id: selected.id,
              personId: selected.personId,
              personName: name,
              amountMinor: selected.amountMinor,
              direction: "DEBIT",
            },
          ]
        : [],
    [selected, name],
  );
  const sms = useSettlementSmsMatches(d.account.id, candidates);
  const match = sms.matches.get(selected.id);
  const upi = saved[selected.personId];
  return (
    <YStack gap={10}>
      {upi ? (
        <XStack gap={8} alignItems="center" flexWrap="wrap">
          <Label size={12} flex={1}>
            {name}'s UPI ID: <Label bold size={12}>{upi.upiId}</Label>
          </Label>
          <Chip
            selected={copied}
            onPress={async () => {
              await Clipboard.setStringAsync(upi.upiId);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Chip>
        </XStack>
      ) : (
        <Label muted size={11}>
          Pay {name} from your UPI app by scanning their QR there. Tip: scan
          their QR once in SettleUp to save their UPI ID here.
        </Label>
      )}
      {match && (
        <SmsMatchNotice
          match={match}
          verb="paid"
          onDismiss={() => sms.dismiss(match)}
          onConfirm={() => onUseSms(match)}
        />
      )}
    </YStack>
  );
}
