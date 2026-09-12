import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
export type TruecallerAuthorization = { code: string; codeVerifier: string };
type Bridge = { authorize(): Promise<TruecallerAuthorization> };
const bridge =
  Platform.OS === "android"
    ? requireOptionalNativeModule<Bridge>("TruecallerAuth")
    : null;
export const truecallerAvailable =
  !!bridge && !!process.env.EXPO_PUBLIC_TRUECALLER_CLIENT_ID;
/** Returns a one-use authorization proof, never a trusted user profile. Exchange on your backend. */
export async function authorizeWithTruecaller(): Promise<TruecallerAuthorization> {
  if (!truecallerAvailable || !bridge)
    throw new Error("Use phone verification on this device.");
  return bridge.authorize();
}
