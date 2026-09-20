import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { syncGoalNotifications } from "../services/device";
import { repository, readCachedDashboard } from "./repository";
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
    if (result.data) {
      syncGoalNotifications(result.data).catch(() => {});
      syncWidgets(result.data).catch(() => {});
    }
  }, [result.data]);
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
        await action();
        if (id) {
          await query.invalidateQueries({
            queryKey: ["account", id],
            refetchType: "none",
          });
          queueAccountRefresh(query, id);
        }
        setSuccess(message);
        if (id && useSession.getState().activeId === id)
          useSession.setState({
            feedback: { id: Date.now(), accountId: id, message },
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
