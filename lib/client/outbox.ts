export type OutboxKind = "check_in" | "check_out" | "clear_flag";

export type OutboxRecord = {
  id: string;
  kind: OutboxKind;
  body: Record<string, unknown>;
  deviceTime: string;
  status: "pending" | "needs_review";
  error?: string;
};

export type SyncResult = {
  id: string;
  status: "accepted" | "duplicate" | "rejected";
  reason?: string;
};

export interface OutboxStore {
  put(record: OutboxRecord): Promise<void>;
  list(): Promise<OutboxRecord[]>;
  remove(id: string): Promise<void>;
  markReview(id: string, reason: string): Promise<void>;
}

export function memoryOutbox(): OutboxStore {
  const rows = new Map<string, OutboxRecord>();
  return {
    async put(record) {
      rows.set(record.id, record);
    },
    async list() {
      return [...rows.values()];
    },
    async remove(id) {
      rows.delete(id);
    },
    async markReview(id, reason) {
      const row = rows.get(id);
      if (!row) return;
      rows.set(id, { ...row, status: "needs_review", error: reason });
    },
  };
}

export async function enqueue(
  store: OutboxStore,
  input: Omit<OutboxRecord, "status"> & { status?: OutboxRecord["status"] },
): Promise<OutboxRecord> {
  const existing = (await store.list()).find((row) => row.id === input.id);
  if (existing) return existing;
  const record: OutboxRecord = { ...input, status: input.status ?? "pending" };
  await store.put(record);
  return record;
}

/**
 * Send pending rows in order. A thrown send stops the flush so a later retry
 * can continue. Accepted and duplicate rows leave the outbox. Rejected rows
 * stay for review and are not sent again.
 */
export async function flushOutbox(
  store: OutboxStore,
  send: (record: OutboxRecord) => Promise<SyncResult>,
): Promise<{ sent: number; review: number; pending: number }> {
  const pending = (await store.list()).filter((row) => row.status === "pending");
  let sent = 0;
  let review = 0;
  for (const record of pending) {
    let result: SyncResult;
    try {
      result = await send(record);
    } catch {
      break;
    }
    if (result.status === "accepted" || result.status === "duplicate") {
      await store.remove(record.id);
      sent += 1;
      continue;
    }
    await store.markReview(record.id, result.reason || "Needs review");
    review += 1;
  }
  const left = (await store.list()).filter((row) => row.status === "pending").length;
  return { sent, review, pending: left };
}

const DB_NAME = "yardline";
const DB_VERSION = 1;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function browserOutbox(): OutboxStore {
  let opened: Promise<IDBDatabase> | null = null;
  function open(): Promise<IDBDatabase> {
    if (opened) return opened;
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
        if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return opened;
  }
  async function store(mode: IDBTransactionMode) {
    const db = await open();
    return db.transaction("outbox", mode).objectStore("outbox");
  }
  return {
    async put(record) {
      await requestToPromise((await store("readwrite")).put(record));
    },
    async list() {
      const rows = await requestToPromise((await store("readonly")).getAll());
      return rows as OutboxRecord[];
    },
    async remove(id) {
      await requestToPromise((await store("readwrite")).delete(id));
    },
    async markReview(id, reason) {
      const box = await store("readwrite");
      const current = (await requestToPromise(box.get(id))) as OutboxRecord | undefined;
      if (!current) return;
      await requestToPromise(box.put({ ...current, status: "needs_review", error: reason }));
    },
  };
}

export async function saveDraft(draft: { id: string; updatedAt: string; form: unknown }): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await requestToPromise(db.transaction("drafts", "readwrite").objectStore("drafts").put(draft));
}

export async function loadDrafts(): Promise<{ id: string; updatedAt: string; form: unknown }[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!db.objectStoreNames.contains("drafts")) return [];
  const rows = await requestToPromise(db.transaction("drafts", "readonly").objectStore("drafts").getAll());
  return rows as { id: string; updatedAt: string; form: unknown }[];
}

export async function deleteDraft(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!db.objectStoreNames.contains("drafts")) return;
  await requestToPromise(db.transaction("drafts", "readwrite").objectStore("drafts").delete(id));
}
