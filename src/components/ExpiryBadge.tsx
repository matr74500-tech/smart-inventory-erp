import { expiryStatus } from "@/lib/inventory-utils";

const STYLE = {
  expired: { cls: "bg-destructive text-destructive-foreground", label: "منتهي" },
  soon: { cls: "bg-warning text-warning-foreground", label: "ينتهي قريباً" },
  ok: { cls: "bg-success text-success-foreground", label: "سليم" },
} as const;

export function ExpiryBadge({ date }: { date: string | null }) {
  const s = expiryStatus(date);
  if (s === "none") return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[s].cls}`}>{STYLE[s].label} · <span dir="ltr">{date}</span></span>;
}
