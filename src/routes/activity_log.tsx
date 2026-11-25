import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Filter, User, Activity, Clock, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/activity_log")({
  head: () => ({
    meta: [
      { title: "سجل تحركات النظام | نظام المخزون الذكي" },
      {
        name: "description",
        content: "توثيق العمليات والتعديلات والحركات المهمة مع المستخدم والوقت والتفاصيل.",
      },
    ],
  }),
  component: ActivityLogPage,
});

type ActivityLog = Tables<"system_activity_log">;

function ActivityLogPage() {
  const { canAction, can } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [search, setSearch] = useState("");

  const loadLogs = useCallback(async () => {
    let query = supabase
      .from("system_activity_log")
      .select("*")
      .order("created_at", { ascending: false });

    if (filterUser !== "all") {
      query = query.eq("user_id", filterUser);
    }
    if (filterAction !== "all") {
      query = query.ilike("action", `%${filterAction}%`);
    }
    if (filterDateFrom) {
      query = query.gte("created_at", filterDateFrom);
    }
    if (filterDateTo) {
      query = query.lte("created_at", filterDateTo);
    }

    const { data, error } = await query;
    if (!error) setLogs(data ?? []);
    setLoading(false);
  }, [filterUser, filterAction, filterDateFrom, filterDateTo]);

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username")
      .order("username");
    if (!error) setUsers(data ?? []);
  }, []);

  useEffect(() => {
    void loadLogs();
    void loadUsers();
    const channel = supabase
      .channel("system-activity-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_activity_log" },
        () => void loadLogs(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (filterUser !== "all" && log.user_id !== filterUser) return false;
      if (filterAction !== "all" && !log.action.toLowerCase().includes(filterAction.toLowerCase()))
        return false;
      if (filterDateFrom && log.created_at < filterDateFrom) return false;
      if (filterDateTo && log.created_at > filterDateTo) return false;
      if (term) {
        const hay =
          `${log.action} ${log.entity_type ?? ""} ${log.entity_id ?? ""} ${log.username ?? ""} ${JSON.stringify(log.details ?? {})}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [logs, filterUser, filterAction, filterDateFrom, filterDateTo, search]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.username])), [users]);

  const fmtDate = (val: string | null) => {
    if (!val) return "—";
    try {
      return new Date(val).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return val;
    }
  };

  const actionLabels: Record<string, string> = {
    record_expense: "تسجيل مصروف",
    save_sales_representative: "حفظ مندوب",
    calculate_rep_commission: "حساب عمولة",
    pay_rep_commission: "دفع عمولة",
    set_product_free_price: "تحديد سعر حر",
    log_system_activity: "تسجيل نشاط نظام",
  };

  return (
    <AppShell title="سجل تحركات النظام" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">سجل تحركات النظام</h2>
            <p className="text-sm text-muted-foreground">
              توثيق العمليات والتعديلات والحركات المهمة مع المستخدم والوقت والتفاصيل.
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => void loadLogs()}>
            <RotateCcw className="size-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="size-4" /> تصفية وبحث
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>المستخدم</Label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger>
                  <SelectValue placeholder="كل المستخدمين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>نوع العملية</Label>
              <Input
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                placeholder="مثال: مصروف، عمولة، سعر"
              />
            </div>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              placeholder="من تاريخ"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              placeholder="إلى تاريخ"
            />
          </div>
          <div className="space-y-1">
            <Label>بحث في التفاصيل</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في الإجراء، الكيان، التفاصيل…"
            />
          </div>
        </div>

        {/* Logs list */}
        <div className="rounded-xl bg-card shadow-card">
          <div className="border-b p-4">
            <h2 className="font-bold">سجل العمليات</h2>
            <p className="text-sm text-muted-foreground">{filteredLogs.length} عملية مسجلة</p>
          </div>
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">جارٍ التحميل…</p>
          ) : filteredLogs.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">لا توجد عمليات مسجلة.</p>
          ) : (
            <div className="divide-y">
              {filteredLogs.map((log) => (
                <>
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                  >
                    <div className="flex-1 min-w-64">
                      <div className="font-medium">{actionLabels[log.action] ?? log.action}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.username ?? "مستخدم غير معروف"} ·
                        {log.entity_type ? `الكيان: ${log.entity_type}` : ""} ·
                        {log.entity_id ? `المعرف: ${String(log.entity_id).slice(0, 8)}…` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(log.created_at)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const details = JSON.stringify(log.details ?? {}, null, 2);
                          navigator.clipboard.writeText(details);
                          toast.error("تم نسخ التفاصيل");
                        }}
                        aria-label="نسخ التفاصيل"
                      >
                        <Activity className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="border-t p-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>التفاصيل:</span>
                      <pre className="whitespace-pre-wrap break-all text-left dir-ltr mt-1">
                        {JSON.stringify(log.details ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
