import { createTamagui, createFont } from "tamagui";
import { defaultConfig } from "@tamagui/config/v4";
const font = createFont({
  family: "Montserrat",
  size: { 1: 12, 2: 13, 3: 14, 4: 16, 5: 18, 6: 22, 7: 28, 8: 36, 9: 48 },
  lineHeight: { 1: 18, 2: 20, 3: 22, 4: 25, 5: 28, 6: 30, 7: 36, 8: 44, 9: 56 },
  weight: { 4: "400", 6: "600", 7: "700" },
  letterSpacing: { 4: 0 },
  face: {
    400: { normal: "Montserrat" },
    500: { normal: "MontserratMedium" },
    600: { normal: "MontserratSemiBold" },
    700: { normal: "MontserratBold" },
  },
});
export const config = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
    allowedStyleValues: false,
  },
  fonts: { heading: font, body: font },
  themes: {
    light: {
      ...defaultConfig.themes.light,
      background: "#FFFFFF",
      color: "#191D21",
      borderColor: "#E9E7EB",
    },
    dark: {
      ...defaultConfig.themes.dark,
      background: "#191B19",
      color: "#F6F4FA",
      borderColor: "#383D36",
    },
  },
});
export type AppConfig = typeof config;
declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
