import React from "react";
import { ScrollView, Platform, Linking } from "react-native";
import { YStack, XStack } from "tamagui";
import {
  Label,
  Heading,
  Card,
  useColors,
  Mascot,
  Brand,
} from "../src/components/ui";

const UPDATED = "2 October 2026";

function SectionHeading({ children }: { children: string }) {
  const c = useColors();
  return (
    <Label
      bold
      size={17}
      color={c.text}
      style={{ marginTop: 24, marginBottom: 8 }}
    >
      {children}
    </Label>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <XStack gap={8} style={{ marginBottom: 6 }}>
      <Label size={14} color={c.accent} style={{ marginTop: 2 }}>
        •
      </Label>
      <Label size={14} color={c.text} flex={1} lineHeight={22}>
        {children}
      </Label>
    </XStack>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <YStack
      style={{
        backgroundColor: c.soft,
        borderRadius: 12,
        padding: 14,
        marginVertical: 12,
        borderLeftWidth: 3,
        borderLeftColor: c.accent,
      }}
    >
      <Label bold size={14} color={c.accent} lineHeight={20}>
        {children}
      </Label>
    </YStack>
  );
}

function BodyText({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Label
      size={14}
      color={c.text}
      lineHeight={22}
      style={{ marginBottom: 10 }}
    >
      {children}
    </Label>
  );
}

