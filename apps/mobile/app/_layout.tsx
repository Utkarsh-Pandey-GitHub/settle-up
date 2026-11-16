import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { TamaguiProvider } from "tamagui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { config } from "../src/theme/config";
import { useSession } from "../src/data/session";
import { StatusBar } from "expo-status-bar";
import { AppState, Platform } from "react-native";
import { AndroidSmsProvider } from "../src/services/device";
import { setWidgetAccount } from "../modules/home-widgets/client";
import { useAppSync } from "../src/data/hooks";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
const query = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnMount: false,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});
function AppSync() {
  useAppSync();
  return null;
}
export default function Layout() {
  const dark = useSession((s) => s.dark);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  useEffect(() => {
    const syncAccount = () => {
      const state = useSession.getState();
      if (state.ready) setWidgetAccount(state.activeId);
    };
    syncAccount();
    const unsubscribe = useSession.subscribe(syncAccount);
    useSession.getState().hydrate();
    const expireSms = () => {
      if (Platform.OS === "android")
        for (const account of useSession.getState().accounts)
          void new AndroidSmsProvider(account.id).handled().catch(() => {});
    };
    expireSms();
    const expiryTimer = setInterval(expireSms, 60000);
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") expireSms();
      if (state === "active")
        query.refetchQueries({
          queryKey: ["account", useSession.getState().activeId],
          type: "active",
          stale: true,
        });
    });
    return () => {
      unsubscribe();
      foreground.remove();
      clearInterval(expiryTimer);
    };
  }, []);
  // Fonts are bundled, so this is a single frame; on failure use system fonts.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={query}>
        <AppSync />
        <TamaguiProvider config={config} defaultTheme={dark ? "dark" : "light"}>
          <StatusBar style={dark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "none",
              contentStyle: { backgroundColor: dark ? "#0B0D12" : "#F6F7F9" },
            }}
          >
            <Stack.Screen
              name="quick-add"
              options={{ animation: "slide_from_bottom", gestureEnabled: true }}
            />
            <Stack.Screen name="+not-found" />
          </Stack>
        </TamaguiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
