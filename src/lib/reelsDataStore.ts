import type { ExtendedPostItem } from "@/data/reelInsightsData";
import { getPersistentScope } from "@/lib/persistentStorage";
import { idbGetAll, idbSet } from "@/lib/idbBackup";

export type OverrideData = Record<string, any>;
export const OWNED_REELS_ACCOUNT = "just4abhii";
const OVERRIDES_KEY = "ig_reel_overrides_v2";

const accountScope = (account: string) => getPersistentScope(account).slice(0, 18);

const INSIGHT_KEYS = [
  "views", "likes", "comments", "shares", "reposts", "saves",
  "watchTime", "avgWatchTime", "followerViewsPct", "viewRatePast3Sec",
  "genderMale", "genderFemale", "countries", "ageGroups", "sources",
  "accountsReached", "follows", "skipRate", "typicalSkipRate",
  "retentionCurve", "engagementCurve", "typicalRetentionCurve",
] as const;

const PUBLIC_METRIC_KEYS = new Set<string>(["views", "likes", "comments", "accountsReached"]);

type OverrideStore = Record<string, Record<string, OverrideData>>;

const IDB_OVERRIDES_KEY = `overrides:${OVERRIDES_KEY}`;
// Authoritative in-memory copy. localStorage can be full on phones, so the
// latest edits always live here plus an IndexedDB mirror restored at startup.
let storeCache: OverrideStore | null = null;

const countEntries = (store: OverrideStore) =>
  Object.values(store).reduce((sum, entries) => sum + Object.keys(entries || {}).length, 0);

const latestUpdate = (store: OverrideStore) => {
  let latest = 0;
  for (const entries of Object.values(store)) {
    for (const value of Object.values(entries || {})) latest = Math.max(latest, Number(value?.updatedAt ?? 0));
  }
  return latest;
};

const readLocalStore = (): OverrideStore => {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const readStore = (): OverrideStore => {
  if (!storeCache) storeCache = readLocalStore();
  return JSON.parse(JSON.stringify(storeCache));
};

/** Merge the IndexedDB backup so edits survive when localStorage was full. */
export async function hydrateOverridesFromBackup(): Promise<void> {
  try {
    const backup = (await idbGetAll(IDB_OVERRIDES_KEY))[IDB_OVERRIDES_KEY] as OverrideStore | undefined;
    if (!backup || typeof backup !== "object") return;
    const local = storeCache ?? readLocalStore();
    const merged: OverrideStore = JSON.parse(JSON.stringify(local));
    for (const [account, entries] of Object.entries(backup)) {
      merged[account] = merged[account] ?? {};
      for (const [slot, value] of Object.entries(entries || {})) {
        const current = merged[account][slot];
        if (!current || Number(value?.updatedAt ?? 0) > Number(current?.updatedAt ?? 0)) merged[account][slot] = value;
      }
    }
    if (countEntries(merged) !== countEntries(local) || latestUpdate(merged) !== latestUpdate(local)) {
      storeCache = merged;
      try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(merged)); } catch {}
    } else {
      storeCache = local;
    }
  } catch {}
}

const MAX_INLINE_MEDIA_CHARS = 4000;

/**
 * Heavy inline media (base64 data URLs / blob URLs) can blow past the ~5MB
 * localStorage quota and make every later save fail. They are never usable
 * after a reload anyway, so they are dropped before persisting.
 */
const stripHeavyMedia = (override: OverrideData): OverrideData => {
  const cleaned: OverrideData = { ...override };
  for (const key of ["thumbnail", "videoUrl", "musicIcon", "retentionImage"]) {
    const value = cleaned[key];
    if (typeof value !== "string") continue;
    if (value.startsWith("blob:")) delete cleaned[key];
    else if (value.startsWith("data:") && value.length > MAX_INLINE_MEDIA_CHARS) delete cleaned[key];
  }
  return cleaned;
};

const persistStore = (store: OverrideStore) => {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(store));
};

/** Drop the least recently updated override so a retry can fit in the quota. */
const pruneOldest = (store: OverrideStore): boolean => {
  let target: { account: string; index: string; updatedAt: number } | null = null;
  for (const [account, entries] of Object.entries(store)) {
    for (const [index, value] of Object.entries(entries)) {
      const updatedAt = Number(value?.updatedAt ?? 0);
      if (!target || updatedAt < target.updatedAt) target = { account, index, updatedAt };
    }
  }
  if (!target) return false;
  delete store[target.account][target.index];
  if (Object.keys(store[target.account]).length === 0) delete store[target.account];
  return true;
};

