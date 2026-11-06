import { useEffect, useState } from "react";
import { syncPending } from "./sync";
import { getQueue } from "./store";

export function useOfflineSync() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setPendingCount(getQueue().length);
    };
    update();
    window.addEventListener("online", async () => {
      update();
      const res = await syncPending();
      console.log("synced", res);
      setPendingCount(getQueue().length);
    });
    window.addEventListener("offline", update);
    // شيك كل 10 ثواني لو فيه بيانات معلقة
    const t = setInterval(async () => {
      if (navigator.onLine && getQueue().length > 0) {
        await syncPending();
        setPendingCount(getQueue().length);
      }
    }, 10000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(t);
    };
  }, []);

  return { online, pendingCount };
}
