import React from "react";
import { View, Platform } from "react-native";
import { useRouter } from "expo-router";
import { YStack } from "tamagui";
import {
  Label,
  Heading,
  Card,
  Button,
  useColors,
  Mascot,
  Brand,
} from "../src/components/ui";

export default function NotFoundScreen() {
  const c = useColors();
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <YStack
        alignItems="center"
        gap={8}
        style={{ maxWidth: 400, width: "100%" }}
      >
        {/* Pip in confused/help mood */}
        <Mascot size={160} mood="help" />

        <Card
          style={{
            padding: 28,
            borderRadius: 24,
            width: "100%",
            alignItems: "center",
          }}
        >
          {/* Speech bubble */}
          <View
            style={{
              backgroundColor: c.soft,
              borderRadius: 16,
              paddingHorizontal: 18,
              paddingVertical: 12,
              marginBottom: 20,
              borderLeftWidth: 3,
              borderLeftColor: c.accent,
              width: "100%",
            }}
          >
            <Label
              bold
              size={14}
              color={c.accent}
              lineHeight={20}
              style={{ textAlign: "center" }}
            >
              Hmm, I looked everywhere but couldn't find this page! 🤔
            </Label>
          </View>

          {/* 404 */}
          <Label
            bold
            size={72}
            color={c.accent}
            style={{ letterSpacing: -3, lineHeight: 80, opacity: 0.2 }}
          >
            404
          </Label>

          <Heading size={22} textAlign="center">
            Page not found
          </Heading>

          <Label
            size={14}
            color={c.muted}
            lineHeight={22}
            style={{
              textAlign: "center",
              marginBottom: 24,
              maxWidth: 280,
            }}
          >
            This page doesn't exist, was moved, or maybe the link was wrong.
          </Label>

          <Button
            icon="home"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
          >
            Go Home
          </Button>

          {/* Privacy link */}
          <Label
            size={13}
            color={c.accent}
            bold
            style={{ marginTop: 16, opacity: 0.7 }}
            onPress={() => router.push("/privacy")}
          >
            Privacy Policy
          </Label>
        </Card>

        {/* Brand footer */}
        <View style={{ marginTop: 20 }}>
          <Brand compact />
        </View>
      </YStack>
    </View>
  );
}
