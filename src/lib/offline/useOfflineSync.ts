import { useCallback, useEffect, useRef, useState } from "react";
import { syncPending } from "./sync";
import { getQueue } from "./store";
import { getRpcQueue, rpcBackoffDelayMs, rpcShouldAutoRetry, type QueuedRpc } from "./rpc-queue";
import { syncQueuedRpc } from "./rpc-sync";
import { toast } from "sonner";

export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [conflicts, setConflicts] = useState<QueuedRpc[]>([]);
  const [manuals, setManuals] = useState<QueuedRpc[]>([]);
  // منع تكرار تنبيهات العمليات الفاشلة: مفتاح = رقم العملية (rpc:<id>) أو رسالة الطابور الرئيسي (main:<msg>)
  const toastedFailures = useRef(new Set<string>());
  const lastAttemptedAt = useRef(new Map<string, number>());

  const update = useCallback(async () => {
    setOnline(navigator.onLine);
    const queue = await getRpcQueue();
    setPendingCount(getQueue().length + queue.length);
    setConflicts(queue.filter((item) => item.conflict));
    setManuals(queue.filter((item) => item.status === "manual"));
  }, []);

  function showErrorOnce(key: string, message: string) {
    if (toastedFailures.current.has(key)) return;
    toastedFailures.current.add(key);
    toast.error(message);
  }

  function clearFailures(remainingIds: string[]) {
    const ids = new Set(remainingIds);
    for (const key of [...toastedFailures.current]) {
      if (key.startsWith("rpc:") && !ids.has(key.slice("rpc:".length)))
        toastedFailures.current.delete(key);
    }
  }

  useEffect(() => {
    void update();
    const handleOnline = async () => {
      await update();
      const res = await syncPending();
      const rpcRes = await syncQueuedRpc();
      if ("errors" in res && res.errors.length > 0) {
        showErrorOnce(
          `main:${res.errors[0]}`,
          `تمت مزامنة ${res.synced} من البيانات المعلقة؛ بقي ${res.remaining}. ${res.errors[0]}`,
        );
      }
      rpcRes.failedIds.forEach((id, index) =>
        showErrorOnce(`rpc:${id}`, `تعذرت مزامنة بعض العمليات: ${rpcRes.errors[index]}`),
      );
      clearFailures((await getRpcQueue()).map((item) => item.id));
      setSyncError(rpcRes.errors[0] ?? ("errors" in res ? (res.errors[0] ?? "") : ""));
      setPendingCount(getQueue().length + rpcRes.remaining);
      await update();
    };
    window.addEventListener("offline", update);
    window.addEventListener("online", handleOnline);
    // شيك كل 10 ثواني لو فيه بيانات معلقة — مع تراجع تدريجي للعمليات المتأخرة
    const t = setInterval(async () => {
      if (!navigator.onLine) return;
      const queue = getQueue();
      const rpcQueue = await getRpcQueue();
      if (queue.length === 0 && rpcQueue.length === 0) return;
      const now = Date.now();
      // توقف المحاولة التلقائية بعد الحد الأقصى من الفشل، وانتظر backoff تدريجي بناءً على attempts
      const dueRpc = rpcQueue.filter((item) => {
        if (!rpcShouldAutoRetry(item.attempts)) return false;
        const last = lastAttemptedAt.current.get(item.id) ?? item.createdAt;
        return now - last >= rpcBackoffDelayMs(item.attempts);
      });
      for (const item of rpcQueue) lastAttemptedAt.current.set(item.id, now);
      const rpcRes =
        dueRpc.length > 0
          ? await syncQueuedRpc()
          : {
              synced: 0,
              remaining: rpcQueue.length,
              errors: [] as string[],
              failedIds: [] as string[],
            };
      rpcRes.failedIds.forEach((id, index) =>
        showErrorOnce(`rpc:${id}`, `تعذرت مزامنة بعض العمليات: ${rpcRes.errors[index]}`),
      );
      const remainingIds = (await getRpcQueue()).map((item) => item.id);
      clearFailures(remainingIds);
      if (queue.length > 0) {
        const res = await syncPending();
        if ("errors" in res && res.errors.length > 0) {
          showErrorOnce(
            `main:${res.errors[0]}`,
            `تعذرت مزامنة بعض البيانات المعلقة: ${res.errors[0]}`,
          );
          setSyncError(res.errors[0] ?? "");
        }
      }
      if (rpcRes.errors.length > 0) setSyncError(rpcRes.errors[0] ?? "");
      setPendingCount(getQueue().length + rpcRes.remaining);
      await update();
    }, 10000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", update);
      clearInterval(t);
    };
  }, [update]);

  return { online, pendingCount, syncError, conflicts, manuals, update };
}
