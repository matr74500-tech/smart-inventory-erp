import { useOfflineSync } from "@/lib/offline/useOfflineSync";

export function OfflineBanner() {
  const { online, pendingCount } = useOfflineSync();
  if (online && pendingCount === 0) return null;
  return (
    <div style={{
      background: online ? "#f59e0b" : "#ef4444",
      color: "white", textAlign: "center",
      padding: "6px", fontSize: "13px",
      position: "sticky", top: 0, zIndex: 50
    }}>
      {!online ? "انت الآن بدون انترنت - سيتم حفظ البيانات محليا" : `تمت المزامنة - بقي ${pendingCount} عنصر معلق`}
      {pendingCount > 0 ? ` | معلق: ${pendingCount}` : ""}
    </div>
  );
}
