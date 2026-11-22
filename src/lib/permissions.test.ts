import { describe, expect, it } from "vitest";
import { defaultPermissions, isPermitted } from "./permissions";

describe("individual employee permissions", () => {
  const custom = {
    pages: ["inventory"],
    actions: ["inventory.create"],
    fields: ["name", "barcode"],
  };
  it("allows only the selected pages, regardless of employee role", () => {
    expect(isPermitted(["storekeeper"], custom, "pages", "inventory")).toBe(true);
    expect(isPermitted(["storekeeper"], custom, "pages", "purchases")).toBe(false);
  });
  it("separates adding an item from changing prices", () => {
    expect(isPermitted(["cashier"], custom, "actions", "inventory.create")).toBe(true);
    expect(isPermitted(["cashier"], custom, "actions", "prices.update")).toBe(false);
  });
  it("hides each unselected field, including purchase cost", () => {
    expect(isPermitted(["storekeeper"], custom, "fields", "barcode")).toBe(true);
    expect(isPermitted(["storekeeper"], custom, "fields", "cost")).toBe(false);
    expect(isPermitted(["storekeeper"], custom, "fields", "quantity")).toBe(false);
  });
  it("an empty selection grants no employee access", () => {
    expect(
      isPermitted(["storekeeper"], { pages: [], actions: [], fields: [] }, "pages", "inventory"),
    ).toBe(false);
  });
  it("keeps the manager able to administer employees", () => {
    expect(isPermitted(["admin"], custom, "pages", "users")).toBe(true);
  });
  it("preserves existing access until an employee is configured", () => {
    expect(defaultPermissions(["cashier"]).pages).not.toContain("purchases");
    expect(defaultPermissions(["storekeeper"]).actions).toContain("stocktake.adjust");
  });
});
