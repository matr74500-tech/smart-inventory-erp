import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SystemTimezone = Tables<"system_timezone">;

export async function loadSystemTimezone(): Promise<SystemTimezone | null> {
  const { data, error } = await supabase.from("system_timezone").select("*").limit(1).maybeSingle();
  return error ? null : data;
}

type Parts = Record<string, string>;
function partsOf(value: Date, timezone?: string): Parts {
  return Object.fromEntries(
    new Intl.DateTimeFormat("ar-EG", {
      timeZone: timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .map((p) => [p.type, p.value]),
  );
}

function formatDateValue(p: Parts, format: string | null): string {
  const day = p["day"] ?? "00";
  const month = p["month"] ?? "00";
  const year = p["year"] ?? "0000";
  if (format === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (format === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

function partsTime(value: Date, use24h = true): Parts {
  return Object.fromEntries(
    new Intl.DateTimeFormat("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: !use24h,
    })
      .formatToParts(value)
      .map((p) => [p.type, p.value]),
  );
}

export function formatSystemDate(
  value: Date | string | null,
  setting: SystemTimezone | null,
  mode: "date" | "datetime" = "datetime",
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const d = partsOf(date, setting?.timezone || undefined);
  if (mode === "date") return formatDateValue(d, setting?.date_format ?? "DD/MM/YYYY");
  const t = partsTime(date, setting?.use_24h_format !== false);
  return `${formatDateValue(d, setting?.date_format ?? "DD/MM/YYYY")} ${t["hour"]}:${t["minute"]}`;
}
