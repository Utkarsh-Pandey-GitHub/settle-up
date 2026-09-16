import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { TamaguiProvider } from "tamagui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_500Medium } from "@expo-google-fonts/montserrat/500Medium";
import { Montserrat_600SemiBold } from "@expo-google-fonts/montserrat/600SemiBold";
import { Montserrat_700Bold } from "@expo-google-fonts/montserrat/700Bold";
import { config } from "../src/theme/config";
import { useSession } from "../src/data/session";
import { StatusBar } from "expo-status-bar";
import { AppState, Platform } from "react-native";
import { AndroidSmsProvider } from "../src/services/device";
import { setWidgetAccount } from "../modules/home-widgets/client";
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
export default function Layout() {
  const [fonts] = useFonts({
    Montserrat: Montserrat_400Regular,
    MontserratMedium: Montserrat_500Medium,
    MontserratSemiBold: Montserrat_600SemiBold,
    MontserratBold: Montserrat_700Bold,
  });
  const dark = useSession((s) => s.dark);
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
  if (!fonts) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={query}>
        <TamaguiProvider config={config} defaultTheme={dark ? "dark" : "light"}>
          <StatusBar style={dark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "none",
              contentStyle: { backgroundColor: dark ? "#18131A" : "#FAF9F6" },
            }}
          />
        </TamaguiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
