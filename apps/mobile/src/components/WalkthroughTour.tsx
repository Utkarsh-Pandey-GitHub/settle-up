import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { XStack, YStack } from "tamagui";
import { Button, Icon, Label, Mascot, useColors } from "./ui";
import type { IconName } from "./ui";

type Step = {
  title: string;
  detail: string;
  icon: IconName;
  target: "center" | "add" | "scan" | "activity" | "groups";
};

const steps: Step[] = [
  {
    title: "Your money, in one calm place",
    detail:
      "I’ll show you the four shortcuts you’ll use most. This takes less than a minute.",
    icon: "home",
    target: "center",
  },
  {
    title: "Record an expense",
    detail:
      "Tap the plus button whenever you pay. Add a bill, choose a group, and split it in the same form.",
    icon: "plus",
    target: "add",
  },
  {
    title: "Scan and pay",
    detail:
      "The large Scan QR action opens the camera directly. Bill scanning is available from Add expense.",
    icon: "scan",
    target: "scan",
  },
  {
    title: "See ledger activity",
    detail:
      "The bell at the top opens recent activity. Filter it by ledger or expand the full history.",
    icon: "activity",
    target: "activity",
  },
  {
    title: "Keep groups organised",
    detail:
      "Open Groups to see shared ledgers, members, and balances. You’re ready to start.",
    icon: "groups",
    target: "groups",
  },
];

export function WalkthroughTour({
  visible,
  desktop,
  topInset,
  bottomInset,
  onComplete,
}: {
  visible: boolean;
  desktop: boolean;
  topInset: number;
  bottomInset: number;
  onComplete(): void;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const entrance = useRef(new Animated.Value(0)).current;
  const step = steps[Math.min(index, steps.length - 1)];

  useEffect(() => {
    if (!visible) {
      setIndex(0);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.spring(entrance, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [visible, index]);

  const targetStyle = (() => {
    if (desktop) {
      if (step.target === "scan") return { left: 18, top: 392 };
      if (step.target === "groups") return { left: 18, top: 214 };
      if (step.target === "add") return { right: 118, top: 17 };
      if (step.target === "activity") return { right: 68, top: 17 };
      return null;
    }
    if (step.target === "scan")
      return { left: width / 2 - 35, bottom: Math.max(bottomInset, 10) + 25 };
    if (step.target === "groups")
      return { right: 12, bottom: Math.max(bottomInset, 10) + 18 };
    if (step.target === "add") return { right: 142, top: topInset + 4 };
    if (step.target === "activity") return { right: 56, top: topInset + 4 };
    return null;
  })();

  const cardAtBottom =
    step.target === "add" ||
    step.target === "activity" ||
    step.target === "center";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onComplete}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(31, 28, 38, 0.68)",
          }}
        />
        {targetStyle && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                width: 70,
                height: 70,
                borderRadius: 25,
                borderWidth: 3,
                borderColor: "#FFFFFF",
                backgroundColor: "rgba(255,255,255,0.14)",
                transform: [{ scale: entrance }],
              },
              targetStyle,
            ]}
          />
        )}
        <Animated.View
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            ...(cardAtBottom
              ? { bottom: Math.max(bottomInset, 18) + (desktop ? 22 : 92) }
              : { top: topInset + 92 }),
            maxWidth: 430,
            alignSelf: desktop ? "center" : undefined,
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
            ],
          }}
        >
          <View
            style={{
              borderRadius: 24,
              padding: 18,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.65)",
              shadowColor: "#25202E",
              shadowOpacity: 0.22,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            <XStack gap={12} alignItems="flex-start">
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.soft,
                }}
              >
                <Mascot
                  size={48}
                  mood={index === steps.length - 1 ? "success" : "wave"}
                />
              </View>
              <YStack flex={1} gap={6} paddingTop={2}>
                <XStack alignItems="center" gap={7}>
                  <Icon name={step.icon} size={17} color="#626078" />
                  <Label bold size={16}>
                    {step.title}
                  </Label>
                </XStack>
                <Label muted size={12} lineHeight={18}>
                  {step.detail}
                </Label>
              </YStack>
            </XStack>
            <XStack alignItems="center" marginTop={16} gap={6}>
              {steps.map((_, dot) => (
                <View
                  key={dot}
                  style={{
                    width: dot === index ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: dot === index ? "#6F6CD9" : c.line,
                  }}
                />
              ))}
              <View style={{ flex: 1 }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip walkthrough"
                onPress={onComplete}
                style={{
                  minHeight: 42,
                  justifyContent: "center",
                  paddingHorizontal: 8,
                }}
              >
                <Label muted size={12}>
                  Skip
                </Label>
              </Pressable>
              <Button
                compact
                onPress={() => {
                  if (index === steps.length - 1) onComplete();
                  else
                    setIndex((value) => Math.min(value + 1, steps.length - 1));
                }}
              >
                {index === steps.length - 1 ? "Start using SettleUp" : "Next"}
              </Button>
            </XStack>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
