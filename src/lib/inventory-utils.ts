import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;

export const PRICE_TIERS = [
  { key: "price_special", label: "سعر خاص" },
  { key: "price", label: "تجزئة" },
  { key: "price_half", label: "نصف جملة" },
  { key: "price_wholesale", label: "جملة" },
  { key: "price_bulk", label: "جملة الجملة" },
] as const;
export type PriceKey = (typeof PRICE_TIERS)[number]["key"];

/** Computes the EAN-13 check digit for 12 digits and returns the full 13-digit code. */
export function ean13(d12: string): string {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 === 1 ? 3 : 1);
  return d12 + ((10 - (s % 10)) % 10);
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13(code.slice(0, 12)) === code;
}

/** Finds a product by any of its codes (factory barcode, generated barcode, item code). */
export function findByCode(products: Product[], code: string): Product | undefined {
  const c = code.trim();
  if (!c) return undefined;
  return products.find((p) => p.barcode === c || p.custom_barcode === c || p.code === c);
}

/** Converts a quantity entered in a unit to base units. */
export function toBaseQty(qty: number, unit: "base" | "major", packCapacity: number): number {
  return unit === "major" ? qty * (packCapacity > 0 ? packCapacity : 1) : qty;
}

/** Applies a percentage change to a price and rounds to 2 decimals. */
export function adjustPrice(price: number, percent: number): number {
  return Math.round(price * (1 + percent / 100) * 100) / 100;
}

/** Resizes an image file to a small JPEG data URL so it can be stored with the product. */
export function fileToDataUrl(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Reads an Excel/CSV file into rows of header → value. */
export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer());
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "" }) : [];
}

export async function writeSheet(rows: Record<string, unknown>[], filename: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

export const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
export const str = (v: unknown) => String(v ?? "").trim();

export type ExpiryStatus = "expired" | "soon" | "ok" | "none";
/** Expiry colour rule: expired = red, within 30 days = orange, otherwise green. */
export function expiryStatus(date: string | null | undefined, now = new Date()): ExpiryStatus {
  if (!date) return "none";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.round((new Date(y!, m! - 1, d!).getTime() - today) / 864e5);
  return days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
}

/** Stocktake difference: positive = surplus, negative = shortage. */
export function countDiff(book: number, actual: number) {
  const diff = actual - book;
  return { diff, label: diff > 0 ? "زيادة" : diff < 0 ? "نقص" : "مطابق" } as const;
}
