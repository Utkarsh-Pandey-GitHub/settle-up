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
const query = new QueryClient({
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: false } },
});
export default function Layout() {
  const [fonts] = useFonts({
    Montserrat: Montserrat_400Regular,
    MontserratMedium: Montserrat_500Medium,
    MontserratSemiBold: Montserrat_600SemiBold,
    MontserratBold: Montserrat_700Bold,
  });
  const dark = useSession((s) => s.dark),
    activeId = useSession((s) => s.activeId);
  useEffect(() => {
    useSession.getState().hydrate();
  }, []);
  useEffect(() => {
    query.cancelQueries();
    query.clear();
  }, [activeId]);
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
