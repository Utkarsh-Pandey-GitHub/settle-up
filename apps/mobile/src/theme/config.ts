import { createTamagui, createFont } from "tamagui";
import { defaultConfig } from "@tamagui/config/v4";
import { Platform } from "react-native";
// Inter is loaded in app/_layout.tsx. Android needs one family per weight.
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};
export const bodyFont = fonts.regular;
export const headingFont = fonts.semibold;
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
      background: "#F6F7F9",
      color: "#0F172A",
      borderColor: "#E4E7EC",
    },
    dark: {
      ...defaultConfig.themes.dark,
      background: "#0B0D12",
      color: "#F1F5F9",
      borderColor: "#262B36",
    },
  },
});
export type AppConfig = typeof config;
declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