export default function PrivacyScreen() {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: Platform.OS === "web" ? 40 : 60,
        paddingBottom: 60,
        maxWidth: 720,
        alignSelf: "center",
        width: "100%",
      }}
    >
      {/* Header */}
      <YStack alignItems="center" gap={12} style={{ marginBottom: 28 }}>
        <Brand />
        <Heading size={28} textAlign="center">
          Privacy Policy
        </Heading>
        <Label size={13} color={c.muted}>
          Last updated: {UPDATED}
        </Label>
      </YStack>

      {/* Content */}
      <Card style={{ padding: 20, borderRadius: 20 }}>
        <SectionHeading>Overview</SectionHeading>
        <BodyText>
          SettleUp ("we", "our", or "the app") is a personal finance tool that
          helps you record shared expenses, track debts, settle balances with
          friends, and set savings goals. SettleUp does not connect to your bank
          account, hold funds, or process payments directly.
        </BodyText>
        <Highlight>
          Key principle: SettleUp is designed to minimise data collection. We
          collect only what is necessary. We do not sell your personal data. We
          do not include advertising SDKs or third-party behavioural analytics.
        </Highlight>

        <SectionHeading>Information We Collect</SectionHeading>
        <Label
          bold
          size={15}
          color={c.text}
          style={{ marginTop: 8, marginBottom: 6 }}
        >
          Information you provide
        </Label>
        <Bullet>
          Phone number — used with Truecaller or Google sign-in to identify your
          account.
        </Bullet>
        <Bullet>
          Profile information — optional name, email, avatar, currency, and
          timezone.
        </Bullet>
        <Bullet>
          Financial entries — expenses, splits, repayments, goals, tags, and
          notes you create.
        </Bullet>
        <Bullet>
          Selected contacts — phone numbers of people you choose to split with.
          We do not upload your full address book.
        </Bullet>
        <Bullet>UPI ID — optionally provided for payment request links.</Bullet>
        <Bullet>
          Notification preferences — your push notification choices.
        </Bullet>

        <Label
          bold
          size={15}
          color={c.text}
          style={{ marginTop: 12, marginBottom: 6 }}
        >
          Information collected automatically
        </Label>
        <Bullet>
          Session tokens — stored in OS-level secure storage on native devices.
          In the browser, tokens are kept only in memory.
        </Bullet>
        <Bullet>
          Shared-link access events — whether access was allowed and the
          timestamp. We do not store visitor IP addresses.
        </Bullet>

        <Label
          bold
          size={15}
          color={c.text}
          style={{ marginTop: 12, marginBottom: 6 }}
        >
          Information we do NOT collect
        </Label>
        <Bullet>Bank account or card details</Bullet>
        <Bullet>Precise location or GPS data</Bullet>
        <Bullet>Device identifiers or advertising IDs</Bullet>
        <Bullet>Browsing history</Bullet>
        <Bullet>Email inbox contents</Bullet>
        <Bullet>Full contact list (only contacts you explicitly select)</Bullet>

        <SectionHeading>How We Use Your Information</SectionHeading>
        <Bullet>Authentication — verify your phone number.</Bullet>
        <Bullet>
          Core functionality — manage expenses, splits, repayments, goals, and
          analytics.
        </Bullet>
        <Bullet>Group ledgers — show shared records to ledger members.</Bullet>
        <Bullet>
          Payment links — generate shareable UPI payment requests.
        </Bullet>
        <Bullet>
          Notifications — push notifications about ledger activity (opt-in).
        </Bullet>
        <Bullet>
          Analytics snapshots — spending analytics you can share via
          time-limited links.
        </Bullet>

        <SectionHeading>Device Permissions</SectionHeading>
        <BodyText>
          Permissions are requested only when you initiate a specific feature.
          Each can be declined — the app continues to function.
        </BodyText>
        <Bullet>Camera — UPI QR scanning or bill photo capture.</Bullet>
        <Bullet>
          Photo library — select a bill photo for item extraction.
        </Bullet>
        <Bullet>
          Contacts — pick a contact for splitting. Manual entry always
          available.
        </Bullet>
        <Bullet>Notifications — optional, requested from Settings.</Bullet>
        <Bullet>SMS (Android only) — see below.</Bullet>

        <SectionHeading>Bank SMS Review (Android Only)</SectionHeading>
        <Highlight>
          Raw SMS messages never leave your device. All parsing and matching
          happen entirely on-device.
        </Highlight>
        <Bullet>
          You review each suggested transaction individually — accept, edit, or
          reject.
        </Bullet>
        <Bullet>
          Only the structured data you approve is saved to your ledger.
        </Bullet>
        <Bullet>On-device fingerprints expire after seven days.</Bullet>
        <Bullet>
          SMS permission is requested only after an on-screen explanation and
          your tap.
        </Bullet>

        <SectionHeading>Bill Scanning</SectionHeading>
        <BodyText>
          When you scan a bill, the image is forwarded to a configured AI vision
          model for one-time itemisation. SettleUp does not store, attach, or
          retain the bill image. The provider may process images under its own
          terms.
        </BodyText>

        <SectionHeading>How Information Is Shared</SectionHeading>
        <Bullet>
          With other users — ledger members see shared records only. Your
          personal entries are not visible.
        </Bullet>
        <Bullet>
          Public analytics links — frozen snapshots viewable by anyone with the
          token.
        </Bullet>
        <Bullet>
          Private analytics links — require the recipient's verified phone.
        </Bullet>
        <Bullet>
          AI vision model provider — receives bill images only during scanning.
        </Bullet>
        <Bullet>
          Truecaller — optional; Google sign-in remains available.
        </Bullet>
        <Bullet>
          Infrastructure providers — process data under standard agreements.
        </Bullet>
        <Highlight>
          We do not sell, rent, or trade your personal information. No
          advertising network, analytics SDK, or data broker receives your data.
        </Highlight>

        <SectionHeading>Data Storage &amp; Security</SectionHeading>
        <Bullet>PostgreSQL with encryption at rest and TLS in transit.</Bullet>
        <Bullet>
          No app passwords — authentication uses Truecaller or Google identity
          tokens.
        </Bullet>
        <Bullet>
          JWT tokens with short expiry, refresh rotation, and replay revocation.
        </Bullet>
        <Bullet>On-device tokens use OS secure storage.</Bullet>
        <Bullet>
          API logging redacts sensitive headers, bodies, and tokens.
        </Bullet>

        <SectionHeading>Data Retention &amp; Deletion</SectionHeading>
        <Bullet>Export your data from Settings at any time.</Bullet>
        <Bullet>
          Account deletion removes your phone and Google identities, profile,
          sessions, private links, preferences, personal-only transactions,
          goals, and tags.
        </Bullet>
        <Bullet>
          Shared records remain available to other participants under the
          non-identifying label Deleted member.
        </Bullet>
        <Bullet>
          A minimal deletion audit is retained for up to 12 months; encrypted
          backup remnants rotate out within 90 days.
        </Bullet>

        <SectionHeading>Third-Party Services</SectionHeading>
        <Bullet>
          Truecaller (optional verification) — truecaller.com/privacy-policy
        </Bullet>
        <Bullet>Expo / EAS Update (OTA updates) — expo.dev/privacy</Bullet>

        <SectionHeading>Children's Privacy</SectionHeading>
        <BodyText>
          SettleUp is not directed at children under 13. We do not knowingly
          collect personal information from children.
        </BodyText>

        <SectionHeading>📝 Changes to This Policy</SectionHeading>
        <BodyText>
          We may update this policy from time to time. Changes are reflected on
          this page with an updated date. Continued use constitutes acceptance.
        </BodyText>

        <SectionHeading>Contact Us</SectionHeading>
        <BodyText>
          Questions about this policy or your data? Reach out:
        </BodyText>
        <Bullet>Email: theutkarshmail@gmail.com</Bullet>
        <Bullet>Developer: Utkarsh Pandey</Bullet>
      </Card>

      {/* Footer */}
      <YStack alignItems="center" gap={4} style={{ marginTop: 28 }}>
        <Label size={13} color={c.muted}>
          © {new Date().getFullYear()} SettleUp. All rights reserved.
        </Label>
      </YStack>
    </ScrollView>
  );
}
