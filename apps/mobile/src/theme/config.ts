import { createTamagui, createFont } from "tamagui";
import { defaultConfig } from "@tamagui/config/v4";
import { Platform } from "react-native";
export const bodyFont =
  Platform.OS === "ios"
    ? "System"
    : Platform.OS === "android"
      ? "sans-serif"
      : "Arial";
export const headingFont = Platform.OS === "android" ? "serif" : "Georgia";
const font = createFont({
  family: bodyFont,
  size: { 1: 12, 2: 13, 3: 14, 4: 16, 5: 18, 6: 22, 7: 28, 8: 36, 9: 48 },
  lineHeight: { 1: 18, 2: 20, 3: 22, 4: 25, 5: 28, 6: 30, 7: 36, 8: 44, 9: 56 },
  weight: { 4: "400", 6: "600", 7: "700" },
  letterSpacing: { 4: 0 },
});
export const config = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
    allowedStyleValues: false,
  },
  fonts: { heading: createFont({ ...font, family: headingFont }), body: font },
  themes: {
    light: {
      ...defaultConfig.themes.light,
      background: "#F5F4F7",
      color: "#211D29",
      borderColor: "#E1DDE7",
    },
    dark: {
      ...defaultConfig.themes.dark,
      background: "#1C1922",
      color: "#F6F4FA",
      borderColor: "#40374C",
    },
  },
});
export type AppConfig = typeof config;
declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
