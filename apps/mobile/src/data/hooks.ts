import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { DEMO, useSession } from "./session";
import { syncGoalNotifications } from "../services/device";
import {
  API_URL,
  repository,
  readCachedDashboard,
  subscribeCachedDashboard,
  syncPendingMutations,
} from "./repository";
import { getTokenSession } from "./session";
import { syncWidgets } from "../../modules/home-widgets/client";
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

function queueAccountRefresh(
  query: ReturnType<typeof useQueryClient>,
  accountId: string,
) {
  const pending = refreshTimers.get(accountId);
  if (pending) clearTimeout(pending);
  refreshTimers.set(
    accountId,
    setTimeout(() => {
      refreshTimers.delete(accountId);
      void query.refetchQueries({
        queryKey: ["account", accountId],
        type: "active",
      });
    }, 350),
  );
}
export function useDashboard() {
  const id = useSession((s) => s.activeId);
  const query = useQueryClient();
  const result = useQuery({
    queryKey: ["account", id, "dashboard"],
    queryFn: () => repository.dashboard(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!id) return;
    return subscribeCachedDashboard((accountId, dashboard) => {
      if (accountId === id)
        query.setQueryData(["account", id, "dashboard"], dashboard);
    });
  }, [id, query]);
  useEffect(() => {
    if (!id) return;
    let current = true;
    readCachedDashboard(id).then((cached) => {
      if (
        current &&
        cached &&
        !query.getQueryData(["account", id, "dashboard"])
      )
        query.setQueryData(["account", id, "dashboard"], cached);
    });
    return () => {
      current = false;
    };
  }, [id, query]);
  useEffect(() => {
    if (!id || typeof WebSocket === "undefined") return;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    let attempts = 0;
    const connect = () => {
      if (stopped) return;
      const session = getTokenSession(id);
      if (!session) return;
      const endpoint = `${API_URL.replace(/^http/, "ws")}/realtime`;
      socket = new WebSocket(endpoint, ["settleup", session.accessToken]);
      socket.onopen = () => {
        attempts = 0;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
        }, 5 * 60_000);
      };
      socket.onmessage = (event) => {
        try {
          if (
            ["connected", "data_changed"].includes(
              JSON.parse(String(event.data)).type,
            )
          )
            void query.invalidateQueries({
              queryKey: ["account", id],
              refetchType: "active",
            });
        } catch {
          // Ignore malformed keepalive/provider messages.
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        if (heartbeat) clearInterval(heartbeat);
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5));
        retry = setTimeout(connect, delay);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      socket?.close();
    };
  }, [id, query]);
  useEffect(() => {
    if (result.data) {
      const sessionAccount = useSession
        .getState()
        .accounts.find((account) => account.id === result.data.account.id);
      if (
        sessionAccount &&
        (sessionAccount.name !== result.data.account.name ||
          sessionAccount.avatar !== result.data.account.avatar ||
          sessionAccount.currency !== result.data.account.currency)
      )
        void useSession.getState().updateAccount(result.data.account);
      syncGoalNotifications(result.data).catch(() => {});
      syncWidgets(result.data).catch(() => {});
    }
  }, [result.data]);
  useEffect(() => {
    if (!id) return;
    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const remaining = await syncPendingMutations(id);
        if (remaining === 0)
          await query.invalidateQueries({
            queryKey: ["account", id],
            refetchType: "active",
          });
      } catch {
        // The queue stays on-device and retries after connectivity returns.
      } finally {
        syncing = false;
      }
    };
    const timer = setInterval(() => void sync(), 15_000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [id, query]);
  return result;
}
export function useAction() {
  const id = useSession((s) => s.activeId);
  const query = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  return {
    busy,
    error,
    success,
    setError,
    async run(action: () => Promise<unknown>, message = "Saved successfully") {
      if (busy) return false;
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        const result = await action();
        const queued =
          !!result &&
          typeof result === "object" &&
          "queued" in result &&
          (result as { queued?: boolean }).queued === true;
        const feedback = queued
          ? "Saved on this phone. It will sync automatically when the server is available."
          : message;
        if (id) {
          const immediate = DEMO
            ? await repository.dashboard(id)
            : await readCachedDashboard(id);
          if (immediate)
            query.setQueryData(["account", id, "dashboard"], immediate);
          await query.invalidateQueries({
            queryKey: ["account", id],
            refetchType: "none",
          });
          queueAccountRefresh(query, id);
        }
        setSuccess(feedback);
        if (id && useSession.getState().activeId === id)
          useSession.setState({
            feedback: { id: Date.now(), accountId: id, message: feedback },
          });
        return true;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
