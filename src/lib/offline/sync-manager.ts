import { supabase } from "@/integrations/supabase/client";
import {
  getRpcQueue,
  recordRpcFailure,
  removeRpc,
  rpcBackoffDelayMs,
  rpcShouldAutoRetry,
  type QueuedRpc,
} from "./rpc-queue";
import { getQueue, removeFromQueue } from "./store";
import { syncQueuedRpc } from "./rpc-sync";

const SYNC_INTERVAL_MS = 10_000;
const MAX_CONCURRENT_SYNC = 3;

type SyncState = {
  isSyncing: boolean;
  lastSyncAt: number;
  consecutiveFailures: number;
  onlineListenerAttached: boolean;
};

const syncState: SyncState = {
  isSyncing: false,
  lastSyncAt: 0,
  consecutiveFailures: 0,
  onlineListenerAttached: false,
};

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
const syncListeners = new Set<() => void>();

function notifyListeners() {
  syncListeners.forEach((fn) => fn());
}

export function subscribeToSync(fn: () => void) {
  syncListeners.add(fn);
  return () => {
    syncListeners.delete(fn);
  };
}

export function getSyncState() {
  return { ...syncState };
}

async function performSync(): Promise<{
  rpcSynced: number;
  rpcRemaining: number;
  rpcErrors: string[];
  mainSynced: number;
  mainRemaining: number;
  mainErrors: string[];
}> {
  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session) {
    return {
      rpcSynced: 0,
      rpcRemaining: (await getRpcQueue()).length,
      rpcErrors: ["No active session"],
      mainSynced: 0,
      mainRemaining: getQueue().length,
      mainErrors: [],
    };
  }

  const rpcResult = await syncQueuedRpc();
  const mainQueue = getQueue();

  let mainSynced = 0;
  const mainErrors: string[] = [];

  for (const item of mainQueue) {
    try {
      const { error } = await supabase.from(item.table).insert(item.data as never);
      if (!error) {
        removeFromQueue(item.id);
        mainSynced++;
      } else {
        mainErrors.push(`${item.table}: ${error.message}`);
      }
    } catch (error) {
      mainErrors.push(`${item.table}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    rpcSynced: rpcResult.synced,
    rpcRemaining: rpcResult.remaining,
    rpcErrors: rpcResult.errors,
    mainSynced,
    mainRemaining: getQueue().length,
    mainErrors,
  };
}

export async function triggerSync(): Promise<void> {
  if (syncState.isSyncing) return;
  if (!navigator.onLine) return;

  syncState.isSyncing = true;
  notifyListeners();

  try {
    const result = await performSync();
    syncState.lastSyncAt = Date.now();
    syncState.consecutiveFailures = 0;

    const hasErrors = result.rpcErrors.length > 0 || result.mainErrors.length > 0;
    if (hasErrors) {
      syncState.consecutiveFailures++;
    }
  } catch {
    syncState.consecutiveFailures++;
  } finally {
    syncState.isSyncing = false;
    notifyListeners();
  }
}

function scheduleNextSync() {
  if (syncIntervalId) clearInterval(syncIntervalId);

  const baseDelay = SYNC_INTERVAL_MS;
  const backoffMultiplier = Math.min(2 ** syncState.consecutiveFailures, 64);
  const delay = baseDelay * backoffMultiplier;

  syncIntervalId = setInterval(() => {
    if (navigator.onLine && !syncState.isSyncing) {
      void triggerSync();
    }
  }, delay);
}

function onOnline() {
  void triggerSync();
  scheduleNextSync();
}

function onOffline() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

export function initOfflineSync() {
  if (syncState.onlineListenerAttached) return;

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  syncState.onlineListenerAttached = true;

  if (navigator.onLine) {
    scheduleNextSync();
    void triggerSync();
  }
}

export function destroyOfflineSync() {
  if (!syncState.onlineListenerAttached) return;

  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  syncState.onlineListenerAttached = false;

  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}
