import { beforeEach, describe, expect, it } from "vitest";
import {
  adjustPrice,
  countDiff,
  expiryStatus,
  ean13,
  findByCode,
  getMovements,
  isValidEan13,
  logMovement,
  num,
  str,
  toBaseQty,
} from "./inventory-utils";
import type { Product } from "./inventory-utils";

describe("inventory rules", () => {
  it("generated barcodes start with 628 and carry a valid EAN-13 check digit", () => {
    expect(ean13("628000000001")).toBe("6280000000017");
    expect(isValidEan13("6280000000017")).toBe(true);
    expect(isValidEan13("6280000000014")).toBe(false);
  });
  it("major unit quantity multiplies by package capacity", () => {
    expect(toBaseQty(3, "major", 12)).toBe(36);
    expect(toBaseQty(3, "base", 12)).toBe(3);
  });
  it("price update by percentage", () => {
    expect(adjustPrice(100, 10)).toBe(110);
    expect(adjustPrice(50, -20)).toBe(40);
  });
  it("expiry colours: expired, within 30 days, safe", () => {
    const now = new Date(2026, 10, 6);
    expect(expiryStatus("2026-11-05", now)).toBe("expired");
    expect(expiryStatus("2026-12-06", now)).toBe("soon");
    expect(expiryStatus("2026-12-07", now)).toBe("ok");
    expect(expiryStatus(null, now)).toBe("none");
  });
  it("stocktake difference", () => {
    expect(countDiff(10, 12).label).toBe("زيادة");
    expect(countDiff(10, 7)).toEqual({ diff: -3, label: "نقص" });
    expect(countDiff(5, 5).label).toBe("مطابق");
  });
});

describe("movement log", () => {
  beforeEach(() => localStorage.clear());

  it("persists movement entries for the audit screen", () => {
    logMovement("product-1", "مبيعات", 2, "فاتورة مبيعات");

    expect(getMovements()).toEqual([
      {
        productId: "product-1",
        type: "مبيعات",
        qty: 2,
        at: expect.any(String),
        note: "فاتورة مبيعات",
      },
    ]);
  });

  it("rejects malformed stored movement data", () => {
    localStorage.setItem("suhail_movements", JSON.stringify([{ productId: 1 }]));

    expect(() => getMovements()).toThrow("Stored movement log has an invalid format");
  });
});

describe("findByCode", () => {
  const products = [
    { barcode: "B1", custom_barcode: null, code: "P1" },
    { barcode: null, custom_barcode: "C2", code: "P2" },
  ] as unknown as Product[];

  it("matches factory barcode, generated barcode or product code", () => {
    expect(findByCode(products, "B1")).toBe(products[0]);
    expect(findByCode(products, "C2")).toBe(products[1]);
    expect(findByCode(products, "P2")).toBe(products[1]);
  });

  it("trims the input and ignores blanks", () => {
    expect(findByCode(products, " B1 ")).toBe(products[0]);
    expect(findByCode(products, "")).toBeUndefined();
  });

  it("returns undefined for unknown codes", () => {
    expect(findByCode(products, "nope")).toBeUndefined();
  });
});

describe("num and str", () => {
  it("parses grouped numbers and rejects junk as zero", () => {
    expect(num(" 1,234.5 ")).toBe(1234.5);
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(undefined)).toBe(0);
  });

  it("keeps strings trimmed", () => {
    expect(str(null)).toBe("");
    expect(str("  سكر  ")).toBe("سكر");
    expect(str(5)).toBe("5");
  });
});
