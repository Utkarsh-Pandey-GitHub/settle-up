import React from "react";
import { YStack } from "tamagui";
import { Shell } from "../src/components/Shell";
import { Card, Heading, Label } from "../src/components/ui";

const sections = [
  [
    "Using SettleUp",
    "You must provide accurate account information and use the app only for lawful personal expense tracking and payment requests.",
  ],
  [
    "Financial records",
    "SettleUp records information you enter. It is not a bank, wallet, lender, payment processor, or financial adviser. Confirm amounts before paying through another app.",
  ],
  [
    "Shared groups",
    "Group members can see and update shared transactions. Changes are logged. Deleted groups remain read-only so their financial history is preserved.",
  ],
  [
    "Availability",
    "We work to keep the service available, but network, provider, and maintenance interruptions may occur. Keep independent records when required.",
  ],
  [
    "Your responsibility",
    "You are responsible for your device, sign-in methods, entries, payment decisions, and compliance with applicable law.",
  ],
  [
    "Changes and contact",
    "These terms may be updated as the service changes. The effective date below identifies the version that applies.",
  ],
] as const;

export default function TermsPage() {
  return (
    <Shell>
      <YStack width="100%" maxWidth={760} alignSelf="center" gap={16}>
        <Heading>Terms and conditions</Heading>
        <Label muted>Effective 3 October 2026</Label>
        {sections.map(([title, text]) => (
          <Card key={title} style={{ padding: 16 }}>
            <YStack gap={7}>
              <Heading size={17}>{title}</Heading>
              <Label muted>{text}</Label>
            </YStack>
          </Card>
        ))}
      </YStack>
    </Shell>
  );
}
