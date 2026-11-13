import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { XStack, YStack } from "tamagui";
import { money, parseMoney } from "@settleup/domain";
import {
  extractBillWithOpenRouter,
  type ExtractedBillResult,
} from "../services/aiBillScanner";
import {
  Card,
  Label,
  Heading,
  Button,
  Field,
  Notice,
  Icon,
  IconButton,
  PipFeedback,
  useColors,
} from "../components/ui";

export type BillPhoto = { uri: string; contentType: string };
export type BillLine = { name: string; quantity: string; amount: string };
function CameraAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "image" | "close";
  label: string;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 64,
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        opacity: disabled || pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} color="white" />
      <Label color="white" size={12} textAlign="center">
        {label}
      </Label>
    </Pressable>
  );
}
export function BillEditor({
  accountId,
  currency,
  amount,
  lines,
  onLines,
  onAmount,
  onMerchantName,
  photo,
  onPhoto,
  onBusy,
  autoCapture = false,
  onAutoCaptureHandled,
  autoCamera,
}: {
  accountId: string;
  currency: string;
  amount: string;
  lines: BillLine[];
  onLines(lines: BillLine[]): void;
  onAmount(amount: string): void;
  onMerchantName?(name: string): void;
  photo: BillPhoto | null;
  onPhoto(photo: BillPhoto | null): void;
  onBusy(busy: boolean): void;
  autoCapture?: boolean;
  onAutoCaptureHandled?(): void;
  autoCamera?: boolean;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [aiStatus, setAiStatus] = useState("");
  const [result, setResult] = useState<ExtractedBillResult | null>(null);
  const [camera, setCamera] = useState(false),
    [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null),
    [ready, setReady] = useState(false);

  React.useEffect(() => {
    if (autoCamera) {
      task(async () => {
        const access = permission?.granted
          ? permission
          : await requestPermission();
        if (access.granted) {
          setReady(false);
          setCamera(true);
        }
      });
    }
  }, [autoCamera]);

  useFocusEffect(useCallback(() => () => setCamera(false), []));
  const task = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try a clearer photo.");
    } finally {
      setBusy(false);
      onBusy(false);
      setAiStatus("");
    }
  };
  const openCamera = async () => {
    const access = permission?.granted ? permission : await requestPermission();
    if (!access.granted)
      throw new Error(
        "Camera access is off. Allow it in settings, or choose a photo.",
      );
    setReady(false);
    setCamera(true);
  };
  const captureRequested = useRef(false);
  useEffect(() => {
    if (!autoCapture) {
      captureRequested.current = false;
      return;
    }
    if (!permission || busy || captureRequested.current) return;
    captureRequested.current = true;
    if (!camera) void task(openCamera);
    onAutoCaptureHandled?.();
  }, [autoCapture, permission, busy]);
  const choose = () =>
    task(async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const contentType = asset.mimeType ?? "image/jpeg";
      if (!["image/jpeg", "image/png"].includes(contentType))
        throw new Error("Choose a JPEG or PNG bill photo.");
      if (asset.fileSize && asset.fileSize > 10485760)
        throw new Error("Choose a bill photo smaller than 10 MB.");
      onPhoto({ uri: asset.uri, contentType });
      setResult(null);
      setCamera(false);
    });
  let lineTotal: number | undefined;
  try {
    lineTotal = lines.reduce(
      (sum, l) =>
        sum +
        parseMoney(l.amount.replace(/^-/, ""), currency, true) *
          (l.amount.startsWith("-") ? -1 : 1),
      0,
    );
  } catch {}
  let difference: number | undefined;
  try {
    if (lineTotal !== undefined && amount)
      difference = parseMoney(amount, currency) - lineTotal;
  } catch {}
  const update = (index: number, patch: Partial<BillLine>) =>
    onLines(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  return (
    <Card style={{ padding: 16 }}>
      <YStack gap={17}>
        <XStack gap={14} alignItems="center" justifyContent="space-between">
          <YStack flex={1}>
            <Heading size={20}>Start with the bill</Heading>
            <Label muted size={12}>
              A photo now. Every detail in one place.
            </Label>
          </YStack>
          <View
            style={{ padding: 12, backgroundColor: c.soft, borderRadius: 16 }}
          >
            <Label color="#4338CA" bold size={13}>
              BILL
            </Label>
          </View>
        </XStack>
        <XStack gap={10} flexWrap="wrap">
          <Button
            secondary
            icon="camera"
            disabled={busy}
            onPress={() => task(openCamera)}
          >
            Take bill photo
          </Button>
          <Button secondary icon="image" disabled={busy} onPress={choose}>
            Choose bill photo
          </Button>
        </XStack>
        <Modal
          visible={camera}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setCamera(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                setError("Camera unavailable. Choose a bill photo instead.");
                setCamera(false);
              }}
            />
            <SafeAreaView style={{ flex: 1 }}>
              <View
                style={{
                  alignItems: "center",
                  padding: 16,
                  backgroundColor: "rgba(0,0,0,0.45)",
                }}
              >
                <Label bold size={20} color="#FFFFFF" textAlign="center">
                  Scan your bill
                </Label>
                <Label size={12} color="#FFFFFF" textAlign="center">
                  Fit all four edges in the frame and avoid glare.
                </Label>
              </View>
              <View
                pointerEvents="none"
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: "82%",
                    maxWidth: 430,
                    height: "84%",
                    maxHeight: 610,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: "white",
                  }}
                />
              </View>
              <XStack
                padding={12}
                alignItems="flex-start"
                backgroundColor="rgba(0,0,0,0.55)"
              >
                <CameraAction
                  icon="image"
                  label="Gallery"
                  disabled={busy}
                  onPress={choose}
                />
                <YStack flex={1} minWidth={0} alignItems="center" gap={5}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Capture bill"
                    accessibilityState={{ disabled: !ready || busy, busy }}
                    disabled={!ready || busy}
                    style={({ pressed }) => ({
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      borderWidth: 3,
                      borderColor: "white",
                      padding: 4,
                      opacity: !ready || pressed ? 0.55 : 1,
                    })}
                    onPress={() =>
                      task(async () => {
                        let capture;
                        for (let attempt = 0; attempt < 20; attempt++) {
                          try {
                            capture = await cameraRef.current?.takePictureAsync(
                              {
                                quality: 0.95,
                                imageType: "jpg",
                              },
                            );
                            break;
                          } catch (error) {
                            if (
                              (error as { code?: string }).code !==
                              "ERR_CAMERA_NOT_READY"
                            )
                              throw error;
                            if (attempt === 19)
                              throw new Error(
                                "The camera is still starting. Please try capturing again.",
                              );
                            await new Promise((resolve) =>
                              setTimeout(resolve, 100),
                            );
                          }
                        }
                        if (!capture)
                          throw new Error(
                            "Could not capture the bill. Please try again.",
                          );
                        onPhoto({
                          uri: capture.uri,
                          contentType: "image/jpeg",
                        });
                        setResult(null);
                        setCamera(false);
                      })
                    }
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 32,
                        backgroundColor: "white",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator color="#4338CA" />
                      ) : (
                        <Icon name="camera" color="#25212D" />
                      )}
                    </View>
                  </Pressable>
                  <Label color="#FFFFFF" size={12} textAlign="center">
                    {ready ? "Capture bill" : "Starting camera…"}
                  </Label>
                </YStack>
                <CameraAction
                  icon="close"
                  label="Cancel"
                  disabled={busy}
                  onPress={() => setCamera(false)}
                />
              </XStack>
            </SafeAreaView>
          </View>
        </Modal>
        {photo && (
          <YStack gap={12}>
            <Image
              source={{ uri: photo.uri }}
              accessibilityLabel="Selected bill photo"
              resizeMode="contain"
              style={{
                width: "100%",
                height: 220,
                borderRadius: 16,
                backgroundColor: c.bg,
              }}
            />
            <XStack gap={10} flexWrap="wrap">
              <Button
                icon="scan"
                disabled={busy}
                onPress={() =>
                  task(async () => {
                    setResult(null);
                    const extracted = await extractBillWithOpenRouter(
                      accountId,
                      photo.uri,
                      currency,
                      setAiStatus,
                    );
                    setResult(extracted);
                    setAiStatus("");
                  })
                }
              >
                {busy ? aiStatus || "Reading…" : "Extract itemised bill"}
              </Button>
              <Button
                secondary
                disabled={busy}
                onPress={() => {
                  onPhoto(null);
                  setResult(null);
                }}
              >
                Remove photo
              </Button>
            </XStack>
          </YStack>
        )}
        {busy && (
          <>
            <PipFeedback
              mood="reading"
              message={aiStatus || "Let’s take a closer look."}
            />
            <Label muted size={11}>
              {aiStatus || "Reading every visible item, tax and discount…"}
            </Label>
          </>
        )}
        {!!error && (
          <>
            <PipFeedback
              mood="help"
              message="We can fill in the details together."
            />
            <Notice error>{error}</Notice>
          </>
        )}
        {result && (
          <YStack
            gap={12}
            padding={16}
            backgroundColor={c.soft}
            borderRadius={16}
          >
            <PipFeedback
              mood="success"
              message={
                result.isHandwritten
                  ? "I read the handwriting. Please check every line."
                  : "I reconciled the visible bill details."
              }
            />
            <YStack gap={2}>
              <Label bold size={15}>
                {result.merchantName || "Company name not clear"}
              </Label>
              <Label muted size={11}>
                {[result.documentType, result.invoiceNumber, result.invoiceDate]
                  .filter(Boolean)
                  .join(" · ")}
              </Label>
              {!!result.taxId && (
                <Label muted size={11}>
                  Tax ID / GSTIN: {result.taxId}
                </Label>
              )}
            </YStack>
            <Label bold>
              Detected total: {money(result.totalMinor, currency)}
            </Label>
            <Label muted size={12}>
              {result.items.length} suggested lines. Using these replaces your
              current items and amount.
            </Label>
            {!!result.taxes.length && (
              <XStack gap={7} flexWrap="wrap">
                {result.taxes.map((tax, index) => (
                  <View
                    key={`${tax.type}-${index}`}
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: c.card,
                    }}
                  >
                    <Label size={10} bold>
                      {tax.type}
                      {tax.rate !== undefined ? ` ${tax.rate}%` : ""} ·{" "}
                      {money(tax.amountMinor, currency)}
                    </Label>
                  </View>
                ))}
              </XStack>
            )}
            {result.items.slice(0, 5).map((item, i) => (
              <XStack key={i} gap={12} justifyContent="space-between">
                <Label size={12} flex={1}>
                  {item.quantity} × {item.name}
                </Label>
                <Label size={12}>{money(item.amountMinor, currency)}</Label>
              </XStack>
            ))}
            {result.items.length > 5 && (
              <Label muted size={12}>
                And {result.items.length - 5} more lines to review.
              </Label>
            )}
            {result.warnings.slice(0, 3).map((warning, index) => (
              <Notice key={`${warning}-${index}`}>{warning}</Notice>
            ))}
            <Button
              onPress={() => {
                const factor =
                  10 **
                  new Intl.NumberFormat("en", {
                    style: "currency",
                    currency,
                  }).resolvedOptions().maximumFractionDigits!;
                onLines(
                  result.items.map((i) => ({
                    name: i.name,
                    quantity: String(i.quantity),
                    amount: String(i.amountMinor / factor),
                  })),
                );
                if (result.totalMinor !== undefined)
                  onAmount(String(result.totalMinor / factor));
                if (result.merchantName) onMerchantName?.(result.merchantName);
                setResult(null);
                onPhoto(null);
              }}
            >
              Use scanned details
            </Button>
            <Button secondary onPress={() => setResult(null)}>
              Keep my entries
            </Button>
          </YStack>
        )}
        <Label muted size={11}>
          The image is sent once for itemisation and is not stored with the
          transaction. Check items, taxes, discounts and total before saving.
        </Label>
        <View style={{ height: 1, backgroundColor: c.line }} />
        <XStack alignItems="center" justifyContent="space-between">
          <Heading size={18}>
            Items{" "}
            <Label muted size={12}>
              (optional)
            </Label>
          </Heading>
          <Label muted size={12}>
            {lines.length}/100
          </Label>
        </XStack>
        {lines.map((line, index) => (
          <YStack
            key={index}
            gap={10}
            paddingBottom={14}
            borderBottomWidth={1}
            borderColor={c.line}
          >
            <XStack gap={8} alignItems="center">
              <YStack flex={1}>
                <Field
                  label={`Item ${index + 1}`}
                  value={line.name}
                  onChangeText={(name) => update(index, { name })}
                  placeholder="Coffee, groceries, tax…"
                />
              </YStack>
              <IconButton
                name="close"
                label={`Remove item ${index + 1}`}
                onPress={() => onLines(lines.filter((_, i) => i !== index))}
              />
            </XStack>
            <XStack gap={10}>
              <YStack flex={1}>
                <Field
                  label={`Quantity ${index + 1}`}
                  keyboardType="decimal-pad"
                  value={line.quantity}
                  onChangeText={(quantity) => update(index, { quantity })}
                />
              </YStack>
              <YStack flex={2}>
                <Field
                  label={`Line total ${index + 1} · ${currency}`}
                  keyboardType="numbers-and-punctuation"
                  value={line.amount}
                  onChangeText={(amount) => update(index, { amount })}
                  placeholder="0.00"
                />
              </YStack>
            </XStack>
          </YStack>
        ))}
        <Button
          secondary
          icon="plus"
          disabled={lines.length >= 100 || busy}
          onPress={() =>
            onLines([...lines, { name: "", quantity: "1", amount: "" }])
          }
        >
          Add item
        </Button>
        {lines.length > 0 && (
          <YStack gap={8}>
            <Label muted size={11}>
              Line total includes the quantity. Add tax as a line and discounts
              as negative amounts.
            </Label>
            <Label bold>
              Items total:{" "}
              {lineTotal === undefined
                ? "Complete each line"
                : money(lineTotal, currency)}
            </Label>
            {difference !== undefined && difference !== 0 && (
              <Notice>
                Items differ from the expense by {money(difference, currency)}.
                Check for missing tax, discounts or items.
              </Notice>
            )}
            {difference === 0 && (
              <Label color="#4338CA" bold size={12}>
                Everything adds up.
              </Label>
            )}
            {lineTotal !== undefined && lineTotal > 0 && difference !== 0 && (
              <Button
                secondary
                onPress={() => {
                  const factor =
                    10 **
                    new Intl.NumberFormat("en", {
                      style: "currency",
                      currency,
                    }).resolvedOptions().maximumFractionDigits!;
                  onAmount(String(lineTotal! / factor));
                }}
              >
                Use items total as amount
              </Button>
            )}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
