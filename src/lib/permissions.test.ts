import { describe, expect, it } from "vitest";
import { ACTIONS, PAGES, defaultPermissions, isPermitted, pageForPath } from "./permissions";

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

describe("default permissions and page mapping", () => {
  it("admin receives every page and action", () => {
    const def = defaultPermissions(["admin"]);
    expect(def.pages).toEqual(PAGES.map(([k]) => k));
    expect(def.actions).toEqual(ACTIONS.map(([k]) => k));
  });
  it("storekeeper gets manager defaults minus backup and user screens", () => {
    const def = defaultPermissions(["storekeeper"]);
    expect(def.pages).toContain("inventory");
    expect(def.pages).toContain("stocktake");
    expect(def.pages).not.toContain("backup");
    expect(def.pages).not.toContain("users");
    expect(def.actions).toContain("stocktake.adjust");
    expect(def.actions).not.toContain("inventory.delete");
  });
  it("cashier gets the light default access set", () => {
    const def = defaultPermissions(["cashier"]);
    expect(def.pages).toEqual([
      "dashboard",
      "inventory",
      "alerts",
      "labels",
      "catalog",
      "sales",
      "customers",
      "cash",
      "returns",
    ]);
    expect(def.actions).toContain("sales.draft");
    expect(def.actions).toContain("cash.manage");
    expect(def.actions).toContain("returns.manage");
    expect(def.actions).not.toContain("purchases.post");
  });
  it("roles without a custom row keep their defaults", () => {
    expect(isPermitted(["cashier"], null, "pages", "inventory")).toBe(true);
    expect(isPermitted(["cashier"], null, "pages", "purchases")).toBe(false);
    expect(isPermitted(["cashier"], null, "actions", "purchases.post")).toBe(false);
  });
  it("pageForPath maps route prefixes to pages", () => {
    expect(pageForPath("/")).toBe("dashboard");
    expect(pageForPath("/inventory")).toBe("inventory");
    expect(pageForPath("/users")).toBe("users");
    expect(pageForPath("/returns")).toBe("returns");
    expect(pageForPath("/settings/currency")).toBe("settings");
  });
});
