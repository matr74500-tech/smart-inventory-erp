import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, Trash2, Clock } from "lucide-react";
import {
  getRpcQueue,
  removeRpc,
  enqueueRpc,
  rpcBackoffDelayMs,
  rpcShouldAutoRetry,
  type QueuedRpc,
} from "@/lib/offline/rpc-queue";
import { toast } from "sonner";

export function OfflineQueue() {
  const [queue, setQueue] = useState<QueuedRpc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await getRpcQueue();
        if (active) setQueue(items);
      } catch {
        if (active) setQueue([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const refreshQueue = async () => {
    try {
      const items = await getRpcQueue();
      setQueue(items);
    } catch {
      // ignore
    }
  };

  const retry = async (item: QueuedRpc) => {
    try {
      await enqueueRpc({
        id: item.id,
        name: item.name,
        args: item.args,
      });
      toast.success(`تم إعادة جدولة "${item.name}"`);
      await refreshQueue();
    } catch (error) {
      toast.error(`فشل إعادة الجدولة: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const remove = async (id: string) => {
    await removeRpc(id);
    toast.success("تم حذف العملية من الطابور");
    await refreshQueue();
  };

  if (loading || queue.length === 0) return <></>;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <div className="bg-card border border-border rounded-xl shadow-xl p-4 animate-in fade-in slide-in-from-right-2 duration-300">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-500" />
            <span className="font-semibold text-sm">عمليات معلمة (أوفلاين)</span>
          </div>
          <Badge variant="destructive" className="text-xs">
            {queue.length}
          </Badge>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {queue.map((item) => {
            const canRetry = rpcShouldAutoRetry(item.attempts ?? 0);
            const backoff = rpcBackoffDelayMs(item.attempts ?? 0);
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 p-2 rounded border bg-amber-50/50 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="size-3 text-amber-600" />
                    <span className="font-medium truncate">{item.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    محاولات: {item.attempts ?? 0} ·
                    {canRetry
                      ? `إعادة المحاولة خلال ${Math.round(backoff / 1000)}s`
                      : "وصل الحد الأقصى"}
                  </div>
                  {item.conflict && (
                    <div className="text-[10px] text-red-600 font-medium mt-0.5">
                      تحذير: تعارض مع البيانات على الخادم
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {canRetry && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => retry(item)}
                      className="h-7 w-7 p-0"
                      title="إعادة المحاولة"
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => remove(item.id)}
                    className="h-7 w-7 p-0"
                    title="حذف العملية"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={refreshQueue} className="w-full">
            تحديث الطابور
          </Button>
        </div>
      </div>
    </div>
  );
}