const writeStore = async (store: OverrideStore): Promise<boolean> => {
  storeCache = JSON.parse(JSON.stringify(store));
  const backedUp = await idbSet(IDB_OVERRIDES_KEY, storeCache);
  try {
    persistStore(store);
    return true;
  } catch (error) {
    // The IndexedDB copy holds every edit; never delete user edits just
    // because localStorage is full.
    if (backedUp) {
      console.warn("[ReelOverrides] localStorage full; edits kept in IndexedDB backup", error);
      return true;
    }
  }
  const pruned: OverrideStore = JSON.parse(JSON.stringify(store));
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      persistStore(pruned);
      return true;
    } catch (error) {
      console.warn("[ReelOverrides] Save failed, pruning old entries", error);
      if (!pruneOldest(pruned)) {
        console.warn("[ReelOverrides] Nothing left to prune", error);
        return false;
      }
    }
  }
  return false;
};

const normalizeAccountKey = (account: string) => account || OWNED_REELS_ACCOUNT;


/** Override account key for the currently connected main account. */
export function getCurrentMainReelsAccountKey(): string {
  return `${OWNED_REELS_ACCOUNT}:${getPersistentScope().slice(0, 18)}`;
}

export function getReelsAccountKey(account: string, isMainAccount: boolean): string {
  return isMainAccount ? `${OWNED_REELS_ACCOUNT}:${accountScope(account)}` : account;
}

/**
 * Scraped Instagram CDN/proxy URLs expire. An override that merely carries the
 * old scraped URL (not a user upload) must not replace the fresh clone's media.
 */
const isScrapedMediaUrl = (value: unknown) =>
  typeof value === "string" && /cdninstagram|fbcdn|ig-image-proxy/i.test(value);

/** Apply every saved edit for this account onto a reel list by stable identity. */
export function applySavedOverridesToReels(reels: ExtendedPostItem[], account: string): ExtendedPostItem[] {
  const scoped = readStore()[normalizeAccountKey(account)];
  if (!scoped || Object.keys(scoped).length === 0) return reels;
  const bySourceId = new Map<string, OverrideData>();
  for (const value of Object.values(scoped)) {
    if (typeof value?.sourceId === "string" && value.sourceId) {
      const prev = bySourceId.get(value.sourceId);
      if (!prev || Number(value.updatedAt ?? 0) >= Number(prev.updatedAt ?? 0)) bySourceId.set(value.sourceId, value);
    }
  }
  return reels.map((reel, index) => {
    let override: OverrideData | undefined;
    if (reel.sourceId) override = bySourceId.get(reel.sourceId);
    if (!override) {
      const byIndex = scoped[String(index)];
      // Index fallback only for legacy edits saved without an identity.
      if (byIndex && !byIndex.sourceId) override = byIndex;
    }
    return override ? applyOverrideToReel(reel, override) : reel;
  });
}

export function applyOverrideToReel(reel: ExtendedPostItem, override?: OverrideData | null): ExtendedPostItem {
  if (!override) return reel;
  const next: ExtendedPostItem = {
    ...reel,
    insights: {
      ...reel.insights,
      viewsOverTime: reel.insights.viewsOverTime?.map((point) => ({ ...point })) ?? [],
    },
  };

  for (const key of ["thumbnail", "videoUrl", "caption", "duration", "musicTitle", "musicIcon", "graphStartDate", "displayDate", "yCenter", "yTop", "yCenterLabel", "yTopLabel", "profileVisits", "audienceText", "typicalViewRate", "monetisationStatus", "editTypicalTop", "timeRangeMode", "retentionImage", "sourcesImage", "interactions"] as const) {
    if (override[key] === undefined || override[key] === null) continue;
    if ((key === "thumbnail" || key === "videoUrl" || key === "musicIcon") && isScrapedMediaUrl(override[key]) && (reel as any)[key]) continue;
    (next as any)[key] = override[key];
  }
  if (override.engagementYCenter != null) (next as any).engagementYCenter = override.engagementYCenter;
  if (override.engagementYTop != null) (next as any).engagementYTop = override.engagementYTop;

  for (const key of INSIGHT_KEYS) {
    if (override[key] === undefined || override[key] === null) continue;
    // A stale/empty saved count must never hide a real scraped count. Old
    // overrides (saved before views were scraped correctly, or attached to a
    // different reel) carried 0 and turned 900K-view reels into "0 views".
    if (PUBLIC_METRIC_KEYS.has(key) && !(Number(override[key]) > 0) && Number((reel.insights as any)?.[key]) > 0) continue;
    (next.insights as any)[key] = override[key];
  }
  if (Array.isArray(override.customGraphData)) {
    next.insights.viewsOverTime = override.customGraphData.map((point: any) => ({ ...point }));
  }

  // Date labels are saved independently from the drawn curve. Always apply
  // them after customGraphData; otherwise an older curve payload restores its
  // stale labels and makes the user's Start / Mid / End edits look unsaved.
  if (next.insights.viewsOverTime && next.insights.viewsOverTime.length >= 3) {
    const vot = next.insights.viewsOverTime;
    const lastI = vot.length - 1;
    const midI = Math.floor(lastI / 2);
    if (override.xDate1 !== undefined && override.xDate1 !== null) vot[0].day = String(override.xDate1);
    if (override.xDate2 !== undefined && override.xDate2 !== null) vot[midI].day = String(override.xDate2);
    if (override.xDate3 !== undefined && override.xDate3 !== null) vot[lastI].day = String(override.xDate3);
  }

  return next;
}

