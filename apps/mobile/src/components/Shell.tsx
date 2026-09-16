import React, { useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
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
const navigation: { label: string; path: string; icon: IconName }[] = [
  { label: "Overview", path: "/", icon: "home" },
  { label: "Activity", path: "/activity", icon: "activity" },
  { label: "Groups", path: "/groups", icon: "groups" },
  { label: "Analytics", path: "/analytics", icon: "chart" },
  { label: "Goals", path: "/goals", icon: "goal" },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter(),
    path = usePathname(),
    { width } = useWindowDimensions(),
    c = useColors(),
    insets = useSafeAreaInsets();
  const desktop = width >= 1050;
  const feedback = useSession((s) => s.feedback);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
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
        </ScrollView>
      </KeyboardAvoidingView>
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
          backgroundColor: active ? c.soft : pressed ? c.bg : "transparent",
          marginBottom: 6,
        })}
      >
        <Icon
          name={item.icon}
          size={21}
          color={active ? "#6F6CD9" : "#8E8997"}
        />
        <Label size={14} color={active ? "#5552B4" : c.muted} bold={active}>
          {item.label}
        </Label>
        {active && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#6F6CD9",
              marginLeft: "auto",
            }}
          />
        )}
      </Pressable>
    );
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.bg, flexDirection: "row" }}
    >
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
          {navigation.map(navItem)}
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
              <Label size={11} color="#5552B4" bold>
                Privacy settings →
              </Label>
            </Pressable>
          </View>
          {navItem({ label: "Settings", path: "/settings", icon: "settings" })}
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
            <Avatar name={account?.name ?? "Account"} size={38} />
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
          style={{
            minHeight: desktop ? 80 : 52,
            paddingTop: desktop ? 0 : insets.top,
            paddingHorizontal: desktop ? 39 : 21,
            borderBottomWidth: 1,
            borderColor: c.line,
            backgroundColor: c.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <XStack alignItems="center" gap={10}>
            {desktop ? (
              <Label size={14}>
                {navigation.find((n) => n.path === path)?.label ?? "Your space"}
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
                <Label size={9} bold color="#5552B4">
                  DEMO
                </Label>
              </View>
            )}
          </XStack>
          <XStack alignItems="center" gap={desktop ? 17 : 10}>
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
            {path !== "/add" && (
              <IconButton
                name="plus"
                label="New expense"
                borderless
                onPress={() => go("/add")}
              />
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
              name="bell"
              label="Notifications"
              borderless
              onPress={() => go("/notifications")}
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
              <Avatar name={account?.name ?? "Account"} size={37} />
            </Pressable>
          </XStack>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: desktop ? 36 : 20,
            paddingBottom: desktop ? 40 : 110,
            maxWidth: 1510,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {children}
        </ScrollView>
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
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderWidth: 1,
              shadowColor: "#392265",
              shadowOpacity: 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
              paddingBottom: Math.max(insets.bottom, 10),
              paddingTop: 10,
              flexDirection: "row",
              justifyContent: "space-around",
              borderTopWidth: 1,
              borderColor: c.line,
              backgroundColor: c.card,
            }}
          >
            {[
              { label: "Home", path: "/", icon: "home" },
              { label: "Activity", path: "/activity", icon: "activity" },
              { label: "Scan & pay", path: "/scan", icon: "scan" },
              { label: "Analytics", path: "/analytics", icon: "chart" },
              { label: "Groups", path: "/groups", icon: "groups" },
            ].map((n) => (
              <Pressable
                key={n.path}
                accessibilityRole="button"
                accessibilityLabel={n.label}
                onPress={() => go(n.path)}
                style={{
                  minWidth: 56,
                  minHeight: 48,
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <View
                  style={
                    n.path === "/scan"
                      ? {
                          backgroundColor: "#6F6CD9",
                          borderRadius: 20,
                          padding: 14,
                          marginTop: -20,
                          borderBottomWidth: 4,
                          borderColor: "#5552B4",
                        }
                      : { padding: 3 }
                  }
                >
                  <Icon
                    name={n.icon as IconName}
                    size={22}
                    color={
                      n.path === "/scan"
                        ? "#FFF"
                        : path === n.path
                          ? "#6F6CD9"
                          : c.muted
                    }
                  />
                </View>
                <Label size={9} color={path === n.path ? "#6F6CD9" : c.muted}>
                  {n.label}
                </Label>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
