import React, { useMemo, useState } from "react";
import { Platform, View, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
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
  paymentLauncher,
  paymentRequest,
  chooseContact,
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
    [pasteMode, setPasteMode] = useState(false),
    [contactModal, setContactModal] = useState<{
      name: string;
      phone: string;
      upiId: string;
    } | null>(null);
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

  // Contact UPI setup screen
  if (contactModal) {
    return (
      <DataScreen>
        {() => (
          <YStack gap={22} maxWidth={500} width="100%" alignSelf="center">
            <XStack alignItems="center" gap={12}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel contact payment"
                onPress={() => setContactModal(null)}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: "center",
                }}
              >
                <Icon name="arrow" size={20} />
              </Pressable>
              <Heading size={20}>Pay Contact via UPI</Heading>
            </XStack>

            <Card style={{ padding: 20 }}>
              <YStack gap={18}>
                <YStack
                  alignItems="center"
                  gap={8}
                  paddingBottom={12}
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
                      {contactModal.name.charAt(0).toUpperCase()}
                    </Label>
                  </View>
                  <Heading size={20}>{contactModal.name}</Heading>
                  <Label muted size={12}>
                    {contactModal.phone}
                  </Label>
                </YStack>

                <YStack gap={6}>
                  <Field
                    label="Contact UPI ID / VPA"
                    placeholder="e.g. 9876543210@paytm or name@okicici"
                    value={contactModal.upiId}
                    onChangeText={(text) =>
                      setContactModal({ ...contactModal, upiId: text })
                    }
                  />
                  <Label muted size={11}>
                    Tap to select handle extension:
                  </Label>
                  <XStack flexWrap="wrap" gap={6}>
                    {[
                      "@paytm",
                      "@ybl",
                      "@okicici",
                      "@oksbi",
                      "@upi",
                      "@axl",
                      "@icici",
                    ].map((ext) => (
                      <Chip
                        key={ext}
                        selected={contactModal.upiId.endsWith(ext)}
                        onPress={() => {
                          const base = contactModal.upiId.includes("@")
                            ? contactModal.upiId.split("@")[0]
                            : contactModal.upiId;
                          setContactModal({
                            ...contactModal,
                            upiId: `${base}${ext}`,
                          });
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

                {!!action.error && <Notice error>{action.error}</Notice>}

                <Button
                  onPress={() => {
                    if (!contactModal.upiId.trim()) {
                      action.setError(
                        "Enter or select a valid UPI ID for this contact.",
                      );
                      return;
                    }
                    const activeUpi = contactModal.upiId.trim();
                    const upiUri = `upi://pay?pa=${encodeURIComponent(activeUpi)}&pn=${encodeURIComponent(contactModal.name)}${amount ? `&am=${amount}` : ""}`;
                    setContactModal(null);
                    inspect(upiUri);
                  }}
                >
                  Continue to pay {amount ? `₹${amount}` : ""}
                </Button>
              </YStack>
            </Card>
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
          onPress={() =>
            action.run(async () => {
              const contact = await chooseContact();
              if (contact) {
                const rawPhone = contact.phone.replace(/[^0-9]/g, "");
                const phone10 =
                  rawPhone.length >= 10 ? rawPhone.slice(-10) : rawPhone;
                const initialUpi = phone10 ? `${phone10}@paytm` : "";
                setContactModal({
                  name: contact.name,
                  phone: contact.phone,
                  upiId: initialUpi,
                });
              }
            }, "Contact selected")
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "rgba(255,255,255,0.18)",
            borderRadius: 12,
            paddingVertical: 11,
            paddingHorizontal: 16,
          }}
        >
          <Icon name="groups" color="#FFF" size={18} />
          <Label size={13} bold color="#FFF">
            Pay a contact (Phone Book)
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
    router = useRouter();
  const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]),
    [enabled, setEnabled] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [editAmount, setEditAmount] = useState(""),
    [editTitle, setEditTitle] = useState("");
  const keys = useMemo(() => new Map<string, string>(), []);
  return (
    <YStack gap={22} maxWidth={760} width="100%" alignSelf="center">
      <Heading>A second pair of eyes.</Heading>
      <Label muted>
        Review suggested transactions from financial messages. You stay in
        control.
      </Label>
      <Card>
        <YStack gap={16}>
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
              <Notice>
                When enabled, SettleUp checks up to 1,000 messages from the last
                seven days on this device. Raw messages never leave your phone.
                Suggestions can be wrong—review each one. Handled-message
                fingerprints expire after seven days.
              </Notice>
              <Button
                onPress={() =>
                  action.run(async () => {
                    if (!(await provider.requestPermission()))
                      throw new Error(
                        "SMS permission was declined. Manual entry is always available.",
                      );
                    setSuggestions(await provider.review());
                    setEnabled(true);
                  }, "Review ready")
                }
              >
                Enable SMS transaction review
              </Button>
            </>
          )}
          {!!action.error && <Notice error>{action.error}</Notice>}
          {enabled && !suggestions.length && (
            <Empty
              title="Your inbox is all caught up"
              detail="No new financial suggestions from the last seven days."
            />
          )}
        </YStack>
      </Card>
      {suggestions.map((s) => (
        <Card key={s.fingerprint}>
          <YStack gap={14}>
            <Heading size={18}>{s.title}</Heading>
            <Label>
              {money(s.amountMinor)} · {s.direction.toLowerCase()}
            </Label>
            {s.direction === "CREDIT" && (
              <Notice>
                Accept as personal money in only. If this is a loan repayment,
                reject this suggestion and use Record repayment so the correct
                debt is reduced.
              </Notice>
            )}
            <Label muted size={11}>
              {new Date(s.occurredAt).toLocaleString()}{" "}
              {s.accountSuffix ? `· account ending ${s.accountSuffix}` : ""}
            </Label>
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
            <XStack gap={10} flexWrap="wrap">
              <Button
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
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
                    await provider.markHandled(s.fingerprint);
                    setSuggestions((items) =>
                      items.filter((i) => i.fingerprint !== s.fingerprint),
                    );
                  }, "Suggestion accepted")
                }
              >
                Accept
              </Button>
              <Button
                secondary
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
                onPress={() =>
                  action.run(async () => {
                    await provider.markHandled(s.fingerprint);
                    setSuggestions((items) =>
                      items.filter((i) => i.fingerprint !== s.fingerprint),
                    );
                  }, "Suggestion dismissed")
                }
              >
                Reject
              </Button>
            </XStack>
          </YStack>
        </Card>
      ))}
      <Button secondary onPress={() => router.push("/add")}>
        Add a transaction manually
      </Button>
    </YStack>
  );
}
