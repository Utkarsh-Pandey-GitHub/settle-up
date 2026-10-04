import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Link } from "expo-router";
import type { Session } from "@settleup/contracts";
import { GoogleSignInButton } from "../src/features/account";
import { API_URL } from "../src/data/repository";
import { Field, Button } from "../src/components/ui";

const UPDATED = "4 October 2026";
const SUPPORT_EMAIL = "up714279@gmail.com";
const MAILTO_HREF = `mailto:${SUPPORT_EMAIL}?subject=SettleUp%20-%20Account%20Deletion%20Request&body=Hello%2C%0A%0AI%20would%20like%20to%20request%20the%20deletion%20of%20my%20SettleUp%20account%20and%20associated%20data.%0A%0AMy%20registered%20phone%20number%20or%20Google%20email%20is%3A%20%0A%0AThank%20you.`;

export default function DeleteAccountWeb() {
  const [session, setSession] = useState<Session | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
        <Text style={styles.eyebrow}>PRIVACY CONTROL</Text>
        <Text style={styles.title}>Delete your SettleUp account and data</Text>
        <Text style={styles.subtitle}>
          App: SettleUp • Developer: Utkarsh Pandey • Last updated: {UPDATED}
        </Text>
      </View>

      {/* Main Card */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>Overview</Text>
        <Text style={styles.body}>
          At SettleUp (developed by Utkarsh Pandey), we respect your right to
          control your personal data. You can permanently delete your SettleUp
          account in the app or request deletion here even if you no longer have
          the app installed.
        </Text>

        <View style={styles.highlight}>
          <Text style={styles.highlightText}>
            In-app deletion is immediate. Email requests are verified and
            completed within 30 days.
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Delete online with Google</Text>
        <Text style={styles.body}>
          Sign in with the Google account already linked to SettleUp. Your
          Google credential is used only to verify ownership of the account.
        </Text>
        <View style={styles.authPanel}>
          {!session ? (
            <GoogleSignInButton
              disabled={busy}
              label="Sign in with Google to delete"
              onSession={async (verified) => {
                setSession(verified);
                setError("");
                setStatus(
                  `Verified ${verified.account.email ?? verified.account.name}.`,
                );
              }}
            />
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={styles.body}>{status}</Text>
              <Field
                label="Type DELETE MY ACCOUNT to confirm"
                value={confirmation}
                onChangeText={setConfirmation}
              />
              <Button
                loading={busy}
                disabled={confirmation !== "DELETE MY ACCOUNT" || busy}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const response = await fetch(`${API_URL}/account`, {
                      method: "DELETE",
                      headers: {
                        authorization: `Bearer ${session.accessToken}`,
                        "content-type": "application/json",
                      },
                      body: JSON.stringify({
                        confirmation: "DELETE MY ACCOUNT",
                      }),
                    });
                    const result = await response.json();
                    if (!response.ok)
                      throw new Error(
                        result.message ?? "Deletion could not be completed.",
                      );
                    setSession(null);
                    setConfirmation("");
                    setStatus(
                      "Your SettleUp account and personal data have been deleted.",
                    );
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Deletion could not be completed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Permanently delete my account
              </Button>
            </View>
          )}
          {!!status && !session && (
            <Text style={styles.successText}>{status}</Text>
          )}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {/* Steps */}
        <Text style={styles.sectionHeading}>
          How to Request Account & Data Deletion
        </Text>

        <Text style={styles.subHeading}>
          Option 1: In the SettleUp App (Instant)
        </Text>
        <Text style={styles.body}>
          If you have the SettleUp app installed on your device:
        </Text>
        <View style={styles.stepBox}>
          <Text style={styles.stepItem}>
            1. Open the SettleUp app on your phone.
          </Text>
          <Text style={styles.stepItem}>
            2. Tap your profile avatar or go to the Account / Settings screen.
          </Text>
          <Text style={styles.stepItem}>
            3. Scroll down to the &quot;Delete account&quot; section.
          </Text>
          <Text style={styles.stepItem}>
            4. Type &quot;DELETE MY ACCOUNT&quot; in the confirmation input.
          </Text>
          <Text style={styles.stepItem}>
            5. Tap the &quot;Delete my account&quot; button. The app signs you
            out and deletes your personal data immediately.
          </Text>
        </View>

        <Text style={styles.subHeading}>
          Email request if Google is not linked
        </Text>
        <Text style={styles.body}>
          If you have uninstalled the app, cannot log in, or prefer to submit a
          request online:
        </Text>
        <View style={styles.stepBox}>
          <Text style={styles.stepItem}>
            1. Send an email to our support desk:{" "}
            <Text style={styles.boldText}>{SUPPORT_EMAIL}</Text>
          </Text>
          <Text style={styles.stepItem}>
            2. Subject line: &quot;SettleUp - Account Deletion Request&quot;
          </Text>
          <Text style={styles.stepItem}>
            3. Body: Include your registered phone number (with country code) or
            the Google email associated with your account.
          </Text>
          <Text style={styles.stepItem}>
            4. We will verify and process your deletion request within 30 days
            and send a confirmation email.
          </Text>
        </View>

        <View style={styles.buttonWrapper}>
          <a
            href={MAILTO_HREF}
            style={{
              display: "inline-block",
              backgroundColor: "#6652A3",
              color: "#FFFFFF",
              textDecoration: "none",
              padding: "12px 24px",
              borderRadius: "12px",
              fontWeight: "700",
              fontSize: "14px",
              textAlign: "center",
            }}
          >
            Request deletion by email
          </a>
        </View>

        {/* Data Types */}
        <Text style={styles.sectionHeading}>What Data is Deleted</Text>
        <Text style={styles.body}>
          Upon account deletion, the following personal data is permanently
          erased:
        </Text>
        <Bullet text="Profile details: name, email address, avatar, timezone, currency preference, and discoverability setting." />
        <Bullet text="Authentication identifiers: registered phone association and linked Google identity." />
        <Bullet text="Sessions and notifications: refresh sessions, pending notification jobs, push token, and notification preferences." />
        <Bullet text="Personal-only financial data: transactions that are not shared with a group or another person, goals, tags, and related itemisation." />
        <Bullet text="Private tools and temporary data: analytics snapshots and access history, payment links, bank-SMS decision records, contact aliases you created, and block preferences." />

        <Text style={styles.sectionHeading}>What Data is Retained & Why</Text>
        <Text style={styles.body}>
          Certain records are retained for specific operational or legal
          integrity purposes:
        </Text>
        <Bullet text="Shared financial records: transactions, splits, settlements, balances, and group-change history involving other people are preserved so their records remain accurate. Your profile is replaced with the non-identifying label 'Deleted member'." />
        <Bullet text="Pseudonymous record key: a random internal identifier remains only where required to keep shared records connected. It no longer has a phone number, Google identity, email, name, or avatar attached." />
        <Bullet text="Deletion audit: a minimal ACCOUNT_DELETED event is retained for security and abuse prevention for up to 12 months." />

        <Text style={styles.sectionHeading}>Retention Period</Text>
        <Bullet text="In-app deletion: Takes effect immediately upon confirmation." />
        <Bullet text="Email deletion requests: Processed within 30 days of receipt." />
        <Bullet text="Shared records: retained until the remaining participant deletes the relevant transaction or group, or until the service is discontinued." />
        <Bullet text="Deletion audit: automatically deleted after 12 months." />
        <Bullet text="Backup archives: residual copies may remain in encrypted disaster-recovery backups for up to 90 days, after which they rotate out." />

        {/* Contact */}
        <Text style={styles.sectionHeading}>Contact Information</Text>
        <Text style={styles.body}>
          For any questions or additional inquiries regarding data privacy and
          account deletion, please contact:
        </Text>
        <Bullet text={`Developer: Utkarsh Pandey`} />
        <Bullet text={`App: SettleUp`} />
        <Bullet text={`Support Email: ${SUPPORT_EMAIL}`} />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          © {new Date().getFullYear()} SettleUp (Utkarsh Pandey). All rights
          reserved.
        </Text>
        <View style={styles.linksRow}>
          <Link href="/privacy" style={styles.navLink}>
            Privacy Policy
          </Link>
          <Text style={styles.footerText}>•</Text>
          <Link href="/terms" style={styles.navLink}>
            Terms & Conditions
          </Link>
          <Text style={styles.footerText}>•</Text>
          <Link href="/" style={styles.navLink}>
            Return to App
          </Link>
        </View>
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
    fontSize: 26,
    color: "#211D29",
    textAlign: "center",
    letterSpacing: -0.35,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6652A3",
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  subtitle: {
    fontSize: 13,
    color: "#716B7B",
    marginTop: 6,
    textAlign: "center",
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
    marginTop: 14,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: "#211D29",
    lineHeight: 22,
    marginBottom: 10,
  },
  stepBox: {
    backgroundColor: "#F8F7FA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#6652A3",
    gap: 6,
  },
  stepItem: {
    fontSize: 13.5,
    color: "#211D29",
    lineHeight: 20,
  },
  boldText: {
    fontWeight: "700",
    color: "#6652A3",
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
  authPanel: {
    backgroundColor: "#F8F7FA",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E1DDE7",
    marginBottom: 12,
  },
  successText: {
    color: "#33735F",
    fontWeight: "700",
    marginTop: 10,
  },
  errorText: {
    color: "#A73748",
    marginTop: 10,
  },
  buttonWrapper: {
    marginVertical: 14,
    alignItems: "flex-start",
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
  linksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  navLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6652A3",
    textDecorationLine: "underline",
  },
});
