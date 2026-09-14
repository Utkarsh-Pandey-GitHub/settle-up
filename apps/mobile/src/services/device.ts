import { Platform, PermissionsAndroid, Linking } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as Contacts from "expo-contacts";
import {
  type TransactionImportProvider,
  type ImportSuggestion,
  parseExpenseSms,
  smsRange,
  smsDecisionExpiry,
  normalizePhone,
  parseUpi,
} from "@settleup/domain";
export type SmsDecision = { decision: "ACCEPTED" | "REJECTED"; occurredAt: string; expiresAt: number; title?: string; amountMinor?: number };
export class AndroidSmsProvider implements TransactionImportProvider {
  constructor(private accountId: string) {}
  private native =
    Platform.OS === "android"
      ? requireOptionalNativeModule<{
          readRange(start: number, end: number): Promise<
            { id: string; body: string; timestamp: number }[]
          >;
        }>("TransactionSms")
      : null;
  available() {
    return Platform.OS === "android" && !!this.native;
  }
  async requestPermission() {
    if (!this.available()) return false;
    return (
      (await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      )) === PermissionsAndroid.RESULTS.GRANTED
    );
  }
  private static changes: Promise<unknown> = Promise.resolve();
  private records(change?: (records: Record<string, SmsDecision>) => void): Promise<Record<string, SmsDecision>> {
    const run = async () => {
      const key = `settleup.sms.${this.accountId}`;
      const raw = await SecureStore.getItemAsync(key);
      const records: Record<string, SmsDecision> = raw ? JSON.parse(raw) : {};
      const active = Object.fromEntries(Object.entries(records).filter(([, r]) =>
        r && typeof r === "object" && r.expiresAt > Date.now()));
      change?.(active);
      const next = JSON.stringify(active);
      if (raw !== next) await SecureStore.setItemAsync(key, next);
      return active;
    };
    // Foreground expiry and review decisions must not overwrite each other.
    const result = AndroidSmsProvider.changes.then(run, run);
    AndroidSmsProvider.changes = result.catch(() => {});
    return result;
  }
  handled() { return this.records(); }
  async review(range?: { from: string; through: string }) {
    if (!this.native)
      throw new Error("SMS review requires an Android development build.");
    const key = `settleup.sms.salt.${this.accountId}`;
    let salt = await SecureStore.getItemAsync(key);
    if (!salt) {
      salt = Crypto.randomUUID();
      await SecureStore.setItemAsync(key, salt);
    }
    const handled = await this.handled();
    const bounds = smsRange(range?.from, range?.through);
    const messages = await this.native.readRange(bounds.start, bounds.end);
    const suggestions: ImportSuggestion[] = [];
    for (const message of messages) {
      const parsed = parseExpenseSms(message.body, message.timestamp);
      if (!parsed) continue;
      const fingerprint = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${salt}:${message.id}:${message.timestamp}:${message.body}`,
      );
      if (range || !handled[fingerprint]) suggestions.push({ ...parsed, fingerprint });
    }
    return suggestions;
  }
  async markHandled(fingerprint: string, decision: "ACCEPTED" | "REJECTED" = "REJECTED", occurredAt = new Date().toISOString(), details?: { title: string; amountMinor: number }) {
    const expiresAt = smsDecisionExpiry(occurredAt);
    await this.records(records => {
      if (expiresAt > Date.now()) records[fingerprint] = { decision, occurredAt, expiresAt, ...details };
    });
  }
}
export async function chooseContact() {
  if (Platform.OS === "web") {
    const picker = (navigator as any).contacts;
    if (!picker?.select)
      throw new Error(
        "This browser cannot open phone contacts. Choose a saved person below, or use Manage contacts to add someone manually.",
      );
    const contacts = await picker.select(["name", "tel"], { multiple: false });
    const selected = contacts[0];
    if (!selected) return null;
    if (!selected.tel?.[0])
      throw new Error("This contact has no phone number.");
    return {
      name: selected.name?.[0] ?? "Friend",
      phone: normalizePhone(selected.tel[0]),
    };
  }
  const result = await Contacts.requestPermissionsAsync();
  if (!result.granted)
    throw new Error(
      "Contact permission was declined. You can enter a person manually.",
    );
  const selected = await Contacts.presentContactPickerAsync();
  if (!selected) return null;
  const number = selected.phoneNumbers?.[0]?.number;
  if (!number) throw new Error("This contact has no phone number.");
  return { name: selected.name ?? "Friend", phone: normalizePhone(number) };
}
export const paymentLauncher = {
  async open(uri: string) {
    const safe = parseUpi(uri);
    if (Platform.OS === "web")
      throw new Error("Open a UPI app from an Android or iOS device.");
    await Linking.openURL(safe.uri);
  },
};
export async function enableNotifications(accountId: string) {
  if (Platform.OS === "web")
    throw new Error("Notifications are available in the native app.");
  const Notifications = await import("expo-notifications");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("goals", {
      name: "Budget check-ins",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Notifications were not enabled.");
  await SecureStore.setItemAsync(
    `settleup.notifications.${accountId}`,
    "enabled",
  );
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return projectId
    ? (await Notifications.getExpoPushTokenAsync({ projectId })).data
    : undefined;
}
export async function disableLocalNotifications(accountId: string) {
  if (Platform.OS !== "web")
    await SecureStore.deleteItemAsync(`settleup.notifications.${accountId}`);
}
export async function syncGoalNotifications(
  data: import("@settleup/contracts").Dashboard,
) {
  if (
    Platform.OS === "web" ||
    (await SecureStore.getItemAsync(
      `settleup.notifications.${data.account.id}`,
    )) !== "enabled"
  )
    return;
  const Notifications = await import("expo-notifications");
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  // Foreground refresh delivers immediate local reminders; the backend worker handles push while closed.
  const key = `settleup.goal-notified.${data.account.id}`;
  const raw = await SecureStore.getItemAsync(key);
  const records: Record<string, number> = raw ? JSON.parse(raw) : {};
  for (const [id, end] of Object.entries(records))
    if (end < Date.now()) delete records[id];
  for (const goal of data.goals)
    for (const threshold of goal.thresholds) {
      const id = `${goal.id}:${goal.start}:${threshold}`;
      if (
        goal.spentMinor * 100 < goal.amountMinor * threshold ||
        records[id] ||
        Date.parse(goal.end) <= Date.now()
      )
        continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "A little budget check-in",
          body: `${goal.name}: ${threshold}% of your budget used.`,
          data: { accountId: data.account.id },
        },
        trigger: null,
      });
      records[id] = Date.parse(goal.end);
    }
  await SecureStore.setItemAsync(key, JSON.stringify(records));
}

// Repeated scans of the same confirmed QR reuse a request for two minutes.
// Only request metadata is retained; no SMS or token data is stored here.
const browserPaymentRequests = new Map<
  string,
  Record<string, { key: string; occurredAt: string; until: number }>
>();
export async function paymentRequest(accountId: string, canonicalUri: string) {
  const storageKey = `settleup.upi.${accountId}`;
  const raw =
    Platform.OS === "web" ? null : await SecureStore.getItemAsync(storageKey);
  const entries: Record<
    string,
    { key: string; occurredAt: string; until: number }
  > =
    Platform.OS === "web"
      ? (browserPaymentRequests.get(accountId) ?? {})
      : raw
        ? JSON.parse(raw)
        : {};
  for (const [hash, entry] of Object.entries(entries))
    if (entry.until <= Date.now()) delete entries[hash];
  const fingerprint = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalUri,
  );
  if (!entries[fingerprint])
    entries[fingerprint] = {
      key: Crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      until: Date.now() + 120000,
    };
  if (Platform.OS === "web") browserPaymentRequests.set(accountId, entries);
  else await SecureStore.setItemAsync(storageKey, JSON.stringify(entries));
  return entries[fingerprint];
}
