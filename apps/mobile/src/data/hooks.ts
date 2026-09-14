import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { syncGoalNotifications } from "../services/device";
import { repository } from "./repository";
import { syncWidgets } from "../../modules/home-widgets/client";
export function useDashboard() {
  const id = useSession((s) => s.activeId);
  const result = useQuery({
    queryKey: ["account", id, "dashboard"],
    queryFn: () => repository.dashboard(id!),
    enabled: !!id,
    staleTime: 15000,
  });
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
        await query.invalidateQueries({ queryKey: ["account", id] });
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
