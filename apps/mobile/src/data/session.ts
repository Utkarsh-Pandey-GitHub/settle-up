import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Account, Session } from "@settleup/contracts";
import { ids, demoDashboard } from "@settleup/domain/src/fixtures";
export const DEMO = process.env.EXPO_PUBLIC_DEMO !== "false";
const tokenMemory = new Map<string, Session>();
const storage = {
  async get(key: string) {
    return Platform.OS === "web" ? null : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS !== "web") await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS !== "web") await SecureStore.deleteItemAsync(key);
  },
};
type State = {
  pendingPayment: string | null;
  setPendingPayment(token: string | null): Promise<void>;
  feedback: { id: number; accountId: string; message: string } | null;
  accounts: Account[];
  activeId: string | null;
  ready: boolean;
  dark: boolean;
  setDark(value: boolean): void;
  hydrate(): Promise<void>;
  add(session: Session): Promise<void>;
  switchTo(id: string): void;
  remove(id: string): Promise<void>;
};
export const useSession = create<State>((set, get) => ({
  accounts: DEMO
    ? [demoDashboard(ids.Utkarsh).account, demoDashboard(ids.studio).account]
    : [],
  activeId: DEMO ? ids.Utkarsh : null,
  ready: DEMO,
  dark: false,
  pendingPayment: null,
  async setPendingPayment(token) {
    if (token && !/^[A-Za-z0-9_-]{24}$/.test(token)) throw new Error("Invalid payment link.");
    if (token) await storage.set("settleup.pending-payment", token);
    else await storage.remove("settleup.pending-payment");
    set({ pendingPayment: token });
  },
  feedback: null,
  setDark: (dark) => set({ dark }),
  async hydrate() {
    if (DEMO) return;
    try {
      const raw = await storage.get("settleup.accounts");
      const accounts: Account[] = raw ? JSON.parse(raw) : [];
      const valid: Account[] = [];
      for (const account of accounts) {
        const saved = await storage.get(`settleup.session.${account.id}`);
        if (saved) {
          tokenMemory.set(account.id, JSON.parse(saved));
          valid.push(account);
        }
      }
      set({ accounts: valid, activeId: valid[0]?.id ?? null, pendingPayment: await storage.get("settleup.pending-payment") });
    } finally {
      set({ ready: true });
    }
  },
  async add(session) {
    tokenMemory.set(session.account.id, session);
    await storage.set(
      `settleup.session.${session.account.id}`,
      JSON.stringify(session),
    );
    const accounts = [
      ...get().accounts.filter((a) => a.id !== session.account.id),
      session.account,
    ];
    await storage.set("settleup.accounts", JSON.stringify(accounts));
    set({ accounts, activeId: session.account.id });
  },
  switchTo(id) {
    if (get().accounts.some((a) => a.id === id))
      set({ activeId: id, feedback: null });
  },
  async remove(id) {
    tokenMemory.delete(id);
    for (const key of [
      `settleup.sms.${id}`,
      `settleup.sms.salt.${id}`,
      `settleup.upi.${id}`,
      `settleup.notifications.${id}`,
    ])
      await storage.remove(key);
    await storage.remove(`settleup.session.${id}`);
    await storage.remove(`settleup.draft.${id}`);
    const accounts = get().accounts.filter((a) => a.id !== id);
    await storage.set("settleup.accounts", JSON.stringify(accounts));
    set({
      accounts,
      activeId:
        get().activeId === id ? (accounts[0]?.id ?? null) : get().activeId,
    });
  },
}));
export const getTokenSession = (id: string) => tokenMemory.get(id);
export async function replaceTokenSession(id: string, session: Session) {
  tokenMemory.set(id, session);
  await storage.set(`settleup.session.${id}`, JSON.stringify(session));
}
