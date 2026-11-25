import { useEffect, useState } from "react";
import { subscribeToSync, getSyncState, triggerSync } from "@/lib/offline/sync-manager";
import { getRpcQueue, rpcShouldAutoRetry, type QueuedRpc } from "./rpc-queue";
import { getQueue } from "./store";

export function useSyncManager() {
  const [state, setState] = useState(() => getSyncState());

  useEffect(() => {
    const unsubscribe = subscribeToSync(() => setState(getSyncState()));
    return unsubscribe;
  }, []);

  return state;
}

export function useOfflineQueueState() {
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<QueuedRpc[]>([]);
  const [manuals, setManuals] = useState<QueuedRpc[]>([]);
  const [online, setOnline] = useState(true);
  const [syncError, setSyncError] = useState("");

  const refresh = async () => {
    const rpcQueue = await getRpcQueue();
    const mainQueue = getQueue();
    setPendingCount(mainQueue.length + rpcQueue.length);
    setConflicts(rpcQueue.filter((item) => item.conflict));
    setManuals(rpcQueue.filter((item) => item.status === "manual"));
    setOnline(navigator.onLine);
  };

  useEffect(() => {
    void refresh();
    const handleOnline = async () => {
      setOnline(true);
      await triggerSync();
      await refresh();
    };
    const handleOffline = () => {
      setOnline(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const retryFailed = async () => {
    const rpcQueue = await getRpcQueue();
    const dueRpc = rpcQueue.filter(
      (item) => item.status !== "manual" && rpcShouldAutoRetry(item.attempts),
    );
    if (dueRpc.length > 0) {
      await triggerSync();
    }
    await refresh();
  };

  return { online, pendingCount, conflicts, manuals, syncError, refresh, retryFailed };
}
