import { PageHero } from "../components/illustrations";
import React, { useCallback, useMemo, useState, useEffect } from "react";
import { DatePicker } from "../components/DateTimePicker";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  View,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { YStack, XStack } from "tamagui";
import { useFocusEffect, useRouter } from "expo-router";
import {
  isUpiId,
  parseUpi,
  money,
  type ImportSuggestion,
} from "@settleup/domain";
import * as Clipboard from "expo-clipboard";
import { SaveUpiToPerson } from "./receive";
import {
  AndroidSmsProvider,
  type SmsDecision,
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
  Mascot,
  useColors,
} from "../components/ui";
export function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions(),
    [uri, setUri] = useState(""),
    [payment, setPayment] = useState<ReturnType<typeof parseUpi> | null>(null),
    [payeeAddress, setPayeeAddress] = useState(""),
    [paymentSource, setPaymentSource] = useState<"scan" | "manual">("scan"),
    [pasteMode, setPasteMode] = useState(false);
  const action = useAction();
  const router = useRouter();
  const c = useColors();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scannerTopInset = Platform.OS === "ios" ? 110 : 96;
  const scannerBottomInset = pasteMode ? 250 : 174;
  const scannerSpace = Math.max(
    170,
    screenHeight - scannerTopInset - scannerBottomInset,
  );
  const scanSize = Math.min(300, screenWidth * 0.76, scannerSpace);
  const scanLeft = (screenWidth - scanSize) / 2;
  const scanTop = scannerTopInset + Math.max(0, (scannerSpace - scanSize) / 2);
  const closeScanner = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        closeScanner();
        return true;
      });
      return () => listener.remove();
    }, [closeScanner]),
  );
  const inspect = (value: string, source: "scan" | "manual" = "scan") => {
    try {
      const result = parseUpi(value);
      setPayment(result);
      setPaymentSource(source);
      setPayeeAddress(result.payeeAddress);
      setUri(result.uri);
      action.setError("");
    } catch (e) {
      action.setError((e as Error).message);
    }
  };
  const inspectEntry = (value: string) => {
    const entered = value.trim();
    const paymentUri = entered.toLowerCase().startsWith("upi:")
      ? entered
      : `upi://pay?pa=${encodeURIComponent(entered)}&pn=${encodeURIComponent(entered)}&cu=INR`;
    inspect(paymentUri, "manual");
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
                backgroundColor: "#4F46E520",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Icon name="scan" size={44} color="#4F46E5" />
            </View>
            <Heading size={22}>Scan a UPI QR code</Heading>
            <Label muted style={{ textAlign: "center" }}>
              SettleUp needs camera access to read QR codes. Your camera feed is
              never stored or transmitted.
            </Label>
            <YStack gap={10} width="100%">
              <Button
                icon="camera"
                style={{ width: "100%", minHeight: 50 }}
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
              <Button
                secondary
                icon="image"
                style={{ width: "100%", minHeight: 50 }}
                onPress={pickImage}
              >
                Choose QR photo from gallery
              </Button>
              <Button
                secondary
                icon="edit"
                style={{ width: "100%", minHeight: 50 }}
                onPress={() => setPasteMode(true)}
              >
                Enter UPI ID instead
              </Button>
            </YStack>
            {pasteMode && (
              <YStack gap={12} width="100%">
                <Field
                  label="UPI ID or UPI URI"
                  placeholder="merchant@upi"
                  value={uri}
                  onChangeText={setUri}
                />
                <Button secondary onPress={() => inspectEntry(uri)}>
                  Review UPI ID
                </Button>
              </YStack>
            )}
            {!!action.error && <Notice error>{action.error}</Notice>}
          </YStack>
        )}
      </DataScreen>
    );
  }

  // Scan result screen
  if (payment) {
    // Merchant QRs carry a real merchant category code. Personal QRs either
    // omit `mc` or use 0000.
    const merchant = !!payment.fields.mc && payment.fields.mc !== "0000";
    return (
      <DataScreen>
        {(d) => (
          <YStack gap={18} maxWidth={760} width="100%" alignSelf="center">
            <XStack alignItems="center" gap={12}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to scanner"
                onPress={() => {
                  setPayment(null);
                  action.setError("");
                }}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  justifyContent: "center",
                }}
              >
                <Icon name="back" size={20} />
              </Pressable>
              <Heading size={20}>
                {merchant ? "Shop QR" : "Save UPI ID"}
              </Heading>
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
                      backgroundColor: "#4F46E515",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Label bold size={24} color="#4F46E5">
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
                    editable={paymentSource === "manual"}
                    placeholder="e.g. merchant@upi or 9876543210@paytm"
                  />
                  {paymentSource === "manual" && (
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
                  )}
                  {paymentSource === "scan" && (
                    <Label muted size={11}>
                      Locked to the payee encoded in the scanned QR.
                    </Label>
                  )}
                </YStack>

                {!!payment.note && (
                  <YStack gap={4}>
                    <Label muted size={11}>
                      Payment note
                    </Label>
                    <Label size={13}>{payment.note}</Label>
                  </YStack>
                )}

                {merchant ? (
                  <>
                    <Notice>
                      To pay this shop, scan the QR with your UPI app’s own
                      scanner. SettleUp doesn’t start UPI payments.
                    </Notice>
                    <Button
                      icon="plus"
                      onPress={() =>
                        router.push({
                          pathname: "/add",
                          params: {
                            title: payment.payeeName,
                            ...(payment.amountMinor !== undefined
                              ? {
                                  amount: (payment.amountMinor / 100).toFixed(2),
                                }
                              : {}),
                          },
                        })
                      }
                    >
                      Add as expense
                    </Button>
                    <Label muted size={11}>
                      Split it with a group after you pay.
                    </Label>
                    {isUpiId(payeeAddress) && (
                      <Chip
                        onPress={() =>
                          void Clipboard.setStringAsync(payeeAddress.trim())
                        }
                      >
                        Copy UPI ID
                      </Chip>
                    )}
                  </>
                ) : (
                  <>
                    <Notice>
                      To pay {payment.payeeName}, scan their QR inside your
                      UPI app. Save their UPI ID here so it’s ready when you
                      settle up.
                    </Notice>
                    {isUpiId(payeeAddress) ? (
                      <SaveUpiToPerson
                        d={d}
                        upiId={payeeAddress.trim()}
                        payeeName={payment.payeeName}
                      />
                    ) : (
                      <Notice error>Enter a valid UPI ID to save it.</Notice>
                    )}
                  </>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#000" }}
    >
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => inspect(data)}
      />

      {/* Dark overlay with transparent cutout */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: scanTop,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: scanTop + scanSize,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: scanTop,
            left: 0,
            width: scanLeft,
            height: scanSize,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: scanTop,
            right: 0,
            width: scanLeft,
            height: scanSize,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        />

        {/* Scan frame corners */}
        <View
          style={{
            position: "absolute",
            top: scanTop,
            left: scanLeft,
            width: scanSize,
            height: scanSize,
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
          paddingHorizontal: screenWidth < 360 ? 14 : 20,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={closeScanner}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon name="back" size={18} color="#FFF" />
        </Pressable>
        <Label bold size={16} color="#FFF">
          Scan UPI QR
        </Label>
        <View style={{ width: 40 }} />
      </View>

      {/* Instruction text */}
      <View
        style={{
          position: "absolute",
          top: Math.max(96, scanTop - 38),
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
          paddingHorizontal: screenWidth < 360 ? 14 : 24,
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

        <Label size={12} color="rgba(255,255,255,0.82)" textAlign="center">
          Scan a friend’s QR to save their UPI ID, or a shop QR to log an expense.
        </Label>

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
        <Pressable
          accessibilityRole="button"
          onPress={() => setPasteMode((visible) => !visible)}
          style={{
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.12)",
            paddingVertical: 10,
            borderRadius: 14,
          }}
        >
          <Label bold size={13} color="#FFF">
            Enter UPI ID
          </Label>
        </Pressable>
        {pasteMode && (
          <XStack
            gap={8}
            alignItems="flex-end"
            flexDirection={screenWidth < 340 ? "column" : "row"}
          >
            <View
              style={{ flex: 1, width: screenWidth < 340 ? "100%" : undefined }}
            >
              <Field
                label="UPI ID or UPI URI"
                placeholder="merchant@upi"
                value={uri}
                onChangeText={setUri}
              />
            </View>
            <Button
              compact
              style={{ width: screenWidth < 340 ? "100%" : undefined }}
              onPress={() => inspectEntry(uri)}
            >
              Review
            </Button>
          </XStack>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
export function SmsScreen() {
  return (
    <DataScreen>
      {(d) => <SmsContent key={d.account.id} accountId={d.account.id} />}
    </DataScreen>
  );
}

function SmsPrivacyExplainer({ onClose }: { onClose(): void }) {
  const c = useColors();
  const { width, fontScale } = useWindowDimensions();
  const compact = width / Math.max(fontScale, 1) < 380;
  const reveal = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.spring(reveal, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [reveal]);
  return (
    <Animated.View
      style={{
        opacity: reveal,
        transform: [
          {
            translateY: reveal.interpolate({
              inputRange: [0, 1],
              outputRange: [-12, 0],
            }),
          },
          {
            scale: reveal.interpolate({
              inputRange: [0, 1],
              outputRange: [0.98, 1],
            }),
          },
        ],
      }}
    >
      <View
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: compact ? 16 : 20,
          backgroundColor: c.mint,
          padding: compact ? 10 : 14,
          paddingRight: compact ? 36 : 42,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide Bank SMS explanation"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => ({
            position: "absolute",
            zIndex: 2,
            right: 10,
            top: 10,
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? c.card : `${c.card}CC`,
          })}
        >
          <Icon name="close" size={14} color={c.muted} />
        </Pressable>
        <XStack gap={compact ? 7 : 10} alignItems="center">
          <Mascot size={compact ? 48 : 70} mood="reading" />
          <YStack flex={1} gap={compact ? 4 : 7} minWidth={0}>
            <Heading size={compact ? 14 : 16}>
              Pip checks monetary messages
            </Heading>
            <Label
              muted
              size={compact ? 10 : 11}
              lineHeight={compact ? 14 : 16}
            >
              {compact
                ? "Pip finds confirmed spending in recent SMS. OTPs are ignored, and you approve every transaction."
                : "Pip checks recent monetary messages for confirmed spending. OTPs are excluded and nothing becomes a transaction until you accept it."}
            </Label>
            <XStack gap={4} flexWrap="wrap">
              {(compact
                ? ["No OTPs", "7 days", "You approve"]
                : ["OTPs excluded", "7-day window", "You approve each one"]
              ).map((item) => (
                <View
                  key={item}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: 10,
                    backgroundColor: `${c.card}B8`,
                    paddingHorizontal: compact ? 6 : 8,
                    paddingVertical: compact ? 3 : 5,
                  }}
                >
                  <Icon name="check" size={11} color="#43816E" />
                  <Label size={10} bold>
                    {item}
                  </Label>
                </View>
              ))}
            </XStack>
          </YStack>
        </XStack>
      </View>
    </Animated.View>
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
  const { width } = useWindowDimensions();
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
    [editTitle, setEditTitle] = useState(""),
    [showGuide, setShowGuide] = useState(true);
  const keys = useMemo(() => new Map<string, string>(), []);
  const filteredSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    // Incoming money is kept only for settle-up matching, not expense review.
    const expenses = suggestions.filter((item) => item.direction !== "CREDIT");
    if (!query) return expenses;
    return expenses.filter((suggestion) =>
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
    if (pending) return false;
    setPending({ kind, fingerprint });
    try {
      return await action.run(work, success);
    } finally {
      setPending(null);
    }
  };
  const decideOptimistically = async (
    kind: "accept" | "reject",
    suggestion: ImportSuggestion,
    work: () => Promise<void>,
    success: string,
  ) => {
    let previousIndex = 0;
    setSuggestions((current) => {
      previousIndex = Math.max(
        0,
        current.findIndex(
          (item) => item.fingerprint === suggestion.fingerprint,
        ),
      );
      return current.filter(
        (item) => item.fingerprint !== suggestion.fingerprint,
      );
    });
    const saved = await perform(kind, suggestion.fingerprint, work, success);
    if (!saved)
      setSuggestions((current) => {
        if (current.some((item) => item.fingerprint === suggestion.fingerprint))
          return current;
        const restored = [...current];
        restored.splice(previousIndex, 0, suggestion);
        return restored;
      });
  };
  useEffect(() => {
    let live = true;
    if (provider.available())
      void provider.hasPermission().then((granted) => {
        if (!live || !granted) return;
        setEnabled(true);
        void Promise.all([
          provider.cachedSuggestions(),
          provider.handled(),
        ]).then(([items, records]) => {
          if (live) {
            setSuggestions(items);
            setHistory(records);
          }
        });
      });
    const cached = provider.subscribeCachedSuggestions((items) => {
      if (live && !custom) setSuggestions(items);
    });
    return () => {
      live = false;
      cached.remove();
    };
  }, [custom, provider]);

  return (
    <YStack gap={12} maxWidth={760} width="100%" alignSelf="center">
      <XStack
        gap={10}
        alignItems="flex-start"
        justifyContent="space-between"
        flexWrap={width < 350 ? "wrap" : "nowrap"}
      >
        <YStack flex={1}>
          <PageHero
            eyebrow="Inbox"
            title="Bank SMS review"
            subtitle="Confirm, correct, or dismiss suggested transactions."
          />
        </YStack>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Bank SMS review works"
          accessibilityHint="Shows the privacy explanation"
          onPress={() => setShowGuide(true)}
          style={({ pressed }) => ({
            minHeight: 36,
            paddingHorizontal: 10,
            borderRadius: 12,
            backgroundColor: pressed || showGuide ? c.soft : c.card,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          })}
        >
          <View
            style={{
              width: 19,
              height: 19,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: "#64748B",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Label bold size={11} color="#64748B">
              i
            </Label>
          </View>
          <Label bold size={11} color={c.muted}>
            How it works
          </Label>
        </Pressable>
      </XStack>
      {showGuide && <SmsPrivacyExplainer onClose={() => setShowGuide(false)} />}
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
                  <Icon name="sms" size={18} color="#64748B" />
                </View>
                <Label muted size={11} flex={1} lineHeight={16}>
                  The weekly inbox covers today and the previous six days. SMS
                  bodies are not stored by SettleUp, and AI provider data
                  collection is disabled.
                </Label>
              </XStack>
              <XStack gap={8} flexWrap="wrap">
                <Chip
                  selected={!custom}
                  onPress={() => {
                    setCustom(false);
                    setEditing(null);
                    void provider.cachedSuggestions().then(setSuggestions);
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
                  <DatePicker
                    label="From"
                    value={from}
                    onChange={(value) => {
                      setFrom(value);
                      setSuggestions([]);
                    }}
                  />
                  <DatePicker
                    label="Through"
                    value={through}
                    onChange={(value) => {
                      setThrough(value);
                      setSuggestions([]);
                    }}
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
                        custom
                          ? await provider.review({ from, through })
                          : await provider.refreshCachedInbox(true),
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
          {enabled && !suggestions.some((item) => item.direction !== "CREDIT") && (
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
      {suggestions.some((item) => item.direction !== "CREDIT") && (
        <Field
          label="Search messages"
          placeholder="Merchant, amount, reference or account"
          value={search}
          onChangeText={setSearch}
        />
      )}
      {filteredSuggestions.map((s) => (
        <Card key={s.fingerprint} style={{ padding: 13 }}>
          <YStack gap={9}>
            <XStack alignItems="center" gap={9}>
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
                <Icon name="up" size={18} color="#64748B" />
              </View>
              <YStack flex={1} minWidth={0} gap={2}>
                {editing === s.fingerprint ? (
                  <Field
                    label="Transaction title"
                    value={editTitle}
                    onChangeText={setEditTitle}
                    autoFocus
                    onSubmitEditing={() => setEditing(null)}
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${s.title}`}
                    onPress={() => {
                      setEditing(s.fingerprint);
                      setEditTitle(s.title);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Heading size={16}>{s.title}</Heading>
                    </View>
                    <Icon name="edit" size={13} color={c.muted} />
                  </Pressable>
                )}
                <Label muted size={10}>
                  {s.direction.toLowerCase()} ·
                  {new Date(s.occurredAt).toLocaleString()}
                  {s.accountSuffix ? ` · A/c •${s.accountSuffix}` : ""}
                </Label>
              </YStack>
              <View
                style={{
                  backgroundColor: c.soft,
                  borderRadius: 12,
                  maxWidth: width < 360 ? 108 : 150,
                  paddingHorizontal: width < 360 ? 8 : 11,
                  paddingVertical: 8,
                }}
              >
                <Label
                  bold
                  size={width < 360 ? 14 : 16}
                  color="#514B8F"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {money(s.amountMinor)}
                </Label>
              </View>
            </XStack>
            <XStack gap={7} alignItems="center">
              <Button
                secondary
                compact
                style={{ flex: 1, minHeight: 36, paddingVertical: 7 }}
                disabled={!!pending && pending.fingerprint !== s.fingerprint}
                onPress={() =>
                  decideOptimistically(
                    "reject",
                    s,
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
                    },
                    "Suggestion dismissed",
                  )
                }
              >
                Reject
              </Button>
              <Button
                compact
                style={{ flex: 1, minHeight: 36, paddingVertical: 7 }}
                disabled={!!pending && pending.fingerprint !== s.fingerprint}
                onPress={() =>
                  decideOptimistically(
                    "accept",
                    s,
                    async () => {
                      if (!keys.has(s.fingerprint))
                        keys.set(
                          s.fingerprint,
                          `${s.fingerprint.slice(0, 8)}-${s.fingerprint.slice(8, 12)}-4${s.fingerprint.slice(13, 16)}-8${s.fingerprint.slice(17, 20)}-${s.fingerprint.slice(20, 32)}`,
                        );
                      await repository.create(accountId, {
                        idempotencyKey: keys.get(s.fingerprint)!,
                        title: editing === s.fingerprint ? editTitle : s.title,
                        amountMinor: s.amountMinor,
                        currency: "INR",
                        type: "PERSONAL_EXPENSE",
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
                            amountMinor: s.amountMinor,
                          },
                        );
                        setHistory(await provider.handled());
                      }
                    },
                    "Suggestion accepted",
                  )
                }
              >
                Accept
              </Button>
            </XStack>
          </YStack>
        </Card>
      ))}
      {suggestions.some((item) => item.direction !== "CREDIT") && !filteredSuggestions.length && (
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
