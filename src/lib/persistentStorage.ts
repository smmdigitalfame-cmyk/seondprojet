const AUTH_STORAGE_KEY = "darksidex_auth_session";
const CONNECTED_USERNAME_KEY = "ig_connected_username";
const ACTIVE_USERNAME_KEY = "ig_active_profile_username";

const DISPOSABLE_CACHE_PREFIXES = ["ig_cache_", "discover_feed_", "discover_stories_", "ig_search_cache_"];

const MAX_INLINE_MEDIA_CHARS = 4000;

const stripTemporaryMedia = (value: unknown): unknown => {
  if (typeof value === "string") {
    if (value.startsWith("blob:")) return "";
    if (value.startsWith("data:") && value.length > MAX_INLINE_MEDIA_CHARS) return "";
    return value;
  }
  if (Array.isArray(value)) return value.map(stripTemporaryMedia);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, stripTemporaryMedia(nested)])
    );
  }
  return value;
};

const clearDisposableCaches = () => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && DISPOSABLE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
};

/**
 * Older app versions could place full data/blob media inside otherwise useful
 * JSON records. Compact those records instead of deleting the user's edits.
 */
const compactStoredJson = (protectedKey: string) => {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key !== protectedKey && key !== AUTH_STORAGE_KEY) keys.push(key);
  }
  keys.forEach((key) => {
    const raw = localStorage.getItem(key);
    if (!raw || (!raw.includes("data:") && !raw.includes("blob:"))) return;
    try {
      const compacted = JSON.stringify(stripTemporaryMedia(JSON.parse(raw)));
      if (compacted.length < raw.length) localStorage.setItem(key, compacted);
    } catch {}
  });
};

const hashPart = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getAuthKey = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return String(session?.key || "no-key").trim() || "no-key";
  } catch {
    return "no-key";
  }
};

const getAccountKey = () => {
  try {
    return (
      localStorage.getItem(CONNECTED_USERNAME_KEY) ||
      localStorage.getItem(ACTIVE_USERNAME_KEY) ||
      "default-account"
    ).toLowerCase();
  } catch {
    return "default-account";
  }
};

export const getPersistentScope = (accountOverride?: string) => {
  const account = (accountOverride || getAccountKey()).toLowerCase();
  return `k${hashPart(getAuthKey())}_a${hashPart(account)}`;
};

export const getPersistentStorageKey = (baseKey: string) => {
  const scope = getPersistentScope();
  return `${baseKey}__${scope}`;
};

export const getPersistentItem = (baseKey: string): string | null => {
  try {
    const scopedKey = getPersistentStorageKey(baseKey);
    const scoped = localStorage.getItem(scopedKey);
    if (scoped !== null) return scoped;

    const legacy = localStorage.getItem(baseKey);
    if (legacy !== null && getAccountKey() === "default-account") {
      try {
        localStorage.setItem(scopedKey, legacy);
      } catch {}
      return legacy;
    }
  } catch {}
  return null;
};

export const setPersistentItem = (baseKey: string, value: string): boolean => {
  const storageKey = getPersistentStorageKey(baseKey);
  try {
    localStorage.setItem(storageKey, value);
    // Once the scoped copy is safely written, the old unscoped copy is only
    // duplicate storage left behind by earlier app versions.
    if (storageKey !== baseKey) localStorage.removeItem(baseKey);
    return true;
  } catch (e) {
    console.warn("[PersistentStorage] First save failed; clearing disposable caches", e);
    const legacyValue = storageKey !== baseKey ? localStorage.getItem(baseKey) : null;
    try {
      clearDisposableCaches();
      compactStoredJson(storageKey);
      // A failed legacy migration can leave the same dashboard snapshot in
      // both keys. Free that duplicate before retrying the authoritative save.
      if (legacyValue !== null) localStorage.removeItem(baseKey);
      localStorage.setItem(storageKey, value);
      return true;
    } catch (retryError) {
      // Preserve the previous data if even the compact retry cannot succeed.
      if (legacyValue !== null && localStorage.getItem(baseKey) === null) {
        try {
          localStorage.setItem(baseKey, legacyValue);
        } catch {}
      }
      console.warn("[PersistentStorage] Save retry failed:", retryError);
      return false;
    }
  }
};

export const getPersistentJson = <T,>(baseKey: string, fallback: T): T => {
  try {
    const saved = getPersistentItem(baseKey);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

export const setPersistentJson = (baseKey: string, value: unknown): boolean => {
  try {
    return setPersistentItem(baseKey, JSON.stringify(value));
  } catch (error) {
    console.warn("[PersistentStorage] Value could not be serialized:", error);
    return false;
  }
};