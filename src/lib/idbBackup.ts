/**
 * Tiny IndexedDB key/value backup. localStorage is capped at ~5MB, which a
 * 350-reel cloned list plus user edits can exceed; IndexedDB has far more room,
 * so user edits and the reel list are mirrored here and restored on startup.
 */
const DB_NAME = "ig_backup_v1";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbGetAll(prefix: string): Promise<Record<string, unknown>> {
  const db = await openDb();
  if (!db) return {};
  return new Promise((resolve) => {
    const out: Record<string, unknown> = {};
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        const key = String(cursor.key);
        if (key.startsWith(prefix)) out[key] = cursor.value;
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
}

/** Resolve within `ms` even if IndexedDB is slow, so startup never hangs. */
export const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
