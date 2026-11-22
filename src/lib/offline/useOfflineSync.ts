import { useEffect, useState } from "react";
import { syncPending } from "./sync";
import { getQueue } from "./store";
import { toast } from "sonner";

export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setPendingCount(getQueue().length);
    };
    update();
    const handleOnline = async () => {
      update();
      const res = await syncPending();
      if ("errors" in res && res.errors.length > 0) {
        toast.error(
          `تمت مزامنة ${res.synced} من البيانات المعلقة؛ بقي ${res.remaining}. ${res.errors[0]}`,
        );
      }
      setPendingCount(getQueue().length);
    };
    window.addEventListener("offline", update);
    window.addEventListener("online", handleOnline);
    // شيك كل 10 ثواني لو فيه بيانات معلقة
    const t = setInterval(async () => {
      if (navigator.onLine && getQueue().length > 0) {
        const res = await syncPending();
        if ("errors" in res && res.errors.length > 0) {
          toast.error(`تعذرت مزامنة بعض البيانات المعلقة: ${res.errors[0]}`);
        }
        setPendingCount(getQueue().length);
      }
    }, 10000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", update);
      clearInterval(t);
    };
  }, []);

  return { online, pendingCount };
}
