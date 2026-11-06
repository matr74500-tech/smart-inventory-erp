// مخزن مؤقت - يحفظ البيانات في الجوال لما ما فيه نت
const KEY = "offline_queue_v1";

export type PendingItem = {
  id: string;
  table: string;
  data: any;
  createdAt: number;
};

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function getQueue(): PendingItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addToQueue(table: string, data: any) {
  const queue = getQueue();
  queue.push({
    id: Math.random().toString(36).slice(2),
    table,
    data,
    createdAt: Date.now(),
  });
  localStorage.setItem(KEY, JSON.stringify(queue));
  return queue.length;
}

export function clearQueue() {
  localStorage.removeItem(KEY);
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(queue));
}
