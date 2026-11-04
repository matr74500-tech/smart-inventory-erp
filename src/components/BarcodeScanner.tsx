import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`scanner-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!open) return;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;
    setError(null);
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 50));
      if (cancelled) return;
      const s = new Html5Qrcode(idRef.current);
      scanner = s;
      try {
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (text) => {
            onDetected(text);
            setOpen(false);
          },
          () => {},
        );
        if (cancelled && s.isScanning) s.stop().then(() => s.clear()).catch(() => {});
      } catch {
        setError("تعذر تشغيل الكاميرا. تأكد من منح إذن الكاميرا.");
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner as (typeof scanner & { isScanning?: boolean }) | null;
      if (!s) return;
      try {
        if (s.isScanning) {
          s.stop().then(() => s.clear()).catch(() => {});
        } else {
          s.clear();
        }
      } catch {
        // scanner already stopped or never started
      }
    };
  }, [open, onDetected]);

  return (
    <>
      <Button type="button" variant="secondary" size="icon" onClick={() => setOpen(true)} aria-label="مسح الباركود">
        <ScanLine className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>وجّه الكاميرا نحو الباركود</DialogTitle>
          </DialogHeader>
          <div id={idRef.current} className="overflow-hidden rounded-lg bg-muted min-h-64" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="size-4" /> إغلاق
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
