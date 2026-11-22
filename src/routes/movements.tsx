import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, User, Calendar, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getMovements, type MovementLogEntry } from "@/lib/inventory-utils";

export const Route = createFileRoute("/movements")({
  head: () => ({
    meta: [
      { title: "سجل حركات الأصناف التدقيقي | نظام المخزون الذكي" },
      {
        name: "description",
        content: "سجل تفصيلي لجميع الحركات المخزنية مع تفاصيل المستخدم والوقت والسبب.",
      },
    ],
  }),
  component: MovementsPage,
});

function MovementsPage() {
  const [movements, setMovements] = useState<MovementLogEntry[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    try {
      const items = getMovements();
      setMovements(Array.isArray(items) ? items.slice(-200).reverse() : []);
    } catch {
      setHasError(true);
      setMovements([]);
    }
  }, []);

  return (
    <AppShell title="سجل حركة الأصناف والتدقيق">
      <div className="space-y-3">
        <div className="rounded-xl bg-card shadow-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />{" "}
            <span className="font-bold">سجل الحركات المخزنية المعتمد</span>
          </div>
          <div className="text-xs text-muted-foreground">عرض آخر {movements.length} حركة مسجلة</div>
        </div>

        {hasError && (
          <div className="rounded-xl bg-destructive/10 text-destructive p-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="size-5" /> حدث خطأ أثناء استرداد بعض السجلات محلياً، يتم عرض
            البيانات المتاحة.
          </div>
        )}

        <div className="rounded-xl bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-right">نوع الحركة</th>
                <th className="p-3 text-right">معرف الصنف / الوصف</th>
                <th className="p-3 text-right">الكمية</th>
                <th className="p-3 text-right">المستخدم</th>
                <th className="p-3 text-right">التاريخ والوقت</th>
                <th className="p-3 text-right">السبب / الملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((m, idx) => {
                let formattedDate = "—";
                if (m.at) {
                  const date = new Date(m.at);
                  if (!Number.isNaN(date.getTime())) formattedDate = date.toLocaleString("ar");
                }
                return (
                  <tr key={idx} className="hover:bg-muted/50">
                    <td className="p-3 font-semibold">
                      <span className="px-2 py-1 rounded bg-primary/10 text-primary">
                        {m?.type || "حركة"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{m?.productId || "—"}</td>
                    <td className="p-3 font-bold">{m?.qty ?? 0}</td>
                    <td className="p-3 flex items-center gap-1.5">
                      <User className="size-4 text-muted-foreground" /> {m?.user || "النظام"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-3.5" /> {formattedDate}
                    </td>
                    <td className="p-3 text-muted-foreground">{m?.note || "—"}</td>
                  </tr>
                );
              })}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    لا توجد حركات مسجلة في السجل بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
