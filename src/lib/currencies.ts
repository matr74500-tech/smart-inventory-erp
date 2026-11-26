import type { Tables } from "@/integrations/supabase/types";

export type ExchangeRate = Tables<"exchange_rates">;

export function findActiveCurrency(
  currencies: Tables<"currencies">[],
  code: string,
): Tables<"currencies"> | null {
  return currencies.find((row) => row.code === code && row.active) ?? null;
}

export function getLatestRate(
  rates: ExchangeRate[],
  code: string,
  now: Date = new Date(),
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): ExchangeRate | null {
  const eligible = rates
    .filter((r) => r.currency_code === code)
    .filter((r) => now.getTime() - new Date(r.effective_at ?? r.created_at).getTime() <= maxAgeMs)
    .sort(
      (a, b) =>
        new Date(b.effective_at ?? b.created_at).getTime() -
        new Date(a.effective_at ?? a.created_at).getTime(),
    );
  return (
    eligible[0] ??
    rates.filter((r) => r.currency_code === code).sort((a, b) => b.id.localeCompare(a.id))[0] ??
    null
  );
}
