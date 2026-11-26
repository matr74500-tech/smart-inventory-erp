import { useOfflineSync } from "@/lib/offline/useOfflineSync";
import {
  clearRpcConflict,
  markRpcManual,
  removeRpc,
  type QueuedRpc,
} from "@/lib/offline/rpc-queue";
import { syncQueuedRpc } from "@/lib/offline/rpc-sync";
import { Button } from "@/components/ui/button";

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ConflictCard({ item, refresh }: { item: QueuedRpc; refresh: () => Promise<void> }) {
  const conflict = item.conflict;
  if (!conflict) return null;
  const fields = ["name", "price", "cost", "unit", "factor", "supplier"] as const;
  const rows = fields.filter((field) => field in conflict.local || field in conflict.server);
  return (
    <div className="w-full rounded-lg border border-input bg-card p-3 text-sm space-y-2">
      <div className="font-semibold">
        {fmt(
          (conflict.server as Record<string, unknown>)["name"] ??
            (conflict.local as Record<string, unknown>)["name"] ??
            item.name,
        )}
      </div>
      {rows.length > 0 && (
        <div className="grid gap-1">
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <span />
            <span>المحلي</span>
            <span>الخادم</span>
          </div>
          {rows.map((field) => (
            <div key={field} className="grid grid-cols-3 gap-2">
              <span className="truncate">{field}</span>
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs break-all" dir="ltr">
                {fmt(conflict.local[field])}
              </span>
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs break-all" dir="ltr">
                {fmt(conflict.server[field])}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            void (async () => {
              await clearRpcConflict(item.id);
              await syncQueuedRpc({ forceIds: [item.id] });
              void refresh();
            })()
          }
        >
          اعتماد تعديدي
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void (async () => {
              await removeRpc(item.id);
              void refresh();
            })()
          }
        >
          اعتماد الخادم
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void (async () => {
              await markRpcManual(item.id);
              void refresh();
            })()
          }
        >
          تعديد يدويًا
        </Button>
      </div>
    </div>
  );
}

export function OfflineBanner() {
  const { online, pendingCount, syncError, conflicts, manuals, update } = useOfflineSync();
  const hasConflicts = conflicts.length > 0;
  const hasManuals = manuals.length > 0;
  if (online && !hasConflicts && !hasManuals && pendingCount === 0 && !syncError) return null;
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
        ? `أنت الآن دون اتصال؛ العمليات المحفوظة محليًا: ${pendingCount} — ستتم مزامنتها عند عودة الإنترنت.`
        : pendingCount > 0
          ? syncError
            ? `تعذرت مزامنة الكميات؛ يمكن الإعادة تلقائيًا (${pendingCount} عملية). ${syncError}`
            : `جارٍ محاولة إعادة المزامنة: ${pendingCount} عملية بانتظار التنفيذ`
          : syncError
            ? `تعذرت مزامنة بعض العمليات. ${syncError}`
            : "جميع العمليات تمت مزامنتها"}
      {hasConflicts && (
        <div className="mt-2 flex flex-col items-center gap-2 text-sm">
          <div className="font-semibold">وجود تعارض أحدث بين تعديلك وتعديلات الآخرين — اختر:</div>
          {conflicts.map((item) => (
            <ConflictCard key={item.id} item={item} refresh={update} />
          ))}
        </div>
      )}
      {hasManuals && (
        <div className="mt-2 text-sm font-semibold">
          عدد العمليات التي تحتاج تعديلًا يدويًا: {manuals.length}
        </div>
      )}
    </div>
  );
}
