import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter, Link } from "expo-router";

export default function NotFoundWeb() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.wrapper}>
        {/* Pip Mascot (Confused/Help mood) */}
        <View style={styles.mascotBox}>
          <svg width="160" height="160" viewBox="0 0 200 200">
            <ellipse cx="109" cy="175" rx="60" ry="10" fill="#D9CEE8" opacity="0.55" />
            <g transform="rotate(-9)" transform-origin="100 100">
              <path d="M55 140 41 160M142 140l14 23" stroke="#502A9C" strokeWidth="12" strokeLinecap="round" />
              <path d="M50 105 27 105M154 97l19 8" stroke="#7B51D0" strokeWidth="12" strokeLinecap="round" />
              <rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4" />
              <path d="M58 60q30-24 80-4" fill="none" stroke="#C1A0F0" strokeWidth="8" strokeLinecap="round" />
              <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
              <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
              <circle cx="85" cy="91" r="2" fill="#FFF" />
              <circle cx="127" cy="91" r="2" fill="#FFF" />
              <path d="M92 117q12-5 24 0" stroke="#38255E" strokeWidth="4" strokeLinecap="round" fill="none" />
              <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
              <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
              <g transform="rotate(10)" transform-origin="111 31">
                <rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A" />
                <path d="m104 26 5 7 10-8" stroke="#9A651E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </g>
            <path d="m174 32 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#B090DE" />
            <circle cx="28" cy="44" r="4" fill="#F3BA69" />
          </svg>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>
              Hmm, I looked everywhere but couldn&apos;t find this page! 🤔
            </Text>
          </View>

          <Text style={styles.errorCode}>404</Text>
          <Text style={styles.title}>Page not found</Text>
          <Text style={styles.message}>
            This page doesn&apos;t exist, was moved, or maybe the link was wrong.
          </Text>

          <Pressable
            style={({ hovered }: any) => [
              styles.button,
              hovered && styles.buttonHovered,
            ]}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>
            <Text style={styles.buttonText}>Go Home</Text>
          </Pressable>

          <Link href="/privacy" style={styles.privacyLink}>
            Privacy Policy
          </Link>
        </View>

        {/* SettleUp Mini Brand */}
        <View style={styles.brandRow}>
          <svg width="28" height="28" viewBox="36 8 134 150">
            <g transform="rotate(0)" transform-origin="100 100">
              <rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4" />
              <path d="M58 60q30-24 80-4" fill="none" stroke="#C1A0F0" strokeWidth="8" strokeLinecap="round" />
              <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
              <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
              <circle cx="85" cy="91" r="2" fill="#FFF" />
              <circle cx="127" cy="91" r="2" fill="#FFF" />
              <path d="M92 113q12 15 24-1" stroke="#38255E" strokeWidth="4" strokeLinecap="round" fill="none" />
              <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
              <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
              <g transform="rotate(10)" transform-origin="111 31">
                <rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A" />
                <path d="m104 26 5 7 10-8" stroke="#9A651E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </g>
          </svg>
          <Text style={styles.brandTitle}>
            settle<Text style={styles.brandAccent}>up.</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F4F7",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    minHeight: "100vh" as any,
  },
  wrapper: {
    maxWidth: 420,
    width: "100%",
    alignItems: "center",
    gap: 16,
  },
  mascotBox: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    alignItems: "center",
    shadowColor: "rgba(0,0,0,0.06)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  bubble: {
    backgroundColor: "#F0ECF8",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#6652A3",
    width: "100%",
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6652A3",
    textAlign: "center",
  },
  errorCode: {
    fontSize: 72,
    fontWeight: "800",
    color: "#6652A3",
    opacity: 0.18,
    letterSpacing: -3,
    lineHeight: 80,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#211D29",
    textAlign: "center",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    color: "#716B7B",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
    marginBottom: 24,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#6652A3",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    minHeight: 48,
    width: "100%",
    cursor: "pointer" as any,
  },
  buttonHovered: {
    backgroundColor: "#554288",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  privacyLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6652A3",
    marginTop: 16,
    opacity: 0.75,
    textDecorationLine: "underline",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#211D29",
    letterSpacing: -0.5,
  },
  brandAccent: {
    color: "#6652A3",
  },
});
