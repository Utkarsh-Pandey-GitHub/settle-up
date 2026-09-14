import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Image, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { XStack, YStack } from "tamagui";
import { parseReceipt } from "@settleup/domain/src/receipt";
import { money, parseMoney } from "@settleup/domain";
import { recognizeReceipt } from "../services/receipt";
import { extractBillWithOpenRouter } from "../services/aiBillScanner";
import {
  Card,
  Label,
  Heading,
  Button,
  Field,
  Notice,
  IconButton,
  Progress,
  PipFeedback,
  useColors,
} from "../components/ui";

export type BillPhoto = { uri: string; contentType: string };
export type BillLine = { name: string; quantity: string; amount: string };
export function BillEditor({
  currency,
  amount,
  lines,
  onLines,
  onAmount,
  photo,
  onPhoto,
  onBusy,
  autoCapture = false,
  onAutoCaptureHandled,
  autoCamera,
}: {
  currency: string;
  amount: string;
  lines: BillLine[];
  onLines(lines: BillLine[]): void;
  onAmount(amount: string): void;
  photo: BillPhoto | null;
  onPhoto(photo: BillPhoto | null): void;
  onBusy(busy: boolean): void;
  autoCapture?: boolean;
  onAutoCaptureHandled?(): void;
  autoCamera?: boolean;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [aiStatus, setAiStatus] = useState("");
  const [result, setResult] = useState<ReturnType<typeof parseReceipt> | null>(
    null,
  );
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
        quality: 0.85,
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
    <Card style={{ borderColor: "#CFC0F2", padding: 20 }}>
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
            <Label color="#6D3CC3" bold size={13}>
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
        {camera && (
          <YStack gap={10}>
            <View style={{ height: 320, borderRadius: 18, overflow: "hidden" }}>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing="back"
                onCameraReady={() => setReady(true)}
                onMountError={() => {
                  setError("Camera unavailable. Choose a bill photo instead.");
                  setCamera(false);
                }}
              />
            </View>
            <Label muted size={12}>
              Fit the whole bill in the frame. Hold still and avoid shadows.
            </Label>
            <XStack gap={10}>
              <Button
                disabled={!ready || busy}
                onPress={() =>
                  task(async () => {
                    let capture;
                    // Web can report camera readiness before its first video frame.
                    for (let attempt = 0; attempt < 20; attempt++) {
                      try {
                        capture = await cameraRef.current?.takePictureAsync({
                          quality: 0.85,
                          imageType: "jpg",
                        });
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
                    onPhoto({ uri: capture.uri, contentType: "image/jpeg" });
                    setResult(null);
                    setCamera(false);
                  })
                }
              >
                Capture bill
              </Button>
              <Button
                secondary
                disabled={busy}
                onPress={() => setCamera(false)}
              >
                Cancel camera
              </Button>
            </XStack>
          </YStack>
        )}
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
                    setProgress(0);
                    setResult(null);
                    setAiStatus("Connecting to OpenRouter AI...");
                    try {
                      const aiResult = await extractBillWithOpenRouter(
                        photo.uri,
                        currency,
                        setAiStatus,
                      );
                      if (
                        aiResult.items.length > 0 ||
                        aiResult.totalMinor !== undefined
                      ) {
                        setResult({
                          items: aiResult.items,
                          totalMinor: aiResult.totalMinor,
                        });
                        setAiStatus("");
                        return;
                      }
                    } catch (aiErr) {
                      console.warn(
                        "OpenRouter AI extraction failed, trying local OCR:",
                        aiErr,
                      );
                    }
                    setAiStatus("Falling back to local OCR...");
                    const text = await recognizeReceipt(photo.uri, setProgress);
                    const parsed = parseReceipt(text, currency);
                    if (!parsed.items.length && !parsed.totalMinor)
                      throw new Error(
                        "No amounts were found. Try a straight, well-lit photo, or add items below.",
                      );
                    setResult(parsed);
                    setAiStatus("");
                  })
                }
              >
                {busy ? aiStatus || "Working…" : "Extract with AI (OpenRouter)"}
              </Button>
              <Button
                secondary
                disabled={busy}
                onPress={() =>
                  task(async () => {
                    setProgress(0);
                    setResult(null);
                    setAiStatus("Scanning locally...");
                    const text = await recognizeReceipt(photo.uri, setProgress);
                    const parsed = parseReceipt(text, currency);
                    if (!parsed.items.length && !parsed.totalMinor)
                      throw new Error(
                        "No amounts were found. Try a straight, well-lit photo, or add items below.",
                      );
                    setResult(parsed);
                    setAiStatus("");
                  })
                }
              >
                Local OCR
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
            {progress > 0 && <Progress value={progress * 100} />}
            <Label muted size={11}>
              {aiStatus ||
                "Reading receipt details. AI model extraction in progress..."}
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
              message="Found a few details. Give them a quick check."
            />
            <Label bold>
              {result.totalMinor !== undefined
                ? `Detected total: ${money(result.totalMinor, currency)}`
                : "No clear total found. Enter the bill total manually."}
            </Label>
            <Label muted size={12}>
              {result.items.length} suggested lines. Using these replaces your
              current items
              {result.totalMinor !== undefined ? " and amount" : ""}.
            </Label>
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
                setResult(null);
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
          Free, local text recognition for English bills. Check the total,
          items, taxes and discounts before saving. The photo is attached when
          you save.
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
              <Label color="#6D3CC3" bold size={12}>
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
