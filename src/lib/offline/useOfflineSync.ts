import { useEffect, useState } from "react";
import { syncPending } from "./sync";
import { getQueue } from "./store";
import { getRpcQueue } from "./rpc-queue";
import { syncQueuedRpc } from "./rpc-sync";
import { toast } from "sonner";

export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    const update = async () => {
      setOnline(navigator.onLine);
      setPendingCount(getQueue().length + (await getRpcQueue()).length);
    };
    void update();
    const handleOnline = async () => {
      await update();
      const res = await syncPending();
      const rpcRes = await syncQueuedRpc();
      if ("errors" in res && res.errors.length > 0) {
        toast.error(
          `تمت مزامنة ${res.synced} من البيانات المعلقة؛ بقي ${res.remaining}. ${res.errors[0]}`,
        );
      }
      if (rpcRes.errors.length > 0) toast.error(`تعذرت مزامنة بعض العمليات: ${rpcRes.errors[0]}`);
      setSyncError(rpcRes.errors[0] ?? ("errors" in res ? (res.errors[0] ?? "") : ""));
      setPendingCount(getQueue().length + rpcRes.remaining);
    };
    window.addEventListener("offline", update);
    window.addEventListener("online", handleOnline);
    // شيك كل 10 ثواني لو فيه بيانات معلقة
    const t = setInterval(async () => {
      if (navigator.onLine && (getQueue().length > 0 || (await getRpcQueue()).length > 0)) {
        const res = await syncPending();
        const rpcRes = await syncQueuedRpc();
        if ("errors" in res && res.errors.length > 0) {
          toast.error(`تعذرت مزامنة بعض البيانات المعلقة: ${res.errors[0]}`);
        }
        if (rpcRes.errors.length > 0) toast.error(`تعذرت مزامنة بعض العمليات: ${rpcRes.errors[0]}`);
        setSyncError(rpcRes.errors[0] ?? ("errors" in res ? (res.errors[0] ?? "") : ""));
        setPendingCount(getQueue().length + rpcRes.remaining);
      }
    }, 10000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", update);
      clearInterval(t);
    };
  }, []);

  return { online, pendingCount, syncError };
}
