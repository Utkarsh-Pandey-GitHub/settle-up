import React, { createContext, useContext, useEffect, useRef } from "react";
import { Modal, ScrollView, View, useWindowDimensions } from "react-native";
import { XStack, YStack } from "tamagui";
import { Button, Icon, Label, Mascot, useColors, type IconName } from "./ui";

export const TourStepContext = createContext<number | null>(null);
export type TourRect = { x: number; y: number; width: number; height: number };
export const TourMeasureContext = createContext<(rect: TourRect) => void>(
  () => {},
);

// Outlines follow the actual containers through scrolling and resizing.
export function TourGroup({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  const active = useContext(TourStepContext) === step;
  const report = useContext(TourMeasureContext);
  const ref = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const measure = () => {
    if (active)
      ref.current?.measureInWindow((x, y, width, height) =>
        report({ x, y, width, height }),
      );
  };
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [active, width, height]);
  return (
    <View ref={ref} collapsable={false} onLayout={measure}>
      {children}
      {active && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderWidth: 3,
            borderColor: "#F5F5EF",
            borderRadius: 18,
          }}
        />
      )}
    </View>
  );
}

const steps = [
  {
    title: "Your top controls",
    detail:
      "SettleUp identifies your home space. SMS lets you review bank debits. The link icon creates payment links. Your avatar switches accounts and leads to Settings.",
  },
  {
    title: "Your five main destinations",
    detail:
      "Home shows spending and balances. Transactions lists your records. Scan QR opens the payment scanner. Analytics shows spending trends. Groups opens shared ledgers and members.",
  },
  {
    title: "Quick actions from Home",
    detail:
      "Add expense records a transaction or split. Settle debts logs a repayment made outside the app. Scan bill opens the camera to capture a receipt and extract its amount and items.",
  },
  {
    title: "Widgets for quick access",
    detail:
      "Add SettleUp widgets from your phone’s home-screen widget picker. Quick actions opens QR scan, bill scan, expense, and payment links. Spending shows progress and goals at a glance.",
  },
];

const pointers: { icon: IconName; text: string }[][] = [
  [
    { icon: "home", text: "SettleUp — your home space." },
    { icon: "sms", text: "SMS — review bank debits." },
    { icon: "link", text: "Link — create or open payment links." },
    { icon: "groups", text: "Avatar — accounts and Settings." },
  ],
  [
    { icon: "home", text: "Home — spending and balances." },
    { icon: "activity", text: "Transactions — your money records." },
    { icon: "scan", text: "Scan QR — scan a payment code." },
    { icon: "chart", text: "Analytics — spending trends." },
    { icon: "groups", text: "Groups — shared ledgers and members." },
  ],
  [
    { icon: "plus", text: "Add expense — record or split a transaction." },
    {
      icon: "arrow",
      text: "Settle debts — log a repayment made outside the app.",
    },
    {
      icon: "camera",
      text: "Scan bill — capture a receipt to extract its amount and items.",
    },
  ],
  [
    {
      icon: "wallet",
      text: "Quick actions — QR, bill, expense, and payment links.",
    },
    { icon: "chart", text: "Spending — weekly or monthly progress and goals." },
  ],
];

export function WalkthroughTour({
  index,
  desktop,
  topInset,
  bottomInset,
  onStep,
  onComplete,
  rect,
}: {
  index: number;
  desktop: boolean;
  topInset: number;
  bottomInset: number;
  onStep(index: number): void;
  onComplete(): void;
  rect: TourRect | null;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const x = Math.max(0, rect?.x ?? 0);
  const y = Math.max(0, rect?.y ?? 0);
  const right = Math.min(width, x + (rect?.width ?? 0));
  const bottom = Math.min(height, y + (rect?.height ?? 0));
  const above = y > height / 2;
  const rows =
    desktop && index === 1
      ? [
          pointers[1][0],
          pointers[1][1],
          pointers[1][4],
          pointers[1][3],
          {
            icon: "goal" as const,
            text: "Goals — plan and track your budgets.",
          },
        ]
      : pointers[index];
  const step = steps[Math.min(index, steps.length - 1)];
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onComplete}
    >
      <View style={{ flex: 1 }}>
        {[
          { left: 0, top: 0, width, height: y },
          { left: 0, top: y, width: x, height: Math.max(0, bottom - y) },
          {
            left: right,
            top: y,
            width: Math.max(0, width - right),
            height: Math.max(0, bottom - y),
          },
          { left: 0, top: bottom, width, height: Math.max(0, height - bottom) },
        ].map((style, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              backgroundColor: "rgba(22,24,28,0.74)",
              ...style,
            }}
          />
        ))}
        {rect && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: right - x,
              height: bottom - y,
              borderWidth: 3,
              borderRadius: 18,
              borderColor: "#F5F5EF",
            }}
          />
        )}
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            maxWidth: 400,
            alignSelf: "center",
            ...(above
              ? { bottom: height - y + 14 }
              : { top: Math.max(topInset + 12, bottom + 14) }),
            padding: 12,
            paddingTop: 18,
            borderRadius: 20,
            overflow: "visible",
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.card,
            elevation: 12,
            shadowColor: "#25202E",
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 76,
              ...(above ? { bottom: -8 } : { top: -8 }),
              width: 16,
              height: 16,
              backgroundColor: c.card,
              transform: [{ rotate: "45deg" }],
            }}
          />
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: -30, left: -8, zIndex: 1 }}
          >
            <Mascot size={52} mood={index >= 2 ? "success" : "wave"} />
          </View>
          <ScrollView
            style={{
              maxHeight: Math.max(
                90,
                Math.min(
                  240,
                  (above ? y : height - bottom) - 125 - bottomInset,
                ),
              ),
            }}
          >
            <YStack gap={6}>
              <Label muted size={10} marginLeft={30}>
                SETTLY’S TOUR · {index + 1} OF {steps.length}
              </Label>
              <Label bold size={16}>
                {step.title}
              </Label>
              {rows.map((row) => (
                <XStack key={row.text} gap={8} alignItems="flex-start">
                  <Icon name={row.icon} size={16} />
                  <Label flex={1} muted size={12} lineHeight={18}>
                    {row.text}
                  </Label>
                </XStack>
              ))}
            </YStack>
          </ScrollView>
          <XStack
            marginTop={8}
            gap={6}
            justifyContent="flex-end"
            flexWrap="wrap"
          >
            <Button compact secondary onPress={onComplete}>
              Skip
            </Button>
            {index > 0 && (
              <Button compact secondary onPress={() => onStep(index - 1)}>
                Back
              </Button>
            )}
            <Button
              compact
              onPress={() =>
                index === steps.length - 1
                  ? onComplete()
                  : onStep(Math.min(index + 1, steps.length - 1))
              }
            >
              {index === steps.length - 1 ? "Got it" : "Next"}
            </Button>
          </XStack>
        </View>
      </View>
    </Modal>
  );
}
