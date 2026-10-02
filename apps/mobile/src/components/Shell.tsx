import React, { useEffect, useState, useRef } from "react";
import { View, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { XStack, YStack } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Label,
  Icon,
  IconButton,
  Avatar,
  useColors,
  type IconName,
  PipFeedback,
  Brand,
  Mascot,
} from "./ui";
import { useSession, DEMO } from "../data/session";
import { KeyboardAwareScreen } from "./KeyboardAwareScreen";
import {
  WalkthroughTour,
  TourGroup,
  TourStepContext,
  TourMeasureContext,
  type TourRect,
} from "./WalkthroughTour";
const navigation: { label: string; path: string; icon: IconName }[] = [
  { label: "Overview", path: "/", icon: "home" },
  { label: "Transactions", path: "/activity", icon: "transactions" },
  { label: "Groups", path: "/groups", icon: "groups" },
  { label: "Analytics", path: "/analytics", icon: "chart" },
  { label: "Goals", path: "/goals", icon: "goal" },
];
export function Shell({
  children,
  tourReady = false,
}: {
  children: React.ReactNode;
  tourReady?: boolean;
}) {
  const router = useRouter(),
    path = usePathname(),
    { width } = useWindowDimensions(),
    c = useColors(),
    insets = useSafeAreaInsets();
  const desktop = width >= 1050;
  const feedback = useSession((s) => s.feedback);
  const tourAccountId = useSession((s) => s.tourAccountId);
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState<TourRect | null>(null);
  const headerRef = useRef<View>(null);
  const navigationRef = useRef<View>(null);
  const tourActive = path === "/" && tourReady && !!tourAccountId;
  useEffect(() => {
    if (!tourActive) return;
    setTourRect(null);
    const frame = requestAnimationFrame(() => {
      const target =
        tourStep === 0
          ? headerRef
          : tourStep === 1 && !desktop
            ? navigationRef
            : null;
      target?.current?.measureInWindow((x, y, width, height) =>
        setTourRect({ x, y, width, height }),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [tourActive, tourStep, width, desktop]);
  useEffect(() => {
    setTourStep(0);
  }, [tourAccountId]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      if (useSession.getState().feedback?.id === feedback.id)
        useSession.setState({ feedback: null });
    }, 4500);
    return () => clearTimeout(timer);
  }, [feedback]);
  const account = useSession((s) =>
    s.accounts.find((a) => a.id === s.activeId),
  );
  if (path === "/auth" || path === "/onboarding")
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAwareScreen
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingTop: insets.top + 22,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <XStack
            maxWidth={660}
            width="100%"
            alignSelf="center"
            justifyContent="space-between"
            alignItems="center"
            marginBottom={18}
          >
            <Brand />
            {path === "/onboarding" || path?.endsWith("/onboarding") ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/auth")}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Label muted size={13}>
                  Skip intro
                </Label>
              </Pressable>
            ) : account && account.name !== "New friend" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/accounts")}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Label muted size={12}>
                  Back to accounts
                </Label>
              </Pressable>
            ) : null}
          </XStack>
          {children}
        </KeyboardAwareScreen>
      </View>
    );
  const tabPaths = new Set([
    "/",
    "/activity",
    "/analytics",
    "/groups",
    "/goals",
    "/scan",
    "/tags",
    "/sms",
    "/settings",
  ]);
  const go = (p: string) =>
    tabPaths.has(p) ? router.replace(p as any) : router.push(p as any);
  const navItem = (item: (typeof navigation)[number]) => {
    const active =
      item.path === "/" ? path === "/" : path.startsWith(item.path);
    return (
      <Pressable
        key={item.path}
        onPress={() => go(item.path)}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 13,
          height: 49,
          paddingHorizontal: 17,
          borderRadius: 12,
          backgroundColor: active ? c.primary : pressed ? c.bg : "transparent",
          marginBottom: 6,
        })}
      >
        <Icon
          name={item.icon}
          size={21}
          color={active ? c.onPrimary : c.text}
        />
        <Label size={14} color={active ? c.onPrimary : c.text} bold={active}>
          {item.label}
        </Label>
        {active && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: c.onPrimary,
              marginLeft: "auto",
            }}
          />
        )}
      </Pressable>
    );
  };
  return (
    <TourStepContext.Provider value={tourActive ? tourStep : null}>
      <TourMeasureContext.Provider value={setTourRect}>
        <View style={{ flex: 1, backgroundColor: c.bg, flexDirection: "row" }}>
          {desktop && (
            <ScrollView
              style={{
                width: 237,
                maxWidth: 237,
                borderRightWidth: 1,
                borderColor: c.line,
                backgroundColor: c.card,
              }}
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 20,
                paddingTop: 34,
                paddingBottom: 24,
              }}
            >
              <Pressable
                onPress={() => go("/")}
                accessibilityRole="button"
                accessibilityLabel="SettleUp home"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  marginLeft: 10,
                  marginBottom: 48,
                }}
              >
                <Brand />
              </Pressable>
              <Label
                size={10}
                muted
                bold
                letterSpacing={1.8}
                marginLeft={17}
                marginBottom={16}
              >
                YOUR SPACE
              </Label>
              <TourGroup step={1}>{navigation.map(navItem)}</TourGroup>
              <View
                style={{
                  height: 1,
                  backgroundColor: c.line,
                  marginVertical: 23,
                  marginHorizontal: 12,
                }}
              />
              <Label
                size={10}
                muted
                bold
                letterSpacing={1.8}
                marginLeft={17}
                marginBottom={16}
              >
                QUICK TOOLS
              </Label>
              {[
                { label: "Scan & pay", path: "/scan", icon: "scan" as const },
                { label: "SMS inbox", path: "/sms", icon: "sms" as const },
                { label: "Tags", path: "/tags", icon: "bag" as const },
              ].map(navItem)}
              <View style={{ flex: 1, minHeight: 35 }} />
              <View
                style={{
                  backgroundColor: c.soft,
                  borderRadius: 17,
                  padding: 17,
                  marginBottom: 20,
                }}
              >
                <Mascot size={68} mood="reading" animate={false} />
                <Label size={12} bold marginTop={10}>
                  Your money. Your business.
                </Label>
                <Label size={11} muted marginTop={4}>
                  Private by default, always.
                </Label>
                <Pressable
                  onPress={() => go("/settings")}
                  style={{ minHeight: 36, justifyContent: "center" }}
                >
                  <Label size={11} color="#59458F" bold>
                    Privacy settings →
                  </Label>
                </Pressable>
              </View>
              {navItem({
                label: "Settings",
                path: "/settings",
                icon: "settings",
              })}
              <Pressable
                onPress={() => go("/accounts")}
                accessibilityRole="button"
                accessibilityLabel="Switch account"
                style={{
                  flexDirection: "row",
                  gap: 11,
                  paddingTop: 18,
                  borderTopWidth: 1,
                  borderColor: c.line,
                  alignItems: "center",
                }}
              >
                <Avatar
                  name={account?.name ?? "Account"}
                  avatar={account?.avatar}
                  size={38}
                />
                <YStack flex={1}>
                  <Label bold size={12} numberOfLines={1}>
                    {account?.name ?? "Sign in"}
                  </Label>
                  <Label muted size={10}>
                    {DEMO ? "Personal · demo account" : "Personal account"}
                  </Label>
                </YStack>
                <Icon name="chevron" size={15} />
              </Pressable>
            </ScrollView>
          )}
          <View style={{ flex: 1 }}>
            <View
              ref={headerRef}
              collapsable={false}
              style={{
                minHeight: desktop ? 80 : 52,
                paddingTop: desktop ? 0 : insets.top,
                paddingHorizontal: desktop ? 39 : width < 360 ? 12 : 21,
                borderBottomWidth: 0,
                borderColor: c.line,
                backgroundColor: c.bg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                ...(tourActive && tourStep === 0
                  ? { borderWidth: 3, borderColor: "#F5F5EF", borderRadius: 18 }
                  : {}),
              }}
            >
              <XStack alignItems="center" gap={10}>
                {desktop ? (
                  <Label size={14}>
                    {navigation.find((n) => n.path === path)?.label ??
                      "Your space"}
                  </Label>
                ) : (
                  <Brand compact />
                )}
                {DEMO && (
                  <View
                    style={{
                      backgroundColor: c.soft,
                      borderRadius: 6,
                      paddingVertical: 3,
                      paddingHorizontal: 7,
                    }}
                  >
                    <Label size={9} bold color="#59458F">
                      DEMO
                    </Label>
                  </View>
                )}
              </XStack>
              <XStack
                alignItems="center"
                gap={desktop ? 17 : width < 360 ? 4 : 10}
              >
                {desktop && (
                  <XStack gap={8} alignItems="center">
                    <Icon name="calendar" size={16} />
                    <Label size={12} muted>
                      {new Intl.DateTimeFormat("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date())}
                    </Label>
                  </XStack>
                )}
                {!desktop && (
                  <IconButton
                    name="sms"
                    label="Bank SMS inbox"
                    borderless
                    onPress={() => go("/sms")}
                  />
                )}
                <IconButton
                  name="link"
                  label="Payment links"
                  borderless
                  onPress={() => go("/payment-links")}
                />
                <Pressable
                  onPress={() => go("/accounts")}
                  accessibilityRole="button"
                  accessibilityLabel="Account switcher"
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Avatar
                    name={account?.name ?? "Account"}
                    avatar={account?.avatar}
                    size={width < 360 ? 32 : 37}
                  />
                </Pressable>
              </XStack>
            </View>
            <KeyboardAwareScreen
              contentContainerStyle={{
                padding: desktop ? 36 : width < 360 ? 14 : 20,
                paddingBottom: desktop ? 40 : 110,
                maxWidth: 1510,
                width: "100%",
                alignSelf: "center",
              }}
            >
              {children}
            </KeyboardAwareScreen>
            {feedback && feedback.accountId === account?.id && (
              <View
                style={{
                  position: "absolute",
                  bottom: desktop ? 24 : 112,
                  right: 20,
                  left: desktop ? undefined : 20,
                  maxWidth: 380,
                  padding: 12,
                  borderRadius: 20,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.line,
                  shadowColor: "#392265",
                  shadowOpacity: 0.12,
                  shadowRadius: 18,
                }}
              >
                <PipFeedback mood="success" message={feedback.message} />
              </View>
            )}
            {!desktop && (
              <View
                ref={navigationRef}
                collapsable={false}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  borderRadius: 0,
                  paddingBottom: Math.max(insets.bottom, 10),
                  paddingTop: 0,
                  flexDirection: "row",
                  justifyContent: "space-around",
                  borderTopWidth: 1,
                  borderColor: c.line,
                  backgroundColor: c.card,
                  ...(tourActive && tourStep === 1
                    ? {
                        borderWidth: 3,
                        borderTopWidth: 3,
                        borderColor: "#F5F5EF",
                      }
                    : {}),
                }}
              >
                {[
                  { label: "Home", path: "/", icon: "home" },
                  {
                    label: "Transactions",
                    path: "/activity",
                    icon: "transactions",
                  },
                  { label: "Scan QR", path: "/scan", icon: "scan" },
                  { label: "Analytics", path: "/analytics", icon: "chart" },
                  { label: "Groups", path: "/groups", icon: "groups" },
                ].map((n) => (
                  <Pressable
                    key={n.path}
                    accessibilityRole="button"
                    accessibilityLabel={n.label}
                    accessibilityState={{ selected: path === n.path }}
                    onPress={() => go(n.path)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 65,
                      paddingTop: 8,
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <View
                      style={{
                        width: n.path === "/scan" ? 58 : 39,
                        height: n.path === "/scan" ? 58 : 39,
                        marginTop: n.path === "/scan" ? -26 : 0,
                        marginBottom: n.path === "/scan" ? -7 : 0,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          n.path === "/scan" ? c.primary : "transparent",
                        borderRadius: n.path === "/scan" ? 22 : 14,
                        borderWidth: n.path === "/scan" ? 4 : 0,
                        borderColor: c.card,
                      }}
                    >
                      <Icon
                        name={n.icon as IconName}
                        size={n.path === "/scan" ? 32 : 25}
                        color={
                          n.path === "/scan"
                            ? c.onPrimary
                            : path === n.path
                              ? c.accent
                              : c.text
                        }
                      />
                    </View>
                    <Label
                      size={width < 360 ? 10 : 11}
                      bold={path === n.path}
                      color={c.text}
                    >
                      {n.label}
                    </Label>
                  </Pressable>
                ))}
              </View>
            )}
            {path === "/" &&
              tourReady &&
              !!account &&
              tourAccountId === account.id && (
                <WalkthroughTour
                  key={account.id}
                  index={tourStep}
                  rect={tourRect}
                  onStep={setTourStep}
                  desktop={desktop}
                  topInset={insets.top}
                  bottomInset={insets.bottom}
                  onComplete={() => void useSession.getState().completeTour()}
                />
              )}
          </View>
        </View>
      </TourMeasureContext.Provider>
    </TourStepContext.Provider>
  );
}