export function getOverrideSync(account: string, postIndex: number, sourceId?: string): OverrideData | null {
  const store = readStore();
  const scoped = store[normalizeAccountKey(account)] ?? {};
  if (sourceId) {
    const matched = Object.values(scoped).find((override) => override.sourceId === sourceId);
    if (matched) return matched;
  }
  const byIndex = scoped[String(postIndex)] ?? null;
  // Index is only a fallback for legacy overrides with no identity. An entry
  // that belongs to another reel must never be applied to this one.
  if (byIndex && sourceId && byIndex.sourceId && byIndex.sourceId !== sourceId) return null;
  return byIndex;
}

/** Storage slot for an override: its own sourceId slot, never another reel's. */
const resolveOverrideKey = (scoped: Record<string, OverrideData>, postIndex: number, sourceId?: string): string => {
  if (sourceId) {
    const existing = Object.entries(scoped).find(([, value]) => value?.sourceId === sourceId)?.[0];
    if (existing) return existing;
    const indexed = scoped[String(postIndex)];
    if (indexed?.sourceId && indexed.sourceId !== sourceId) return `sid:${sourceId}`;
  }
  return String(postIndex);
};

export async function getOverride(account: string, postIndex: number, sourceId?: string): Promise<OverrideData | null> {
  return getOverrideSync(account, postIndex, sourceId);
}

export async function getAllOverrides(account: string): Promise<Record<string, OverrideData>> {
  return { ...(readStore()[normalizeAccountKey(account)] ?? {}) };
}

export async function saveOverride(
  account: string,
  postIndex: number,
  data: OverrideData
): Promise<boolean> {
  const store = readStore();
  const accountKey = normalizeAccountKey(account);
  store[accountKey] = store[accountKey] ?? {};
  const slotKey = resolveOverrideKey(store[accountKey], postIndex, typeof data.sourceId === "string" ? data.sourceId : undefined);
  const nextOverride: OverrideData = stripHeavyMedia({
    ...(store[accountKey][slotKey] ?? {}),
    ...data,
    updatedAt: Date.now(),
  });

  // Keep labels inside the graph payload in sync as well as storing xDate1/2/3.
  // This prevents any editor/chart that reads customGraphData directly from
  // reopening with the old dates.
  if (Array.isArray(nextOverride.customGraphData) && nextOverride.customGraphData.length >= 3) {
    const points = nextOverride.customGraphData.map((point: any) => ({ ...point }));
    const lastI = points.length - 1;
    const midI = Math.floor(lastI / 2);
    if (nextOverride.xDate1 !== undefined && nextOverride.xDate1 !== null) points[0].day = String(nextOverride.xDate1);
    if (nextOverride.xDate2 !== undefined && nextOverride.xDate2 !== null) points[midI].day = String(nextOverride.xDate2);
    if (nextOverride.xDate3 !== undefined && nextOverride.xDate3 !== null) points[lastI].day = String(nextOverride.xDate3);
    nextOverride.customGraphData = points;
  }
  store[accountKey][slotKey] = nextOverride;
  return writeStore(store);
}

export async function mergeAndSaveOverride(
  account: string,
  postIndex: number,
  data: OverrideData,
  sourceId?: string,
): Promise<boolean> {
  const existing = await getOverride(account, postIndex, sourceId);
  return saveOverride(account, postIndex, { ...(existing ?? {}), ...data, ...(sourceId ? { sourceId } : {}) });
}
