import React, { useMemo, useState, useEffect } from "react";
import { Platform, View, Pressable, StyleSheet, AppState } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { YStack, XStack } from "tamagui";
import { useRouter } from "expo-router";
import {
  parseUpi,
  parseMoney,
  money,
  type ImportSuggestion,
} from "@settleup/domain";
import {
  AndroidSmsProvider,
  type SmsDecision,
  paymentLauncher,
  paymentRequest,
} from "../services/device";
import { repository } from "../data/repository";
import { useAction } from "../data/hooks";
import { DataScreen } from "./overview";
import {
  Card,
  Heading,
  Label,
  Button,
  Notice,
  Field,
  Chip,
  Icon,
  Empty,
  useColors,
} from "../components/ui";
export function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions(),
    [uri, setUri] = useState(""),
    [payment, setPayment] = useState<ReturnType<typeof parseUpi> | null>(null),
    [payeeAddress, setPayeeAddress] = useState(""),
    [track, setTrack] = useState(true),
    [amount, setAmount] = useState(""),
    [processed, setProcessed] = useState(false),
    [pasteMode, setPasteMode] = useState(false);
  const action = useAction();
  const router = useRouter();
  const c = useColors();
  const inspect = (value: string) => {
    try {
      if (processed) return;
      const result = parseUpi(value);
      setPayment(result);
      setPayeeAddress(result.payeeAddress);
      setUri(result.uri);
      setAmount(result.amountMinor ? String(result.amountMinor / 100) : "");
      action.setError("");
    } catch (e) {
      action.setError((e as Error).message);
    }
  };

  const pickImage = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets.length) return;
      const uri = picked.assets[0].uri;
      if (typeof (CameraView as any).scanFromURLAsync === "function") {
        const results = await (CameraView as any).scanFromURLAsync(uri, ["qr"]);
        if (results && results.length > 0 && results[0].data) {
          inspect(results[0].data);
          return;
        }
      }
      action.setError(
        "No valid QR code detected in this photo. Try pasting the UPI link below.",
      );
      setPasteMode(true);
    } catch (e) {
      action.setError((e as Error).message);
    }
  };

  // Permission request screen
  if (!permission?.granted) {
    return (
      <DataScreen>
        {() => (
          <YStack
            gap={28}
            alignItems="center"
            justifyContent="center"
            paddingTop={80}
            maxWidth={400}
            alignSelf="center"
            width="100%"
          >
            <View
              style={{
                width: 90,
                height: 90,
                borderRadius: 28,
                backgroundColor: "#6F6CD920",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Icon name="scan" size={44} color="#6F6CD9" />
            </View>
            <Heading size={22}>Scan a UPI QR code</Heading>
            <Label muted style={{ textAlign: "center" }}>
              SettleUp needs camera access to read QR codes. Your camera feed is
              never stored or transmitted.
            </Label>
            <Button
              icon="camera"
              onPress={() =>
                action.run(async () => {
                  const p = await requestPermission();
                  if (!p.granted)
                    throw new Error(
                      "Camera permission was declined. You can enable it in Settings.",
                    );
                }, "Camera enabled")
              }
            >
              Allow camera access
            </Button>
            <Button secondary icon="image" onPress={pickImage}>
              Choose QR photo from gallery
            </Button>
            <Button secondary onPress={() => setPasteMode(true)}>
              Paste UPI link instead
            </Button>
            {pasteMode && (
              <YStack gap={12} width="100%">
                <Field
                  label="UPI payment link"
                  placeholder="upi://pay?pa=merchant@upi&pn=Merchant&am=100"
                  value={uri}
                  onChangeText={setUri}
                />
                <Button secondary onPress={() => inspect(uri)}>
                  Review payment
                </Button>
              </YStack>
            )}
            {!!action.error && <Notice error>{action.error}</Notice>}
          </YStack>
        )}
      </DataScreen>
    );
  }

  // Payment review screen
  if (payment) {
    return (
      <DataScreen>
        {(d) => (
          <YStack gap={22} maxWidth={760} width="100%" alignSelf="center">
            <XStack alignItems="center" gap={12}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to scanner"
                onPress={() => {
                  setPayment(null);
                  setProcessed(false);
                  action.setError("");
                }}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: "center",
                }}
              >
                <Icon name="arrow" size={20} />
              </Pressable>
              <Heading size={20}>Review Payment</Heading>
            </XStack>

            <Card style={{ padding: 20 }}>
              <YStack gap={18}>
                <YStack
                  alignItems="center"
                  gap={10}
                  paddingVertical={12}
                  borderBottomWidth={1}
                  borderColor={c.line}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 18,
                      backgroundColor: "#6F6CD915",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Label bold size={24} color="#6F6CD9">
                      {payment.payeeName?.charAt(0)?.toUpperCase() || "?"}
                    </Label>
                  </View>
                  <Heading size={20}>{payment.payeeName}</Heading>
                </YStack>

                <YStack gap={6}>
                  <Field
                    label="Payee UPI ID"
                    value={payeeAddress}
                    onChangeText={setPayeeAddress}
                    placeholder="e.g. merchant@upi or 9876543210@paytm"
                  />
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
                        selected={payeeAddress.endsWith(ext)}
                        onPress={() => {
                          const base = payeeAddress.includes("@")
                            ? payeeAddress.split("@")[0]
                            : payeeAddress;
                          setPayeeAddress(`${base}${ext}`);
                        }}
                      >
                        {ext}
                      </Chip>
                    ))}
                  </XStack>
                </YStack>

                <Field
                  label="Amount (INR)"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />

                {!!payment.note && (
                  <YStack gap={4}>
                    <Label muted size={11}>
                      Payment note
                    </Label>
                    <Label size={13}>{payment.note}</Label>
                  </YStack>
                )}

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: track }}
                  aria-checked={track}
                  onPress={() => setTrack(!track)}
                  style={{
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: track ? "#6F6CD9" : "#E6E1EC",
                      borderRadius: 6,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {track && <Icon name="check" color="#FFF" size={16} />}
                  </View>
                  <Label size={13}>Track this payment in SettleUp</Label>
                </Pressable>

                {!!action.error && <Notice error>{action.error}</Notice>}

                <Notice>
                  Opening the UPI app is not proof of payment. Tracked payments
                  stay pending until you confirm completion.
                </Notice>

                <Button
                  loading={action.busy}
                  disabled={action.busy || processed}
                  onPress={() =>
                    action.run(async () => {
                      const value = parseMoney(amount);
                      const activeAddress =
                        payeeAddress || payment.payeeAddress;
                      const confirmed = new URL(payment.uri);
                      confirmed.searchParams.set("pa", activeAddress);
                      confirmed.searchParams.set(
                        "am",
                        (value / 100).toFixed(2),
                      );
                      const trackedRequest = await paymentRequest(
                        d.account.id,
                        confirmed.toString(),
                      );
                      if (track)
                        await repository.create(d.account.id, {
                          title: payment.payeeName,
                          amountMinor: value,
                          currency: "INR",
                          type: "PERSONAL_EXPENSE",
                          status: "SETTLED",
                          occurredAt: trackedRequest.occurredAt,
                          idempotencyKey: trackedRequest.key,
                          notes: payment.note
                            ? `${payment.note}\nUPI ID: ${activeAddress}`
                            : `UPI ID: ${activeAddress}`,
                          paymentReference: payment.reference || undefined,
                          tagIds: [],
                          participants: [],
                          splitMethod: "EQUAL",
                        });
                      setProcessed(true);
                      await paymentLauncher.open(confirmed.toString());
                    }, "Payment app opened. Entry saved as Settled in Activity.")
                  }
                >
                  {amount ? `Pay ₹${amount}` : "Confirm & pay"}
                </Button>

                {processed && (
                  <Notice>
                    {track
                      ? "Completed entry saved as Settled in Activity. "
                      : ""}
                    This QR is locked for this review session to prevent
                    duplicate entries.
                  </Notice>
                )}
              </YStack>
            </Card>
          </YStack>
        )}
      </DataScreen>
    );
  }

  // Full-screen camera scanner
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => inspect(data)}
      />

      {/* Dark overlay with transparent cutout */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { justifyContent: "center", alignItems: "center" },
        ]}
        pointerEvents="none"
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "28%",
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "32%",
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "28%",
            left: 0,
            width: "12%",
            bottom: "32%",
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: "28%",
            right: 0,
            width: "12%",
            bottom: "32%",
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />

        {/* Scan frame corners */}
        <View
          style={{
            width: "76%",
            aspectRatio: 1,
            maxWidth: 300,
            maxHeight: 300,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 30,
              height: 30,
              borderTopWidth: 3,
              borderLeftWidth: 3,
              borderColor: "#FFF",
              borderTopLeftRadius: 8,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 30,
              height: 30,
              borderTopWidth: 3,
              borderRightWidth: 3,
              borderColor: "#FFF",
              borderTopRightRadius: 8,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: 30,
              height: 30,
              borderBottomWidth: 3,
              borderLeftWidth: 3,
              borderColor: "#FFF",
              borderBottomLeftRadius: 8,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 30,
              height: 30,
              borderBottomWidth: 3,
              borderRightWidth: 3,
              borderColor: "#FFF",
              borderBottomRightRadius: 8,
            }}
          />
        </View>
      </View>

      {/* Top bar */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: Platform.OS === "ios" ? 54 : 40,
          paddingHorizontal: 20,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon name="arrow" size={18} color="#FFF" />
        </Pressable>
        <Label bold size={16} color="#FFF">
          Scan & Pay
        </Label>
        <View style={{ width: 40 }} />
      </View>

      {/* Instruction text */}
      <View
        style={{
          position: "absolute",
          top: "22%",
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <Label size={13} color="rgba(255,255,255,0.85)">
          Place QR code inside the frame
        </Label>
      </View>

      {/* Bottom bar */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: Platform.OS === "ios" ? 36 : 24,
          paddingTop: 16,
          paddingHorizontal: 24,
          backgroundColor: "rgba(0,0,0,0.65)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          gap: 10,
        }}
      >
        {!!action.error && (
          <View
            style={{
              backgroundColor: "rgba(255,60,60,0.15)",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Label size={12} color="#FF6B6B">
              {action.error}
            </Label>
          </View>
        )}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: track }}
          aria-checked={track}
          onPress={() => setTrack(!track)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 44,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              backgroundColor: track ? "#6F6CD9" : "rgba(255,255,255,0.2)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {track && <Icon name="check" color="#FFF" size={16} />}
          </View>
          <Label size={13} color="#FFF">
            Record this payment in SettleUp (Settled)
          </Label>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={pickImage}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "rgba(255,255,255,0.18)",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 14,
            marginTop: 4,
          }}
        >
          <Icon name="image" color="#FFF" size={18} />
          <Label bold size={13} color="#FFF">
            Choose QR from Gallery / Photos
          </Label>
        </Pressable>
      </View>
    </View>
  );
}
export function SmsScreen() {
  return (
    <DataScreen>
      {(d) => <SmsContent key={d.account.id} accountId={d.account.id} />}
    </DataScreen>
  );
}
function SmsContent({ accountId }: { accountId: string }) {
  const provider = useMemo(
      () => new AndroidSmsProvider(accountId),
      [accountId],
    ),
    action = useAction(),
    router = useRouter(),
    c = useColors();
  const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]),
    [enabled, setEnabled] = useState(false),
    [custom, setCustom] = useState(false),
    [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [search, setSearch] = useState(""),
    [pending, setPending] = useState<{
      fingerprint: string;
      kind: "accept" | "reject" | "refresh";
    } | null>(null),
    [history, setHistory] = useState<Record<string, SmsDecision>>({}),
    [editing, setEditing] = useState<string | null>(null),
    [editAmount, setEditAmount] = useState(""),
    [editTitle, setEditTitle] = useState("");
  const keys = useMemo(() => new Map<string, string>(), []);
  const filteredSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suggestions;
    return suggestions.filter((suggestion) =>
      [
        suggestion.title,
        suggestion.reference,
        suggestion.accountSuffix,
        suggestion.direction,
        String(suggestion.amountMinor / 100),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, suggestions]);
  const perform = async (
    kind: "accept" | "reject" | "refresh",
    fingerprint: string,
    work: () => Promise<void>,
    success: string,
  ) => {
    if (pending) return;
    setPending({ kind, fingerprint });
    try {
      await action.run(work, success);
    } finally {
      setPending(null);
    }
  };
  useEffect(() => {
    let live = true;
    if (provider.available())
      void provider.hasPermission().then((granted) => {
        if (live && granted) setEnabled(true);
      });
    return () => {
      live = false;
    };
  }, [provider]);
  useEffect(() => {
    if (!enabled || custom || action.busy || editing) return;
    let live = true;
    const refresh = async () => {
      try {
        const items = await provider.review();
        const records = await provider.handled();
        if (live) {
          setSuggestions(items);
          setHistory(records);
        }
      } catch (error) {
        if (live) action.setError((error as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      live = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [enabled, custom, provider, action.busy, editing]);

  return (
    <YStack gap={12} maxWidth={760} width="100%" alignSelf="center">
      <YStack gap={2}>
        <Heading size={24}>Bank SMS review</Heading>
        <Label muted size={12}>
          Confirm or dismiss suggested transactions.
        </Label>
      </YStack>
      <Card style={{ padding: 14 }}>
        <YStack gap={11}>
          {!provider.available() ? (
            <Notice>
              {Platform.OS === "ios"
                ? "iOS apps cannot read your SMS inbox. Use manual entries or UPI QR review instead."
                : Platform.OS === "web"
                  ? "SMS review is available only on supported Android development builds. It cannot access messages in a browser."
                  : "SMS review needs a custom Android development build. Expo Go does not include the native inbox module."}
            </Notice>
          ) : (
            <>
              <XStack gap={9} alignItems="center">
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    backgroundColor: c.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="sms" size={18} color="#626078" />
                </View>
                <Label muted size={11} flex={1} lineHeight={16}>
                  Messages stay on this phone. The weekly inbox covers today and
                  the previous six days.
                </Label>
              </XStack>
              <XStack gap={8} flexWrap="wrap">
                <Chip
                  selected={!custom}
                  onPress={() => {
                    setCustom(false);
                    setSuggestions([]);
                    setEditing(null);
                  }}
                >
                  Last 7 days
                </Chip>
                <Chip
                  selected={custom}
                  onPress={() => {
                    setCustom(true);
                    setSuggestions([]);
                    setEditing(null);
                  }}
                >
                  Choose dates
                </Chip>
              </XStack>
              {custom && (
                <YStack gap={12}>
                  <Field
                    label="From · YYYY-MM-DD"
                    value={from}
                    onChangeText={(value) => {
                      setFrom(value);
                      setSuggestions([]);
                    }}
                    placeholder="2026-09-01"
                  />
                  <Field
                    label="Through · YYYY-MM-DD"
                    value={through}
                    onChangeText={(value) => {
                      setThrough(value);
                      setSuggestions([]);
                    }}
                    placeholder="2026-09-07"
                  />
                  <Label muted>
                    No accept/reject history is saved for this search.
                    Previously reviewed messages may appear.
                  </Label>
                </YStack>
              )}
              <Button
                loading={pending?.kind === "refresh"}
                disabled={action.busy}
                onPress={() =>
                  perform(
                    "refresh",
                    "inbox",
                    async () => {
                      if (
                        custom &&
                        (!/^\d{4}-\d{2}-\d{2}$/.test(from) ||
                          !/^\d{4}-\d{2}-\d{2}$/.test(through))
                      )
                        throw new Error("Enter both dates as YYYY-MM-DD.");
                      if (!(await provider.requestPermission()))
                        throw new Error(
                          "SMS permission was declined. Manual entry is always available.",
                        );
                      setSuggestions(
                        await provider.review(
                          custom ? { from, through } : undefined,
                        ),
                      );
                      setHistory(await provider.handled());
                      setEnabled(true);
                    },
                    "Review ready",
                  )
                }
              >
                {custom
                  ? "Search bank SMS"
                  : enabled
                    ? "Refresh inbox"
                    : "Enable SMS transaction review"}
              </Button>
            </>
          )}
          {!!action.error && <Notice error>{action.error}</Notice>}
          {enabled && !suggestions.length && (
            <Empty
              title="Your inbox is all caught up"
              detail={
                custom
                  ? "Choose dates and search for bank expenses."
                  : "No new bank expenses in your seven-day inbox."
              }
            />
          )}
        </YStack>
      </Card>
      {!!suggestions.length && (
        <Field
          label="Search messages"
          placeholder="Merchant, amount, reference or account"
          value={search}
          onChangeText={setSearch}
        />
      )}
      {filteredSuggestions.map((s) => (
        <Card key={s.fingerprint} style={{ padding: 14 }}>
          <YStack gap={9}>
            <XStack alignItems="center" gap={10}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: s.direction === "CREDIT" ? c.mint : c.soft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={s.direction === "CREDIT" ? "down" : "up"}
                  size={18}
                  color="#626078"
                />
              </View>
              <YStack flex={1} gap={2}>
                <Heading size={16}>{s.title}</Heading>
                <Label muted size={10}>
                  {new Date(s.occurredAt).toLocaleString()}
                  {s.accountSuffix ? ` · A/c •${s.accountSuffix}` : ""}
                </Label>
              </YStack>
              <YStack alignItems="flex-end" gap={2}>
                <Label bold size={16}>
                  {money(s.amountMinor)}
                </Label>
                <Label muted size={9}>
                  {s.direction.toLowerCase()}
                </Label>
              </YStack>
            </XStack>
            {s.direction === "CREDIT" && (
              <Label muted size={11} lineHeight={16}>
                Accept as personal money in only. If this is a loan repayment,
                use Record repayment instead.
              </Label>
            )}
            {editing === s.fingerprint && (
              <>
                <Field
                  label="Corrected title"
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
                <Field
                  label="Corrected amount"
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                />
              </>
            )}
            <XStack gap={8} flexWrap="wrap" justifyContent="flex-end">
              <Button
                compact
                loading={
                  pending?.fingerprint === s.fingerprint &&
                  pending.kind === "accept"
                }
                disabled={action.busy}
                onPress={() =>
                  perform(
                    "accept",
                    s.fingerprint,
                    async () => {
                      if (!keys.has(s.fingerprint))
                        keys.set(
                          s.fingerprint,
                          `${s.fingerprint.slice(0, 8)}-${s.fingerprint.slice(8, 12)}-4${s.fingerprint.slice(13, 16)}-8${s.fingerprint.slice(17, 20)}-${s.fingerprint.slice(20, 32)}`,
                        );
                      await repository.create(accountId, {
                        idempotencyKey: keys.get(s.fingerprint)!,
                        title: editing === s.fingerprint ? editTitle : s.title,
                        amountMinor:
                          editing === s.fingerprint
                            ? parseMoney(editAmount)
                            : s.amountMinor,
                        currency: "INR",
                        type:
                          s.direction === "CREDIT"
                            ? "ADJUSTMENT"
                            : "PERSONAL_EXPENSE",
                        status: "SETTLED",
                        occurredAt: s.occurredAt,
                        paymentReference: s.reference,
                        tagIds: [],
                        participants: [],
                        splitMethod: "EQUAL",
                      });
                      if (!custom) {
                        await provider.markHandled(
                          s.fingerprint,
                          "ACCEPTED",
                          s.occurredAt,
                          {
                            title:
                              editing === s.fingerprint ? editTitle : s.title,
                            amountMinor:
                              editing === s.fingerprint
                                ? parseMoney(editAmount)
                                : s.amountMinor,
                          },
                        );
                        setHistory(await provider.handled());
                      }
                      setSuggestions((items) =>
                        items.filter((i) => i.fingerprint !== s.fingerprint),
                      );
                    },
                    "Suggestion accepted",
                  )
                }
              >
                Accept
              </Button>
              <Button
                secondary
                compact
                disabled={action.busy}
                onPress={() => {
                  setEditing(s.fingerprint);
                  setEditAmount(String(s.amountMinor / 100));
                  setEditTitle(s.title);
                }}
              >
                Edit
              </Button>
              <Button
                secondary
                compact
                loading={
                  pending?.fingerprint === s.fingerprint &&
                  pending.kind === "reject"
                }
                disabled={action.busy}
                onPress={() =>
                  perform(
                    "reject",
                    s.fingerprint,
                    async () => {
                      if (!custom) {
                        await provider.markHandled(
                          s.fingerprint,
                          "REJECTED",
                          s.occurredAt,
                          { title: s.title, amountMinor: s.amountMinor },
                        );
                        setHistory(await provider.handled());
                      }
                      setSuggestions((items) =>
                        items.filter((i) => i.fingerprint !== s.fingerprint),
                      );
                    },
                    "Suggestion dismissed",
                  )
                }
              >
                Reject
              </Button>
            </XStack>
          </YStack>
        </Card>
      ))}
      {!!suggestions.length && !filteredSuggestions.length && (
        <Empty
          title="No matching messages"
          detail="Try a merchant name, amount, reference, or account digits."
        />
      )}
      {!custom && Object.keys(history).length > 0 && (
        <Card>
          <YStack gap={12}>
            <Heading size={18}>Reviewed this week</Heading>
            {Object.entries(history)
              .sort((a, b) => b[1].occurredAt.localeCompare(a[1].occurredAt))
              .map(([key, record]) => (
                <XStack key={key} justifyContent="space-between" gap={12}>
                  <YStack flex={1} gap={4}>
                    <Label>
                      {record.title ?? "Bank expense"}
                      {record.amountMinor
                        ? ` · ${money(record.amountMinor)}`
                        : ""}
                    </Label>
                    <Label muted size={11}>
                      {new Date(record.occurredAt).toLocaleString()}
                    </Label>
                  </YStack>
                  <Label>
                    {record.decision === "ACCEPTED" ? "Accepted" : "Rejected"}
                  </Label>
                </XStack>
              ))}
          </YStack>
        </Card>
      )}
      <Button secondary onPress={() => router.push("/add")}>
        Add a transaction manually
      </Button>
    </YStack>
  );
}
