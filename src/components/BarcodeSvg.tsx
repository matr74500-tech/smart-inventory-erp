import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { isValidEan13 } from "@/lib/inventory-utils";

export function BarcodeSvg({
  value,
  height = 40,
  width = 1.6,
  fontSize = 12,
  showText = true,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  showText?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: isValidEan13(value) ? "EAN13" : "CODE128",
        height,
        width,
        fontSize,
        displayValue: showText,
        margin: 2,
        background: "transparent",
      });
    } catch {
      /* invalid value: leave empty */
    }
  }, [value, height, width, fontSize, showText]);
  return <svg ref={ref} className="max-w-full" />;
}
