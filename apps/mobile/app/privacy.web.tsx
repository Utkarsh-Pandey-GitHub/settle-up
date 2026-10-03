import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Link } from "expo-router";

const UPDATED = "2 October 2026";

export default function PrivacyPolicyWeb() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <svg width="40" height="40" viewBox="36 8 134 150">
            <g transform="rotate(0)" transform-origin="100 100">
              <rect
                x="45"
                y="39"
                width="113"
                height="114"
                rx="36"
                fill="#9F6DE4"
              />
              <path
                d="M58 60q30-24 80-4"
                fill="none"
                stroke="#C1A0F0"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
              <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
              <circle cx="85" cy="91" r="2" fill="#FFF" />
              <circle cx="127" cy="91" r="2" fill="#FFF" />
              <path
                d="M92 113q12 15 24-1"
                stroke="#38255E"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
              <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
              <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
              <g transform="rotate(10)" transform-origin="111 31">
                <rect
                  x="91"
                  y="15"
                  width="40"
                  height="32"
                  rx="11"
                  fill="#F3BC5A"
                />
                <path
                  d="m104 26 5 7 10-8"
                  stroke="#9A651E"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </g>
            </g>
          </svg>
          <Text style={styles.brandTitle}>
            settle<Text style={styles.brandAccent}>up.</Text>
          </Text>
        </View>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.subtitle}>Last updated: {UPDATED}</Text>
      </View>

      {/* Main Card */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>Overview</Text>
        <Text style={styles.body}>
          SettleUp (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is
          a personal finance tool that helps you record shared expenses, track
          debts, settle balances with friends, and set savings goals. SettleUp
          does not connect to your bank account, hold funds, or process payments
          directly.
        </Text>

        <View style={styles.highlight}>
          <Text style={styles.highlightText}>
            Key principle: SettleUp is designed to minimise data collection. We
            collect only what is necessary. We do not sell your personal data.
            We do not include advertising SDKs or third-party behavioural
            analytics.
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Information We Collect</Text>
        <Text style={styles.subHeading}>Information you provide</Text>
        <Bullet text="Phone number — used with Truecaller or Google sign-in to identify your account." />
        <Bullet text="Profile information — optional name, email, avatar, currency, and timezone." />
        <Bullet text="Financial entries — expenses, splits, repayments, goals, tags, and notes you create." />
        <Bullet text="Selected contacts — phone numbers of people you choose to split with. We do not upload your full address book." />
        <Bullet text="UPI ID — optionally provided for payment request links." />
        <Bullet text="Notification preferences — your push notification choices." />

        <Text style={styles.subHeading}>
          Information collected automatically
        </Text>
        <Bullet text="Session tokens — stored in OS-level secure storage on native devices. In the browser, tokens are kept only in memory." />
        <Bullet text="Shared-link access events — whether access was allowed and the timestamp. We do not store visitor IP addresses." />

        <Text style={styles.subHeading}>Information we do NOT collect</Text>
        <Bullet text="Bank account or card details" />
        <Bullet text="Precise location or GPS data" />
        <Bullet text="Device identifiers or advertising IDs" />
        <Bullet text="Browsing history" />
        <Bullet text="Email inbox contents" />
        <Bullet text="Full contact list (only contacts you explicitly select)" />

        <Text style={styles.sectionHeading}>How We Use Your Information</Text>
        <Bullet text="Authentication — verify your phone number." />
        <Bullet text="Core functionality — manage expenses, splits, repayments, goals, and analytics." />
        <Bullet text="Group ledgers — show shared records to ledger members." />
        <Bullet text="Payment links — generate shareable UPI payment requests." />
        <Bullet text="Notifications — push notifications about ledger activity (opt-in)." />
        <Bullet text="Analytics snapshots — spending analytics you can share via time-limited links." />

        <Text style={styles.sectionHeading}>Device Permissions</Text>
        <Text style={styles.body}>
          Permissions are requested only when you initiate a specific feature.
          Each can be declined — the app continues to function.
        </Text>
        <Bullet text="Camera — UPI QR scanning or bill photo capture." />
        <Bullet text="Photo library — select a bill photo for item extraction." />
        <Bullet text="Contacts — pick a contact for splitting. Manual entry always available." />
        <Bullet text="Notifications — optional, requested from Settings." />
        <Bullet text="SMS (Android only) — see below." />

        <Text style={styles.sectionHeading}>
          Bank SMS Review (Android Only)
        </Text>
        <View style={styles.highlight}>
          <Text style={styles.highlightText}>
            Raw SMS messages never leave your device. All parsing and matching
            happen entirely on-device.
          </Text>
        </View>
        <Bullet text="You review each suggested transaction individually — accept, edit, or reject." />
        <Bullet text="Only the structured data you approve is saved to your ledger." />
        <Bullet text="On-device fingerprints expire after seven days." />
        <Bullet text="SMS permission is requested only after an on-screen explanation and your tap." />

        <Text style={styles.sectionHeading}>Bill Scanning</Text>
        <Text style={styles.body}>
          When you scan a bill, the image is forwarded to a configured AI vision
          model for one-time itemisation. SettleUp does not store, attach, or
          retain the bill image. The provider may process images under its own
          terms.
        </Text>

        <Text style={styles.sectionHeading}>How Information Is Shared</Text>
        <Bullet text="With other users — ledger members see shared records only. Your personal entries are not visible." />
        <Bullet text="Public analytics links — frozen snapshots viewable by anyone with the token." />
        <Bullet text="Private analytics links — require the recipient's verified phone." />
        <Bullet text="AI vision model provider — receives bill images only during scanning." />
        <Bullet text="Truecaller — optional; Google sign-in remains available." />
        <Bullet text="Infrastructure providers — process data under standard agreements." />
        <View style={styles.highlight}>
          <Text style={styles.highlightText}>
            We do not sell, rent, or trade your personal information. No
            advertising network, analytics SDK, or data broker receives your
            data.
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Data Storage & Security</Text>
        <Bullet text="PostgreSQL with encryption at rest and TLS in transit." />
        <Bullet text="No app passwords — authentication uses Truecaller or Google identity tokens." />
        <Bullet text="JWT tokens with short expiry, refresh rotation, and replay revocation." />
        <Bullet text="On-device tokens use OS secure storage." />
        <Bullet text="API logging redacts sensitive headers, bodies, and tokens." />

        <Text style={styles.sectionHeading}>Data Retention & Deletion</Text>
        <Bullet text="Export your data from Settings at any time." />
        <Bullet text="Account deletion revokes sessions and links, removes your identity, profile, and preferences." />
        <Bullet text="Shared records are retained under an anonymised account for other participants." />
        <Bullet text="Unresolved obligations must be settled before deletion." />

        <Text style={styles.sectionHeading}>Third-Party Services</Text>
        <Bullet text="Truecaller (optional verification) — truecaller.com/privacy-policy" />
        <Bullet text="Expo / EAS Update (OTA updates) — expo.dev/privacy" />

        <Text style={styles.sectionHeading}>Children's Privacy</Text>
        <Text style={styles.body}>
          SettleUp is not directed at children under 13. We do not knowingly
          collect personal information from children.
        </Text>

        <Text style={styles.sectionHeading}>📝 Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this policy from time to time. Changes are reflected on
          this page with an updated date. Continued use constitutes acceptance.
        </Text>

        <Text style={styles.sectionHeading}>Contact Us</Text>
        <Text style={styles.body}>
          Questions about this policy or your data? Reach out:
        </Text>
        <Bullet text="Email: theutkarshmail@gmail.com" />
        <Bullet text="Developer: Utkarsh Pandey" />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} SettleUp. All rights reserved.
        </Text>
        <Link href="/" style={styles.homeLink}>
          Return to SettleUp
        </Link>
      </View>
    </ScrollView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F4F7",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 60,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  brandTitle: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 24,
    color: "#211D29",
    letterSpacing: -1,
  },
  brandAccent: {
    color: "#6652A3",
  },
  title: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 28,
    color: "#211D29",
    textAlign: "center",
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 13,
    color: "#716B7B",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    shadowColor: "rgba(0,0,0,0.04)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#211D29",
    marginTop: 24,
    marginBottom: 8,
  },
  subHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#211D29",
    marginTop: 12,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: "#211D29",
    lineHeight: 22,
    marginBottom: 10,
  },
  highlight: {
    backgroundColor: "#F0ECF8",
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#6652A3",
  },
  highlightText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6652A3",
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  bulletDot: {
    fontSize: 14,
    color: "#6652A3",
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: "#211D29",
    lineHeight: 22,
  },
  footer: {
    alignItems: "center",
    gap: 8,
    marginTop: 28,
  },
  footerText: {
    fontSize: 13,
    color: "#716B7B",
  },
  homeLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6652A3",
    marginTop: 4,
    textDecorationLine: "underline",
  },
});
