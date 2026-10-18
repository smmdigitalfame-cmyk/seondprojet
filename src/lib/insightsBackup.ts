/**
 * IndexedDB mirror for the Professional Dashboard snapshot. With 350 cloned
 * reels the per-reel content list can exceed the ~5MB localStorage cap, so the
 * full snapshot is also kept in memory + IndexedDB and restored on startup.
 */
import { idbGetAll, idbSet } from "@/lib/idbBackup";
import { getPersistentScope } from "@/lib/persistentStorage";

const PREFIX = "insights:ig_insights_v1:";
const memory = new Map<string, { savedAt: number; data: unknown }>();
let idbAvailable = typeof indexedDB !== "undefined";

export async function hydrateInsightsFromBackup(): Promise<void> {
  try {
    const all = await idbGetAll(PREFIX);
    for (const [key, value] of Object.entries(all)) {
      const entry = value as { savedAt?: number; data?: unknown } | null;
      if (!entry || typeof entry !== "object" || !entry.data) continue;
      const scope = key.slice(PREFIX.length);
      const current = memory.get(scope);
      if (!current || (entry.savedAt ?? 0) > current.savedAt) {
        memory.set(scope, { savedAt: entry.savedAt ?? 0, data: entry.data });
      }
    }
  } catch {}
}

export function getInsightsBackup<T>(): { savedAt: number; data: T } | null {
  const entry = memory.get(getPersistentScope());
  return entry ? { savedAt: entry.savedAt, data: entry.data as T } : null;
}

/** Stores in memory immediately and mirrors to IndexedDB. Returns true when a durable copy is being written. */
export function setInsightsBackup(data: unknown, savedAt: number): boolean {
  const scope = getPersistentScope();
  memory.set(scope, { savedAt, data });
  if (!idbAvailable) return false;
  void idbSet(`${PREFIX}${scope}`, { savedAt, data }).then((ok) => {
    if (!ok) console.warn("[Insights] IndexedDB backup write failed");
  });
  return true;
}

export function markInsightsBackupUnavailable() {
  idbAvailable = false;
}
