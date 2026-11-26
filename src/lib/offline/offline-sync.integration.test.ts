import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRpcConflict, enqueueRpc, getRpcQueue, removeRpc } from "@/lib/offline/rpc-queue";
import { syncQueuedRpc } from "@/lib/offline/rpc-sync";
import { wipeInventoryCache } from "@/lib/offline/inventory-cache";

// --- Supabase fake (record calls, control session + server state) ---
const rpcCalls: Array<{ name: string; args: unknown }> = [];
const allowedRpcNames = new Set([
  "post_sale_offline",
  "save_product_offline",
  "set_stock_offline",
  "set_stock_batch_offline",
  "transfer_shelf_stock_offline",
]);
let sessionUserId: string | null = null;
let serverProduct: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          data:
            table === "offline_rpc_allowlist"
              ? [...allowedRpcNames].map((rpc_name) => ({ rpc_name }))
              : null,
          maybeSingle: async () => ({ data: table === "products" ? serverProduct : null }),
          single: async () => ({
            data:
              table === "offline_rpc_allowlist"
                ? [...allowedRpcNames].map((rpc_name) => ({ rpc_name }))
                : null,
          }),
        }),
      }),
      upsert: async () => ({}),
    }),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { error: null };
    },
  },
}));

// --- Fake IndexedDB (records per db/store) ---
function installFakeIndexedDB() {
  const dbs = new Map<string, Map<string, unknown>>();
  const fire = (req: Record<string, unknown>, key: string) =>
    queueMicrotask(() => (req[key] as (() => void) | null)?.());
  const open = (name: string) => {
    const dbData = dbs.get(name) ?? new Map<string, unknown>();
    dbs.set(name, dbData);
    const store = {
      delete: (key: string) => void dbData.delete(key),
      getAllKeys: () => {
        const req: Record<string, unknown> = { result: [...dbData.keys()] };
        fire(req, "onsuccess");
        return req;
      },
    };
    const request: Record<string, unknown> = {
      objectStore: () => store,
      oncomplete: null,
      onerror: null,
    };
    fire(request, "oncomplete");
    const db = {
      close: () => {},
      transaction: () => request,
    };
    const openReq: Record<string, unknown> = {
      result: db,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    fire(openReq, "onsuccess");
    return openReq;
  };
  vi.stubGlobal("indexedDB", { open });
  return dbs;
}

beforeEach(() => {
  localStorage.clear();
  rpcCalls.length = 0;
  serverProduct = null;
  sessionUserId = "user-1";
  vi.unstubAllGlobals();
});

describe("offline sync integration", () => {
  it("sales invoice: offline → reconnect → applied once, no duplicates", async () => {
    await enqueueRpc({
      id: "op-sale-1",
      name: "post_sale_offline",
      args: { _operation_id: "op-sale-1", _id: "inv-1", total: 100 } as never,
    });
    expect(await getRpcQueue()).toHaveLength(1);

    // "Reconnect" — sync while online: applied once
    const res = await syncQueuedRpc();
    expect(res.synced).toBe(1);
    expect(rpcCalls.filter((c) => c.name === "post_sale_offline")).toHaveLength(1);
    // Applied and removed from the queue
    expect(await getRpcQueue()).toHaveLength(0);

    // Sync again (second reconnect): nothing re-applied — no duplicate entries
    const res2 = await syncQueuedRpc();
    expect(rpcCalls.filter((c) => c.name === "post_sale_offline")).toHaveLength(1);
    expect(res2.synced).toBe(0);
  });

  it("product price/quantity conflict: server newer → conflict saved, no silent overwrite; accept local → apply; accept server → removed", async () => {
    serverProduct = { id: "p1", updated_at: "2026-01-02T00:00:00Z", price: 99, quantity: 5 };
    await enqueueRpc({
      id: "op-p1",
      name: "save_product_offline",
      args: {
        _operation_id: "op-p1",
        _id: "p1",
        _product: { id: "p1", updated_at: "2026-01-01T00:00:00Z", price: 10, quantity: 100 },
      } as never,
    });
    // Device 1 edit is based on updated_at 2026-01-01; the server moved it to 2026-01-02.
    const res = await syncQueuedRpc();
    // No silent overwrite: the RPC was not applied.
    expect(rpcCalls.filter((c) => c.name === "save_product_offline")).toHaveLength(0);
    expect(res.synced).toBe(0);

    const queue = await getRpcQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.conflict?.serverUpdatedAt).toBe("2026-01-02T00:00:00Z");
    expect(queue[0]?.conflict?.local["price"]).toBe(10);
    expect(queue[0]?.conflict?.server["price"]).toBe(99);
    expect(queue[0]?.conflict?.server["quantity"]).toBe(5);

    const id = queue[0]!.id;
    // User accepts their local edit → forced apply
    await clearRpcConflict(id);
    const res2 = await syncQueuedRpc({ forceIds: [id] });
    expect(rpcCalls.filter((c) => c.name === "save_product_offline")).toHaveLength(1);
    expect(res2.synced).toBe(1);
    expect(await getRpcQueue()).toHaveLength(0);

    // Alternatively: user accepts the server version → item removed, nothing applied
    await enqueueRpc({
      id: "op-p2",
      name: "save_product_offline",
      args: {
        _operation_id: "op-p2",
        _id: "p1",
        _product: { id: "p1", updated_at: "2026-01-01T00:00:00Z", price: 10 },
      } as never,
    });
    serverProduct = { id: "p1", updated_at: "2026-01-03T00:00:00Z", price: 50 };
    await syncQueuedRpc();
    expect(rpcCalls.filter((c) => c.name === "save_product_offline")).toHaveLength(1);
    await removeRpc((await getRpcQueue()).find((i) => i.id === "op-p2")!.id);
    expect((await getRpcQueue()).length).toBe(0);
  });

  it("account switching: other user's queued operations stay queued (queue isolation)", async () => {
    sessionUserId = "user-A";
    await enqueueRpc({
      id: "opA",
      name: "save_product_offline",
      args: { _operation_id: "opA", _id: "pA" } as never,
    });
    sessionUserId = "user-B";
    await enqueueRpc({
      id: "opB",
      name: "post_sale_offline",
      args: { _operation_id: "opB", _id: "inv-B" } as never,
    });

    const res = await syncQueuedRpc();
    const queue = await getRpcQueue();

    // user-B's operation applied once; user-A's stays in the queue (isolated).
    expect(queue.map((i) => i.id)).toContain("opA");
    expect(queue.map((i) => i.id)).not.toContain("opB");
    expect(rpcCalls.filter((c) => c.name === "save_product_offline")).toHaveLength(0);
    expect(rpcCalls.filter((c) => c.name === "post_sale_offline")).toHaveLength(1);
    expect(res.synced).toBe(1);
  });

  it("wipeInventoryCache is safe without browser IndexedDB", async () => {
    await expect(wipeInventoryCache("user-A")).resolves.toBeUndefined();
  });
});
