import React, { useEffect, useState } from "react";
import { Platform, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { YStack } from "tamagui";
import { money, parseMoney, parseUpi } from "@settleup/domain";
import { API_URL, request } from "../data/repository";
import { useAction } from "../data/hooks";
import { DEMO, useSession } from "../data/session";
import { paymentLauncher } from "../services/device";
import { DataScreen } from "./overview";
import { Shell } from "../components/Shell";
import { Card, Heading, Label, Field, Button, Notice } from "../components/ui";

export function PaymentLinksScreen() {
  return <DataScreen>{d => <PaymentLinkForm key={d.account.id} accountId={d.account.id} name={d.account.name} />}</DataScreen>;
}
function PaymentLinkForm({ accountId, name }: { accountId: string; name: string }) {
  const [upiId, setUpiId] = useState(""), [payeeName, setPayeeName] = useState(name),
    [amount, setAmount] = useState(""), [created, setCreated] = useState<{ token: string; expiresAt: string } | null>(null),
    [pasted, setPasted] = useState("");
  const action = useAction(), router = useRouter();
  const url = created ? `${API_URL.replace(/\/$/, "")}/p/${created.token}` : "";
  return <YStack gap={22} maxWidth={620} width="100%" alignSelf="center">
    <Heading>A little link. An easier payment.</Heading>
    <Label muted>Request an amount at any UPI ID. The recipient reviews it in SettleUp.</Label>
    <Card><YStack gap={16}>
      <Field label="Payee name" value={payeeName} onChangeText={setPayeeName} />
      <Field label="UPI ID" placeholder="name@bank" value={upiId} onChangeText={setUpiId} autoCapitalize="none" />
      <Field label="Amount · INR" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Label muted>This name is entered by you. The payer should verify the bank-confirmed recipient in their UPI app.</Label>
      <Button disabled={action.busy} onPress={() => action.run(async () => {
        if (DEMO) throw new Error("Sign in to the live app to create a shareable payment link.");
        const amountMinor = parseMoney(amount);
        const result = await request<{ token: string; expiresAt: string }>("/payment-links", { accountId, body: { upiId, payeeName, amountMinor } });
        setCreated(result);
      }, "Payment link created")}>Create payment link</Button>
      {created && <YStack gap={12}>
        <Label selectable>{url}</Label>
        <Label muted>Expires {new Date(created.expiresAt).toLocaleDateString()}. Requires SettleUp on the recipient’s phone.</Label>
        <Button secondary onPress={() => action.run(() => Share.share({ message: `Review my payment request in SettleUp: ${url}` }), "Share sheet opened")}>Share link</Button>
      </YStack>}
    </YStack></Card>
    <Card><YStack gap={14}>
      <Heading size={18}>Open a payment link</Heading>
      <Field label="SettleUp link" value={pasted} onChangeText={setPasted} autoCapitalize="none" />
      <Button secondary onPress={() => action.run(async () => {
        const link = new URL(pasted.trim());
        if (!(link.protocol === "settleup:" || link.origin === new URL(API_URL).origin)) throw new Error("Use a SettleUp payment link.");
        const token = link.pathname.match(/\/(?:p|pay)\/([A-Za-z0-9_-]{24})\/?$/)?.[1];
        if (!token) throw new Error("This payment link is incomplete.");
        router.push(`/pay/${token}`);
      }, "Payment request opened")}>Review payment request</Button>
    </YStack></Card>
    {!!action.error && <Notice error>{action.error}</Notice>}
  </YStack>;
}

export function PayScreen() {
  const { token } = useLocalSearchParams<{ token: string }>(), router = useRouter(), action = useAction();
  const accountId = useSession(s => s.activeId), ready = useSession(s => s.ready);
  const [payment, setPayment] = useState<(ReturnType<typeof parseUpi> & { expiresAt: string }) | null>(null),
    [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setPayment(null); setError("");
    if (!accountId || Platform.OS === "web") return;
    if (!/^[A-Za-z0-9_-]{24}$/.test(token ?? "")) { setError("This payment link is incomplete."); return; }
    request<ReturnType<typeof parseUpi> & { expiresAt: string }>(`/payment-links/${token}`, { accountId })
      .then(value => { if (live) setPayment(value); })
      .catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [accountId, token, retry]);
  return <Shell><YStack gap={22} maxWidth={620} width="100%" alignSelf="center">
    <Heading>A payment request for you.</Heading>
    {Platform.OS === "web" ? <Notice>Open this link on your phone with SettleUp installed.</Notice> : !ready ? <Label>Opening your account…</Label> : !accountId ? <Card><YStack gap={14}>
      <Label>Sign in to review the payee and amount. Your request will be waiting here.</Label>
      <Button onPress={() => action.run(async () => { await useSession.getState().setPendingPayment(token); router.push("/auth"); }, "Continue to sign in")}>Sign in to continue</Button>
    </YStack></Card> : error ? <><Notice error>{error}</Notice><Button secondary onPress={() => setRetry(n => n + 1)}>Try again</Button></> : !payment ? <Label>Loading payment request…</Label> : <Card><YStack gap={16}>
      <Label muted>Requested amount</Label>
      <Heading size={36}>{money(payment.amountMinor ?? 0, "INR")}</Heading>
      <Label bold>{payment.payeeName}</Label><Label selectable>{payment.payeeAddress}</Label>
      <Notice>Confirm the recipient in your UPI app. This link does not verify the payee name or confirm a completed payment.</Notice>
      <Button disabled={action.busy} onPress={() => action.run(async () => {
        // Check expiry again on every launch, including a long-lived open screen.
        const latest = await request<{ uri: string }>(`/payment-links/${token}`, { accountId: accountId! });
        await paymentLauncher.open(latest.uri);
      }, "UPI app opened")}>Review in UPI app</Button>
    </YStack></Card>}
    {!!action.error && <Notice error>{action.error}</Notice>}
  </YStack></Shell>;
}
