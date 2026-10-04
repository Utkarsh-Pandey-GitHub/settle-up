import React from "react";
import { ScrollView, Linking } from "react-native";
import { YStack } from "tamagui";
import { Shell } from "../src/components/Shell";
import { Heading, Label, Card, Button, useColors } from "../src/components/ui";

const SUPPORT_EMAIL = "up714279@gmail.com";

export default function DeleteAccountPage() {
  const c = useColors();

  const openEmail = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=SettleUp%20-%20Account%20Deletion%20Request&body=Hello%2C%0A%0AI%20would%20like%20to%20request%20the%20deletion%20of%20my%20SettleUp%20account%20and%20associated%20data.%0A%0AMy%20registered%20phone%20number%20or%20Google%20email%20is%3A%20%0A%0AThank%20you.`,
    );
  };

  return (
    <Shell>
      <ScrollView showsVerticalScrollIndicator={false}>
        <YStack
          width="100%"
          maxWidth={760}
          alignSelf="center"
          gap={16}
          paddingBottom={40}
        >
          <Heading size={24}>Account & Data Deletion</Heading>
          <Label muted size={13}>
            App: SettleUp • Developer: Utkarsh Pandey
          </Label>

          <Card style={{ padding: 18 }}>
            <YStack gap={10}>
              <Heading size={18}>How to delete your account</Heading>
              <Label size={14} color={c.text} lineHeight={20}>
                You can delete your account immediately right from this app:
              </Label>
              <Label size={13} muted lineHeight={19}>
                1. Go to Account (tap your profile icon).{"\n"}
                2. Scroll to the &quot;Delete account&quot; section.{"\n"}
                3. Type &quot;DELETE MY ACCOUNT&quot; in the confirmation field.
                {"\n"}
                4. Tap &quot;Delete my account&quot;. Your profile, phone and
                Google identities, sessions, preferences, and personal-only
                records are permanently erased.
              </Label>
            </YStack>
          </Card>

          <Card style={{ padding: 18 }}>
            <YStack gap={12}>
              <Heading size={18}>Request deletion without the app</Heading>
              <Label size={14} color={c.text} lineHeight={20}>
                If you have uninstalled the app or cannot log in, email us at:
              </Label>
              <Label size={14} bold color={c.accent}>
                {SUPPORT_EMAIL}
              </Label>
              <Label size={13} muted lineHeight={19}>
                Include your registered phone number or Google account email.
                Deletion requests submitted via email are processed within 30
                days.
              </Label>
              <Button secondary onPress={openEmail}>
                Send Deletion Request Email
              </Button>
            </YStack>
          </Card>

          <Card style={{ padding: 18 }}>
            <YStack gap={10}>
              <Heading size={18}>What data is deleted</Heading>
              <Label size={13} muted lineHeight={19}>
                • Profile: Name, email, avatar, timezone, currency preference,
                and discoverability.{"\n"}• Authentication: Phone and Google
                associations and all login sessions.{"\n"}• Personal data:
                Personal-only transactions, goals, tags, payment and analytics
                links, SMS decisions, notifications, and preferences.
              </Label>
            </YStack>
          </Card>

          <Card style={{ padding: 18 }}>
            <YStack gap={10}>
              <Heading size={18}>What data is retained</Heading>
              <Label size={13} muted lineHeight={19}>
                • Shared records: Transactions, splits, settlements, balances,
                and group history involving other people remain accurate. Your
                identity becomes &quot;Deleted member&quot;.{"\n"}• Deletion
                audit: A minimal event is retained for up to 12 months.{"\n"}•
                Backups: Residual encrypted copies rotate out within 90 days.
              </Label>
            </YStack>
          </Card>
        </YStack>
      </ScrollView>
    </Shell>
  );
}
