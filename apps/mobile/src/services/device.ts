import { Platform, PermissionsAndroid, Linking } from "react-native";
import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";
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
export type SmsDecision = {
  decision: "ACCEPTED" | "REJECTED";
  occurredAt: string;
  expiresAt: number;
  title?: string;
  amountMinor?: number;
};
export type DeviceSmsMessage = {
  id: string;
  body: string;
  timestamp: number;
};
type TransactionSmsNative = {
  readRange(start: number, end: number): Promise<DeviceSmsMessage[]>;
  addListener(
    event: "onFinancialSms",
    listener: (message: DeviceSmsMessage) => void,
  ): EventSubscription;
};
export class AndroidSmsProvider implements TransactionImportProvider {
  constructor(private accountId: string) {}
  private native =
    Platform.OS === "android"
      ? requireOptionalNativeModule<TransactionSmsNative>("TransactionSms")
      : null;
  available() {
    return Platform.OS === "android" && !!this.native;
  }
  async hasPermission() {
    return (
      this.available() &&
      (await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      )) &&
      (await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ))
    );
  }
  async requestPermission() {
    if (!this.available()) return false;
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);
    return [
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ].every(
      (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
    );
  }
  private static changes: Promise<unknown> = Promise.resolve();
  private records(
    change?: (records: Record<string, SmsDecision>) => void,
  ): Promise<Record<string, SmsDecision>> {
    const run = async () => {
      const key = `settleup.sms.${this.accountId}`;
      const raw = await SecureStore.getItemAsync(key);
      const records: Record<string, SmsDecision> = raw ? JSON.parse(raw) : {};
      const active = Object.fromEntries(
        Object.entries(records).filter(
          ([, r]) => r && typeof r === "object" && r.expiresAt > Date.now(),
        ),
      );
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
  handled() {
    return this.records();
  }
  subscribe(listener: (message: DeviceSmsMessage) => void): EventSubscription {
    return (
      this.native?.addListener("onFinancialSms", listener) ?? {
        remove() {},
      }
    );
  }
  private async suggestion(message: DeviceSmsMessage) {
    const parsed = parseExpenseSms(message.body, message.timestamp);
    if (!parsed) return null;
    const key = `settleup.sms.salt.${this.accountId}`;
    let salt = await SecureStore.getItemAsync(key);
    if (!salt) {
      salt = Crypto.randomUUID();
      await SecureStore.setItemAsync(key, salt);
    }
    const fingerprint = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}:${message.id}:${message.timestamp}:${message.body}`,
    );
    return { ...parsed, fingerprint } satisfies ImportSuggestion;
  }
  async reviewMessage(message: DeviceSmsMessage) {
    const suggestion = await this.suggestion(message);
    if (!suggestion) return null;
    const handled = await this.handled();
    return handled[suggestion.fingerprint] ? null : suggestion;
  }
  async review(range?: { from: string; through: string }) {
    if (!this.native)
      throw new Error("SMS review requires an Android development build.");
    const handled = await this.handled();
    const bounds = smsRange(range?.from, range?.through);
    const messages = await this.native.readRange(bounds.start, bounds.end);
    const suggestions: ImportSuggestion[] = [];
    for (const message of messages) {
      const suggestion = await this.suggestion(message);
      if (suggestion && (range || !handled[suggestion.fingerprint]))
        suggestions.push(suggestion);
    }
    return suggestions;
  }
  async markHandled(
    fingerprint: string,
    decision: "ACCEPTED" | "REJECTED" = "REJECTED",
    occurredAt = new Date().toISOString(),
    details?: { title: string; amountMinor: number },
  ) {
    const expiresAt = smsDecisionExpiry(occurredAt);
    await this.records((records) => {
      if (expiresAt > Date.now())
        records[fingerprint] = { decision, occurredAt, expiresAt, ...details };
    });
  }
}
export async function requestOnboardingPermissions(accountId: string) {
  if (Platform.OS === "web")
    return {
      camera: false,
      contacts: false,
      notifications: false,
      sms: false,
    };
  const Camera = await import("expo-camera");
  let camera = false;
  let contacts = false;
  try {
    camera = (await Camera.Camera.requestCameraPermissionsAsync()).granted;
  } catch {
    // Continue so one unavailable permission cannot block the remaining prompts.
  }
  try {
    contacts = (await Contacts.requestPermissionsAsync()).granted;
  } catch {
    // Continue so one unavailable permission cannot block the remaining prompts.
  }
  let notifications = false;
  let pushToken: string | undefined;
  try {
    pushToken = await enableNotifications(accountId);
    notifications = true;
  } catch {
    // A declined optional permission must not block the remaining requests.
  }
  let sms = false;
  try {
    sms = await new AndroidSmsProvider(accountId).requestPermission();
  } catch {
    // SMS access remains optional and can be enabled later from the inbox.
  }
  return {
    camera,
    contacts,
    notifications,
    sms,
    pushToken,
  };
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
export async function chooseContacts() {
  if (Platform.OS === "web") {
    const picker = (navigator as any).contacts;
    if (!picker?.select)
      throw new Error("This browser cannot open phone contacts.");
    const selected = await picker.select(["name", "tel"], { multiple: true });
    return selected
      .filter((contact: any) => contact.tel?.[0])
      .map((contact: any) => ({
        name: contact.name?.[0] ?? "Friend",
        phone: normalizePhone(contact.tel[0]),
      }));
  }
  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Contact permission was declined.");
  const result = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
    sort: Contacts.SortTypes.FirstName,
    pageSize: 5000,
  });
  const unique = new Map<string, { name: string; phone: string }>();
  for (const contact of result.data) {
    const raw = contact.phoneNumbers?.[0]?.number;
    if (!raw) continue;
    try {
      const phone = normalizePhone(raw);
      if (!unique.has(phone))
        unique.set(phone, { name: contact.name ?? "Friend", phone });
    } catch {
      // Skip incomplete local numbers that cannot be normalized safely.
    }
  }
  return [...unique.values()];
}
let lastPaymentLaunch: { uri: string; at: number } | undefined;
export const paymentLauncher = {
  async open(uri: string) {
    const safe = parseUpi(uri);
    if (Platform.OS === "web")
      throw new Error("Open a UPI app from an Android or iOS device.");
    if (
      lastPaymentLaunch?.uri === safe.uri &&
      Date.now() - lastPaymentLaunch.at < 8000
    )
      throw new Error(
        "The UPI app is already opening. Return here before trying again.",
      );
    if (!(await Linking.canOpenURL(safe.uri)))
      throw new Error("No UPI payment app is available on this phone.");
    lastPaymentLaunch = { uri: safe.uri, at: Date.now() };
    await Linking.openURL(safe.uri);
  },
};

export function addUpiTransactionReference(uri: string, seed: string) {
  const payment = new URL(parseUpi(uri).uri);
  if (!payment.searchParams.has("tr")) {
    // NPCI caps `tr` at 35 digits. Keep it stable for one payment attempt so
    // returning to SettleUp never creates a second PSP transaction reference.
    const numericSeed = seed.replace(/\D/g, "");
    const reference = numericSeed.slice(0, 35);
    if (reference.length < 12)
      throw new Error("Could not create a safe UPI transaction reference.");
    payment.searchParams.set("tr", reference);
  }
  return parseUpi(payment.toString()).uri;
}
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
