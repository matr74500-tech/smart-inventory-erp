import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Package, Search } from "lucide-react";
import { useInventory } from "@/hooks/use-inventory";
import { matchesSearch } from "@/lib/arabic";
import { findByCode } from "@/lib/inventory-utils";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Quick product lookup by name, code or barcode, available from every screen. */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { canField } = useAuth();
  const { products, warehouses, qty } = useInventory();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const list = useMemo(() => {
    if (!q.trim()) return [];
    const exact = findByCode(products, q);
    return exact
      ? [exact]
      : products
          .filter((p) =>
            matchesSearch([p.name, p.code, p.barcode, p.custom_barcode, p.model_no], q),
          )
          .slice(0, 20);
  }, [products, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl p-4 top-[10%] translate-y-0">
        <DialogTitle className="sr-only">بحث سريع</DialogTitle>
        <div className="flex gap-2 ml-6">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pr-10 h-11"
              placeholder="اسم، كود، أو باركود…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <BarcodeScanner onDetected={setQ} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y">
          {list.map((p) => (
            <button
              key={p.id}
              className="w-full flex items-center gap-3 p-2.5 text-right hover:bg-accent rounded-md"
              onClick={() => {
                onOpenChange(false);
                navigate({ to: "/inventory", search: { q: p.code ?? p.name } });
              }}
            >
              {p.image_url ? (
                <img src={p.image_url} alt="" className="size-10 rounded object-cover" />
              ) : (
                <Package className="size-10 p-2 text-muted-foreground" />
              )}
              <div className="flex-1">
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {canField("quantity") &&
                    warehouses.map((w) => `${w.name}: ${qty(p.id, w.id)}`).join(" · ")}
                </div>
              </div>
              {canField("price") && <div className="text-sm font-bold">{Number(p.price)}</div>}
            </button>
          ))}
          {q.trim() && !list.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
