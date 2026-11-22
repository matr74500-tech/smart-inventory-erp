import { useOfflineSync } from "@/lib/offline/useOfflineSync";

export function OfflineBanner() {
  const { online, pendingCount, syncError } = useOfflineSync();
  if (online && pendingCount === 0 && !syncError) return null;
  return (
    <div
      style={{
        background: online && !syncError ? "#f59e0b" : "#b91c1c",
        color: "white",
        textAlign: "center",
        padding: "6px",
        fontSize: "13px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {!online
        ? `أنت الآن دون اتصال؛ العمليات المحفوظة محليًا: ${pendingCount}`
        : syncError
          ? `تعذرت مزامنة بعض العمليات؛ ما زالت محفوظة على هذا الجهاز (${pendingCount}). ${syncError}`
          : `توجد ${pendingCount} عملية بانتظار المزامنة`}
    </div>
  );
}
