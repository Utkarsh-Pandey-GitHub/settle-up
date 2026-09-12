import React, { useState } from "react";
import { Platform, Share, View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { XStack, YStack } from "tamagui";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@settleup/contracts";
import { normalizePhone } from "@settleup/domain";
import { Shell } from "../components/Shell";
import {
  Label,
  Heading,
  Button,
  Card,
  Field,
  Notice,
  Avatar,
  Chip,
  ReferenceArt,
  useColors,
  Empty,
} from "../components/ui";
import {
  authorizeWithTruecaller,
  truecallerAvailable,
} from "../../modules/truecaller/client";
import { DEMO, useSession, getTokenSession } from "../data/session";
import { request, extra } from "../data/repository";
import { useAction } from "../data/hooks";
import { DataScreen, SectionTitle } from "./overview";
import {
  chooseContact,
  enableNotifications,
  disableLocalNotifications,
} from "../services/device";
export function OnboardingScreen() {
  const router = useRouter(),
    c = useColors(),
    [step, setStep] = useState(0);
  const slides = [
    {
      scene: "coins" as const,
      title: "Make space for what matters.",
      text: "See your everyday spending in one clear picture. Small entries, a little more peace of mind.",
    },
    {
      scene: "wallet" as const,
      title: "Every shared moment. A fair share.",
      text: "From a coffee to a weekend away, keep the split clear and the friendships easy.",
    },
    {
      scene: "privacy" as const,
      title: "Your money. Your own space.",
      text: "Private accounts, thoughtful sharing, and every bill right where you need it.",
    },
  ];
  return (
    <Shell>
      <YStack
        gap={26}
        maxWidth={660}
        width="100%"
        alignSelf="center"
        paddingVertical={20}
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Label muted size={11} bold letterSpacing={1.5}>
            A LITTLE TOUR
          </Label>
          <Button secondary compact onPress={() => router.push("/auth")}>
            Skip intro
          </Button>
        </XStack>
        <Card style={{ backgroundColor: [c.butter, c.peach, c.blue][step] }}>
          <YStack gap={22} alignItems="center" paddingVertical={16}>
            <ReferenceArt key={step} scene={slides[step].scene} size={260} />
            <XStack gap={8}>
              {slides.map((s, i) => (
                <Pressable
                  key={s.scene}
                  accessibilityRole="button"
                  accessibilityLabel={`Introduction step ${i + 1}`}
                  accessibilityState={{ selected: step === i }}
                  onPress={() => setStep(i)}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: step === i ? 25 : 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: step === i ? "#6F6CD9" : "#DCDDD5",
                    }}
                  />
                </Pressable>
              ))}
            </XStack>
            <Heading size={30}>{slides[step].title}</Heading>
            <Label muted size={15} textAlign="center">
              {slides[step].text}
            </Label>
          </YStack>
        </Card>
        <Button
          onPress={() =>
            step === 2 ? router.push("/auth") : setStep(step + 1)
          }
        >
          {step === 2 ? "Let’s get started" : "Continue"}
        </Button>
        {step > 0 && (
          <Button secondary onPress={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Label muted size={11} textAlign="center">
          SettleUp records payments. It does not hold or transfer money.
        </Label>
      </YStack>
    </Shell>
  );
}
export function AuthScreen() {
  const router = useRouter(),
    action = useAction(),
    c = useColors();
  const active = useSession((s) => s.accounts.find((a) => a.id === s.activeId));
  const [stage, setStage] = useState<"phone" | "code" | "profile" | "ready">(
    active?.name === "New friend" ? "profile" : "phone",
  );
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [devCode, setDevCode] = useState("");
  const [name, setName] = useState(""),
    [currency, setCurrency] = useState("INR");
  const [verifiedId, setVerifiedId] = useState(
    active?.name === "New friend" ? active.id : "",
  );
  const acceptSession = async (
    session: Session & { suggestedName?: string },
  ) => {
    await useSession.getState().add(session);
    if (session.account.name !== "New friend") {
      router.replace("/");
      return;
    }
    setVerifiedId(session.account.id);
    setName(session.suggestedName ?? "");
    setCurrency(session.account.currency);
    setStage("profile");
  };
  const step =
    stage === "phone" || stage === "code" ? 1 : stage === "profile" ? 2 : 3;
  return (
    <Shell>
      <YStack
        gap={20}
        maxWidth={500}
        width="100%"
        alignSelf="center"
        paddingVertical={12}
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Label bold size={11} letterSpacing={1.5}>
            YOUR FRESH START
          </Label>
          <Label muted size={11}>
            Step {step} of 3
          </Label>
        </XStack>
        <XStack gap={6}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= step ? "#6F6CD9" : c.line,
              }}
            />
          ))}
        </XStack>
        <YStack alignItems="center" gap={10} paddingVertical={8}>
          <ReferenceArt
            scene={stage === "ready" ? "coins" : "privacy"}
            size={stage === "phone" ? 155 : 100}
          />
          <Heading size={27}>
            {stage === "phone"
              ? "A little more peace of mind."
              : stage === "code"
                ? "You’re one code away."
                : stage === "profile"
                  ? "Make yourself at home."
                  : `You’re all set, ${name.split(" ")[0]}.`}
          </Heading>
          <Label muted size={13} textAlign="center">
            {stage === "phone"
              ? "One place for your spending, shared plans, and the people in them."
              : stage === "code"
                ? `Enter the six-digit code sent to ${phone}.`
                : stage === "profile"
                  ? "Just the essentials. You can change these later."
                  : "Your private space is ready. Start small, make it yours."}
          </Label>
        </YStack>
        {DEMO && stage !== "ready" && (
          <Notice>
            This is a demo. Phone verification becomes available when the live
            API is connected.
          </Notice>
        )}
        <Card style={{ padding: 22 }}>
          <YStack gap={16}>
            {stage === "phone" && (
              <>
                {truecallerAvailable && (
                  <>
                    <Button
                      disabled={action.busy || DEMO}
                      onPress={() =>
                        action.run(async () => {
                          const proof = await authorizeWithTruecaller();
                          const session = await request<
                            Session & { suggestedName?: string }
                          >("/auth/truecaller", { body: proof });
                          await acceptSession(session);
                        }, "Phone verified")
                      }
                    >
                      Continue with Truecaller
                    </Button>
                    <Label muted size={11} textAlign="center">
                      Or use a phone verification code
                    </Label>
                  </>
                )}
                <Field
                  label="Phone number"
                  placeholder="+91 98765 43210"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  value={phone}
                  onChangeText={setPhone}
                  editable={!action.busy}
                />
                <Button
                  disabled={action.busy || DEMO || !phone.trim()}
                  onPress={() =>
                    action.run(async () => {
                      const normalized = normalizePhone(phone);
                      const result = await request<{
                        challengeId: string;
                        developmentCode?: string;
                      }>("/auth/otp", { body: { phone: normalized } });
                      setPhone(normalized);
                      setChallenge(result.challengeId);
                      setDevCode(result.developmentCode ?? "");
                      setStage("code");
                    }, "Code sent")
                  }
                >
                  {action.busy ? "Sending code…" : "Continue with phone"}
                </Button>
                <Label muted size={11}>
                  We use your number to verify your account. Your address book
                  is not required.
                </Label>
              </>
            )}
            {stage === "code" && (
              <>
                <Field
                  label="Six-digit verification code"
                  placeholder="000000"
                  value={code}
                  onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  editable={!action.busy}
                />
                {!!devCode && (
                  <Notice>
                    Development provider code: {devCode}. Never displayed in
                    production.
                  </Notice>
                )}
                <Button
                  disabled={action.busy || code.length !== 6}
                  onPress={() =>
                    action.run(async () => {
                      await acceptSession(
                        await request<Session>("/auth/verify", {
                          body: { challengeId: challenge, code },
                        }),
                      );
                    }, "Phone verified")
                  }
                >
                  {action.busy ? "Checking…" : "Verify & continue"}
                </Button>
                <Button
                  secondary
                  disabled={action.busy}
                  onPress={() => {
                    setStage("phone");
                    setCode("");
                    setChallenge("");
                    setDevCode("");
                    action.setError("");
                  }}
                >
                  Use a different number
                </Button>
                <Label muted size={11}>
                  Code expired? Go back and request a new one.
                </Label>
              </>
            )}
            {stage === "profile" && (
              <>
                <Field
                  label="What should we call you?"
                  placeholder="Your name"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  textContentType="name"
                  editable={!action.busy}
                />
                <Label size={12} bold>
                  Your everyday currency
                </Label>
                <XStack gap={8} flexWrap="wrap">
                  {["INR", "USD", "EUR", "GBP"].map((value) => (
                    <Chip
                      key={value}
                      selected={currency === value}
                      onPress={() => setCurrency(value)}
                    >
                      {value}
                    </Chip>
                  ))}
                </XStack>
                <Button
                  disabled={action.busy || !name.trim()}
                  onPress={() =>
                    action.run(async () => {
                      if (name.trim() === "New friend")
                        throw new Error("Please use your name or a nickname.");
                      await request("/profile", {
                        accountId: verifiedId,
                        method: "PATCH",
                        body: { name: name.trim(), currency },
                      });
                      const session = getTokenSession(verifiedId);
                      if (!session) throw new Error("Please sign in again.");
                      await useSession
                        .getState()
                        .add({
                          ...session,
                          account: {
                            ...session.account,
                            name: name.trim(),
                            currency,
                            avatar: name.trim().slice(0, 2).toUpperCase(),
                          },
                        });
                      setName(name.trim());
                      setStage("ready");
                    }, "Your space is ready")
                  }
                >
                  {action.busy ? "Creating your space…" : "Make it mine"}
                </Button>
              </>
            )}
            {stage === "ready" && (
              <>
                <Label bold size={14}>
                  Start with something from today.
                </Label>
                <Label muted size={12}>
                  A coffee, a grocery run, or a bill you shared.
                </Label>
                <Button icon="plus" onPress={() => router.replace("/add")}>
                  Add my first expense
                </Button>
                <Button secondary onPress={() => router.replace("/")}>
                  Explore my dashboard
                </Button>
              </>
            )}
            {!!action.error && <Notice error>{action.error}</Notice>}
          </YStack>
        </Card>
        <Label muted size={11} textAlign="center">
          Your money. Your people. Shared only when you choose.
        </Label>
      </YStack>
    </Shell>
  );
}
export function AccountsScreen() {
  const accounts = useSession((s) => s.accounts),
    activeId = useSession((s) => s.activeId),
    router = useRouter(),
    query = useQueryClient(),
    action = useAction();
  return (
    <Shell>
      <YStack gap={22} maxWidth={700} width="100%" alignSelf="center">
        <Heading>A space for every account.</Heading>
        <Label muted>
          Separate sessions. Separate data. Switch without signing everyone out.
        </Label>
        {accounts.map((a) => (
          <Card key={a.id}>
            <XStack alignItems="center" gap={15}>
              <Avatar name={a.name} size={48} />
              <YStack flex={1}>
                <Label bold>{a.name}</Label>
                <Label muted size={12}>
                  {a.phone}
                </Label>
              </YStack>
              <Button
                secondary={a.id !== activeId}
                onPress={async () => {
                  await query.cancelQueries();
                  query.clear();
                  useSession.getState().switchTo(a.id);
                  router.replace("/");
                }}
              >
                {a.id === activeId ? "Active" : "Switch"}
              </Button>
            </XStack>
            <Pressable
              style={{
                minHeight: 44,
                justifyContent: "center",
                alignSelf: "flex-start",
                marginTop: 10,
              }}
              onPress={() =>
                action.run(async () => {
                  if (!DEMO)
                    await request("/auth/logout", {
                      accountId: a.id,
                      body: {},
                    });
                  await useSession.getState().remove(a.id);
                  query.clear();
                }, "Account removed from this device")
              }
            >
              <Label muted size={12}>
                Remove from this device
              </Label>
            </Pressable>
          </Card>
        ))}
        {!!action.error && <Notice error>{action.error}</Notice>}
        <Button icon="plus" onPress={() => router.push("/auth")}>
          Add another account
        </Button>
      </YStack>
    </Shell>
  );
}
export function SettingsScreen() {
  const [name, setName] = useState(""),
    [deleteText, setDeleteText] = useState(""),
    [exported, setExported] = useState("");
  const dark = useSession((s) => s.dark),
    router = useRouter(),
    action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22} maxWidth={760} width="100%" alignSelf="center">
          <Heading>Make yourself at home.</Heading>
          <Card>
            <YStack gap={17}>
              <SectionTitle title="Profile" />
              <Field
                label="Display name"
                value={name || d.account.name}
                onChangeText={setName}
              />
              <Button
                secondary
                onPress={() =>
                  action.run(() =>
                    extra(
                      d.account.id,
                      "/profile",
                      { name: name || d.account.name },
                      "PATCH",
                    ),
                  )
                }
              >
                Save profile
              </Button>
              <Button secondary onPress={() => router.push("/accounts")}>
                Manage saved accounts
              </Button>
            </YStack>
          </Card>
          <Card>
            <YStack gap={17}>
              <SectionTitle title="Your preferences" />
              <XStack justifyContent="space-between" alignItems="center">
                <Label>Appearance</Label>
                <Chip
                  selected={dark}
                  onPress={() => useSession.getState().setDark(!dark)}
                >
                  {dark ? "Dark theme" : "Light theme"}
                </Chip>
              </XStack>
              <Label muted size={12}>
                Notifications are optional. Enable them for budget threshold
                updates. You can disable them in system settings at any time.
              </Label>
              <Button
                secondary
                onPress={() =>
                  action.run(async () => {
                    const pushToken = await enableNotifications(d.account.id);
                    await extra(
                      d.account.id,
                      "/notifications",
                      { goals: true, ...(pushToken ? { pushToken } : {}) },
                      "PATCH",
                    );
                  }, "Notification preference saved")
                }
              >
                Enable goal notifications
              </Button>
              <Button
                secondary
                onPress={() =>
                  action.run(async () => {
                    await disableLocalNotifications(d.account.id);
                    await extra(
                      d.account.id,
                      "/notifications",
                      { goals: false, activity: false },
                      "PATCH",
                    );
                  }, "Notifications disabled")
                }
              >
                Disable notifications
              </Button>
              <Button secondary onPress={() => router.push("/contacts")}>
                Contacts & peers
              </Button>
              <Button secondary onPress={() => router.push("/sms")}>
                SMS permissions
              </Button>
            </YStack>
          </Card>
          <Card>
            <YStack gap={16}>
              <SectionTitle title="Privacy & security" />
              <Notice>
                We do not upload your address book or raw SMS. Your financial
                data stays scoped to your account. Shared analytics is opt-in,
                read-only, and expires.
              </Notice>
              <Button
                secondary
                onPress={() =>
                  action.run(
                    () =>
                      extra(
                        d.account.id,
                        "/profile",
                        { discoverable: false },
                        "PATCH",
                      ),
                    "Contact discovery disabled",
                  )
                }
              >
                Disable contact discovery
              </Button>
              <Label bold size={13}>
                Block a peer
              </Label>
              <XStack gap={8} flexWrap="wrap">
                {d.peers.map((p) => (
                  <Chip
                    key={p.id}
                    onPress={() =>
                      action.run(
                        () => extra(d.account.id, "/blocks", { userId: p.id }),
                        "Peer blocked",
                      )
                    }
                  >
                    {p.name}
                  </Chip>
                ))}
              </XStack>
              <Button
                secondary
                icon="download"
                onPress={() =>
                  action.run(async () => {
                    const result = await extra(d.account.id, "/account/export");
                    const text = JSON.stringify(result, null, 2);
                    if (Platform.OS === "web") {
                      const blob = new Blob([text], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "settleup-export.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    } else
                      await Share.share({
                        message: text,
                        title: "Your SettleUp data",
                      });
                    setExported("Your export is ready.");
                  }, "Export prepared")
                }
              >
                Export my data
              </Button>
              {!!exported && <Label muted>{exported}</Label>}
            </YStack>
          </Card>
          <Card>
            <YStack gap={14}>
              <Heading size={18}>Delete account</Heading>
              <Label muted size={12}>
                This revokes sessions and links and removes your profile. Shared
                financial history is retained in anonymized form for the other
                participants. Outstanding obligations must be resolved first.
              </Label>
              <Field
                label="Type DELETE MY ACCOUNT to confirm"
                value={deleteText}
                onChangeText={setDeleteText}
              />
              <Button
                secondary
                disabled={deleteText !== "DELETE MY ACCOUNT" || action.busy}
                onPress={() =>
                  action.run(async () => {
                    await extra(
                      d.account.id,
                      "/account",
                      { confirmation: deleteText },
                      "DELETE",
                    );
                    await useSession.getState().remove(d.account.id);
                    router.replace("/accounts");
                  })
                }
              >
                Delete my account
              </Button>
            </YStack>
          </Card>
          {!!action.error && <Notice error>{action.error}</Notice>}
          {!!action.success && <Notice>{action.success}</Notice>}
        </YStack>
      )}
    </DataScreen>
  );
}
export function ContactsScreen() {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [invite, setInvite] = useState(""),
    action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22} maxWidth={760} width="100%" alignSelf="center">
          <Heading>Your people, at your pace.</Heading>
          <Notice>
            Choose one contact at a time. Your address book is never uploaded.
            New peers stay unverified until they accept an invitation using the
            same verified phone number.
          </Notice>
          <Button
            secondary
            onPress={() =>
              action.run(async () => {
                const contact = await chooseContact();
                if (contact) {
                  setName(contact.name);
                  setPhone(contact.phone);
                }
              }, "Contact selected")
            }
          >
            Choose a phone contact
          </Button>
          <Card>
            <YStack gap={15}>
              <Field label="Name" value={name} onChangeText={setName} />
              <Field
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <Button
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
                    if (!name.trim()) throw new Error("Enter a name.");
                    await extra(d.account.id, "/peers", {
                      name,
                      phone: normalizePhone(phone),
                    });
                    setName("");
                    setPhone("");
                  }, "Peer saved")
                }
              >
                Save peer
              </Button>
            </YStack>
          </Card>
          {d.peers.map((p) => (
            <Card key={p.id}>
              <XStack alignItems="center" gap={12}>
                <Avatar name={p.name} />
                <YStack flex={1}>
                  <Label bold>{p.name}</Label>
                  <Label muted size={12}>
                    {p.phone ?? "Group member"}
                  </Label>
                </YStack>
                {!!p.phone && (
                  <Button
                    secondary
                    compact
                    onPress={() =>
                      action.run(async () => {
                        const result = await extra(
                          d.account.id,
                          `/peers/${p.id}/invite`,
                          {},
                        );
                        setInvite(result.url);
                      }, "Invitation created. Share it yourself when ready.")
                    }
                  >
                    Create invite
                  </Button>
                )}
              </XStack>
            </Card>
          ))}
          {!!invite && (
            <Field label="Invitation link" value={invite} editable={false} />
          )}
          {!!action.error && <Notice error>{action.error}</Notice>}
          {!!action.success && <Notice>{action.success}</Notice>}
        </YStack>
      )}
    </DataScreen>
  );
}
export function NotificationsScreen() {
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={22}>
          <Heading>A little heads-up.</Heading>
          <Label muted>Your recent ledger activity.</Label>
          <Card>
            {d.activity.length ? (
              d.activity.map((a) => (
                <YStack key={a.id} gap={5} paddingVertical={14}>
                  <Label>{a.message}</Label>
                  <Label muted size={11}>
                    {new Date(a.createdAt).toLocaleString("en-IN")}
                  </Label>
                </YStack>
              ))
            ) : (
              <Empty
                title="All quiet here"
                detail="Updates will appear as you use your ledger."
              />
            )}
          </Card>
        </YStack>
      )}
    </DataScreen>
  );
}
export function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>(),
    action = useAction();
  return (
    <DataScreen>
      {(d) => (
        <YStack gap={20}>
          <Heading>A friend saved you a spot.</Heading>
          <Notice>
            Accepting links your verified phone number to this invitation. The
            intended number is never shown to visitors.
          </Notice>
          <Button
            onPress={() =>
              action.run(
                () => extra(d.account.id, "/invites/claim", { token }),
                "Invitation accepted",
              )
            }
          >
            Accept invitation
          </Button>
          {!!action.error && <Notice error>{action.error}</Notice>}
          {!!action.success && <Notice>{action.success}</Notice>}
        </YStack>
      )}
    </DataScreen>
  );
}
