import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { YStack } from "tamagui";
import type { Dashboard } from "@settleup/contracts";
import { Shell } from "../components/Shell";
import {
  Button,
  Card,
  Heading,
  Label,
  Notice,
  Skeleton,
} from "../components/ui";
import { request } from "../data/repository";
import { useSession } from "../data/session";

export function JoinGroupScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const query = useQueryClient();
  const accountId = useSession((state) => state.activeId);
  const ready = useSession((state) => state.ready);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setError(""), [token]);

  const join = async () => {
    if (!accountId || !/^[A-Za-z0-9_-]{24}$/.test(token ?? "")) return;
    setJoining(true);
    setError("");
    try {
      const result = await request<{ ledgerId: string }>(
        `/group-invites/${token}/join`,
        { accountId, body: {} },
      );
      // The invite mutation changes group membership outside the normal
      // repository actions, so replace the dashboard cache before navigating.
      // This makes the newly joined group visible immediately.
      try {
        const dashboard = await request<Dashboard>("/dashboard", {
          accountId,
        });
        query.setQueryData(["account", accountId, "dashboard"], dashboard);
      } catch {
        await query.invalidateQueries({
          queryKey: ["account", accountId, "dashboard"],
          refetchType: "active",
        });
      }
      router.replace(`/group/${result.ledgerId}` as never);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not join this group.",
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <Shell>
      <YStack gap={18} maxWidth={520} width="100%" alignSelf="center">
        <Heading>Join a group</Heading>
        {Platform.OS === "web" ? (
          <Notice>
            Open this invite on your phone with SettleUp installed.
          </Notice>
        ) : !ready ? (
          <Skeleton height={180} />
        ) : !accountId ? (
          <Card>
            <YStack gap={14}>
              <Label>
                Sign in, then open this invite again to join the group.
              </Label>
              <Button onPress={() => router.push("/auth")}>Sign in</Button>
            </YStack>
          </Card>
        ) : !/^[A-Za-z0-9_-]{24}$/.test(token ?? "") ? (
          <Notice error>This group invite is incomplete.</Notice>
        ) : (
          <Card>
            <YStack gap={14}>
              <Label>
                This link lets your signed-in SettleUp account join the group.
              </Label>
              <Button loading={joining} disabled={joining} onPress={join}>
                Join group
              </Button>
            </YStack>
          </Card>
        )}
        {!!error && <Notice error>{error}</Notice>}
      </YStack>
    </Shell>
  );
}
