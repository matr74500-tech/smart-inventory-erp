import { describe, expect, it } from "vitest";
import { adjustPrice, ean13, isValidEan13, toBaseQty } from "./inventory-utils";

describe("inventory rules", () => {
  it("generated barcodes start with 628 and carry a valid EAN-13 check digit", () => {
    expect(ean13("628000000001")).toBe("6280000000014");
    expect(isValidEan13("6280000000014")).toBe(true);
    expect(isValidEan13("6280000000015")).toBe(false);
  });
  it("major unit quantity multiplies by package capacity", () => {
    expect(toBaseQty(3, "major", 12)).toBe(36);
    expect(toBaseQty(3, "base", 12)).toBe(3);
  });
  it("price update by percentage", () => {
    expect(adjustPrice(100, 10)).toBe(110);
    expect(adjustPrice(50, -20)).toBe(40);
  });
});
