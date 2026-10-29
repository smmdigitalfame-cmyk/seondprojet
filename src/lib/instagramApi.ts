import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthSession, getDeviceFingerprint, clearAuthSession } from "@/lib/auth";
import { instagramFailureMessage } from "@/lib/instagramFailure";

export interface InstaProfile {
  username: string;
  fullName: string;
  bio: string;
  avatarUrl: string;
  isVerified: boolean;
  followers: number;
  following: number;
  postsCount: number;
  externalUrl?: string;
  category?: string;
}

export interface InstaReel {
  id: string;
  code: string;
  caption: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reposts?: number;
  takenAt: number;
}

export type InstaPost = InstaReel;

export interface InstaHighlight {
  id: string;
  name: string;
  image: string;
}

export type InstaScrapeType = "profile" | "reels" | "posts" | "highlights" | "all";

export interface InstaScrapeResult {
  username: string;
  profile?: InstaProfile;
  reels?: InstaReel[];
  posts?: InstaPost[];
  highlights?: InstaHighlight[];
  profileOk?: boolean;
  reelsOk?: boolean;
  postsOk?: boolean;
  highlightsOk?: boolean;
  // Pagination tokens — empty string = no more pages.
  postsNextCursor?: string;
  postsHasMore?: boolean;
  reelsNextCursor?: string;
  reelsHasMore?: boolean;
  // True when the response is a "load more" batch (only contains the new page).
  paginated?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

const USERNAME_KEY = "ig_connected_username";
// Bump whenever media caching rules change. Instagram/CDN media URLs are signed
// and commonly expire within a few hours, so an old cached payload can retain
// correct profile text while every avatar/thumbnail is already unusable.
const CACHE_PREFIX = "ig_cache_v26";
const CACHE_SOFT_TTL_MS = 30 * 60 * 1000; // refresh signed URLs after 30 minutes
const CACHE_HARD_TTL_MS = 2 * 60 * 60 * 1000; // never reuse expired media all day
// Edge fn details call ≈ up to 65s; allow margin so client doesn't abort first.
const SCRAPER_TIMEOUT_MS = 150_000;

export const getConnectedUsername = (): string | null => {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
};

export const setConnectedUsername = (u: string) => {
  try {
    localStorage.setItem(USERNAME_KEY, u);
  } catch {}
};

export const disconnectInstagram = () => {
  const prev = getConnectedUsername();
  try {
    localStorage.removeItem(USERNAME_KEY);
  } catch {}
  if (prev) clearInstagramCache(prev);
};

export const clearInstagramCache = (username?: string) => {
  try {
    const u = username?.trim().replace(/^@/, "").toLowerCase();
    const keys = Object.keys(localStorage);
    keys.forEach((k) => {
      if (!k.startsWith(CACHE_PREFIX + ":")) return;
      if (u && !k.includes(`:${u}:`)) return;
      localStorage.removeItem(k);
    });
  } catch {}
};

// In-flight request coalescing: if 100 components ask for the same username at
// the same time, only 1 network request is made and all of them share the result.
const inflight = new Map<string, Promise<InstaScrapeResult>>();

// ---- Foreground priority gate -------------------------------------------
// The discover feed fires ~20 parallel scrapes. The browser only allows ~6
// concurrent connections per origin, so a user-triggered clone can get stuck
// behind them for a minute. Background callers wait while a priority (user
// initiated) fetch is running.
let priorityCount = 0;
let priorityWaiters: Array<() => void> = [];

export function beginPriorityFetch() {
  priorityCount += 1;
}

export function endPriorityFetch() {
  priorityCount = Math.max(0, priorityCount - 1);
  if (priorityCount === 0) {
    const waiters = priorityWaiters;
    priorityWaiters = [];
    waiters.forEach((w) => w());
  }
}

export function waitForPriorityIdle(): Promise<void> {
  if (priorityCount === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    priorityWaiters.push(resolve);
    // Safety valve — never block background work forever.
    setTimeout(resolve, 90_000);
  });
}


// Generate short, unique trace ids for end-to-end request correlation.
const newClientTraceId = (): string =>
  Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 8);

const hashPart = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getCacheScope = () => {
  const session = getAuthSession();
  const raw = `${session?.key || "no-key"}|${session?.deviceFingerprint || getDeviceFingerprint()}`;
  return hashPart(raw);
};

const getCacheKey = (username: string, type: InstaScrapeType) =>
  `${CACHE_PREFIX}:${getCacheScope()}:${username}:${type}`;

export async function fetchInstagramData(
  username: string,
  type: InstaScrapeType = "all",
  opts: { force?: boolean; pages?: number; cursor?: string; background?: boolean } = {}
): Promise<InstaScrapeResult> {
  const u = username.trim().replace(/^@/, "").toLowerCase();
  // Cursor requests are unique per call — never coalesce them.
  const key = opts.cursor
    ? `${u}::${type}::cursor:${opts.cursor.slice(0, 24)}`
    : `${u}::${type}::p${opts.pages ?? 1}::${opts.force ? "f" : ""}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const traceId = newClientTraceId();
  const startedAt = Date.now();

  const p = (async () => {
    try {
      // Background (discover feed) work yields to user-initiated fetches.
      if (opts.background) await waitForPriorityIdle();
      // Pre-flight: ensure we have a session before hitting the gated endpoint.
      const _session = getAuthSession();
      if (!_session?.key) {
        try { clearAuthSession(); } catch (_) {}
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
        throw new Error("Session expired. Please log in again.");
      }
      const reqBody: Record<string, unknown> = { username: u, type };
      if (opts.force) reqBody.force = true;
      // pages: 1 asks the backend for its quick mode (profile + newest posts).
      if (opts.pages) reqBody.pages = opts.pages;
      if (opts.cursor) reqBody.cursor = opts.cursor;

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        "x-trace-id": traceId,
        "x-access-key": _session.key,
        "x-device-fp": _session.deviceFingerprint || getDeviceFingerprint(),
      };
      // Legacy JWT publishable keys may be sent as Bearer tokens. New opaque
      // publishable keys must not be put in Authorization (some mobile browsers
      // and gateways reject that malformed Bearer value).
      if (!SUPABASE_KEY.startsWith("sb_publishable_")) {
        requestHeaders.Authorization = `Bearer ${SUPABASE_KEY}`;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-scraper`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(SCRAPER_TIMEOUT_MS),
      });
      const ms = Date.now() - startedAt;
      const serverTrace = res.headers.get("x-trace-id") || traceId;
      const cache = res.headers.get("x-cache") || "?";
      const cacheAge = res.headers.get("x-cache-age");
      const serverMs = res.headers.get("x-duration-ms");
      const cacheStats = res.headers.get("x-cache-stats");
      const cacheHeat = res.headers.get("x-cache-heatmap");
      if (!res.ok) {
        const t = await res.text();
        let rejectionReason = "";
        try { rejectionReason = String(JSON.parse(t)?.reason || ""); } catch (_) {}
        const definitiveKeyFailure = ["invalid_key", "deactivated", "expired"].includes(rejectionReason);
        if (res.status === 401 && definitiveKeyFailure) {
          try { clearAuthSession(); } catch (_) {}
          if (typeof window !== "undefined" && window.location.pathname !== "/") window.location.href = "/";
        }
        console.warn(
          `[ig-scraper] ${u} ${type} FAIL ${res.status} ms=${ms} trace=${serverTrace} :: ${t.slice(0, 200)}`,
        );
        // Friendly, actionable message for end users.
        let friendly = instagramFailureMessage(res.status, t, u);
        if (res.status === 401) {
          friendly = definitiveKeyFailure
            ? "Session expired. Please log in again."
            : "License verification is temporarily unavailable. Please try again.";
        } else if (res.status === 429) {
          friendly = "Too many requests right now. Please wait a minute and try again.";
        }
        const err = new Error(friendly) as Error & {
          __trace?: { traceId: string; serverTraceId: string; status: number; url: string };
        };
        err.__trace = {
          traceId,
          serverTraceId: serverTrace,
          status: res.status,
          url: `${SUPABASE_URL}/functions/v1/instagram-scraper`,
        };
        throw err;
      }
      const tag = opts.cursor ? "more" : `p${opts.pages ?? 1}`;
      console.log(
        `[ig-scraper] ${u} ${type} ${tag} ${cache}${cacheAge ? `(${cacheAge}s)` : ""} clientMs=${ms} serverMs=${serverMs ?? "?"} trace=${serverTrace}${cacheStats ? ` stats=${cacheStats}` : ""}`,
      );
      if (cacheHeat) console.debug(`[ig-scraper] heatmap ${cacheHeat}`);
      // Strip server-side `_debug` payload before handing off to consumers / cache.
      let raw: InstaScrapeResult & { _debug?: unknown };
      try {
        raw = (await res.json()) as InstaScrapeResult & { _debug?: unknown };
      } catch (e: any) {
        const err = new Error(`Parse failed: ${e?.message || "invalid JSON"}`) as Error & {
          __trace?: { traceId: string; serverTraceId: string; status: number; url: string };
        };
        err.__trace = {
          traceId,
          serverTraceId: serverTrace,
          status: res.status,
          url: `${SUPABASE_URL}/functions/v1/instagram-scraper`,
        };
        throw err;
      }
      if (raw && "_debug" in raw) {
        if (raw._debug) console.debug(`[ig-scraper] _debug`, raw._debug);
        delete raw._debug;
      }
      return raw as InstaScrapeResult;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}


interface CacheEntry {
  cachedAt: number;
  data: InstaScrapeResult;
}

const readCache = (k: string): CacheEntry | null => {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const writeCache = (k: string, data: InstaScrapeResult) => {
  try {
    localStorage.setItem(k, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {}
};

// Helpers for merging "load more" batches into existing reels/posts arrays
// without introducing duplicates. Order is preserved (newer batch first).
const mergeUnique = <T extends { id?: string; code?: string }>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
): T[] => {
  const out: T[] = [];
  const seen = new Set<string>();
  // Dedupe by shortcode — numeric IG ids lose precision in JSON parsing.
  [...(existing ?? []), ...(incoming ?? [])].forEach((x) => {
    const key = String(x.code || x.id || "");
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(x);
  });
  return out;
};


export type FailureStep = "fetch" | "cache" | "parse";

export interface LoadFailure {
  step: FailureStep;
  message: string;
  traceId?: string;
  serverTraceId?: string;
  status?: number;
  url?: string;
  username?: string;
  type?: InstaScrapeType;
  at: number;
}

export function useInstagramData(usernameArg?: string, type: InstaScrapeType = "all") {
  const [username, setUsername] = useState<string | null>(
    () => usernameArg ?? getConnectedUsername()
  );
  const [data, setData] = useState<InstaScrapeResult | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const reqRef = useRef(0);

  // sync with localStorage changes / arg changes
  useEffect(() => {
    setUsername(usernameArg ?? getConnectedUsername());
    const onStorage = () => setUsername(usernameArg ?? getConnectedUsername());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [usernameArg]);

  const load = useCallback(
    async (force = false) => {
      if (!username) {
        setData(null);
        setCachedAt(null);
        return;
      }
      const key = getCacheKey(username, type);
      let cached: CacheEntry | null = null;
      try {
        cached = readCache(key);
      } catch (e: any) {
        setFailure({
          step: "cache",
          message: e?.message || "Cache read failed",
          username,
          type,
          at: Date.now(),
        });
      }
      const age = cached ? Date.now() - cached.cachedAt : Infinity;
      const fresh = cached && age < CACHE_SOFT_TTL_MS;
      const usableStale = cached && age < CACHE_HARD_TTL_MS;

      if (cached && usableStale) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
      }

      if (fresh && !force) return;
      const isBackground = !force && !!usableStale;

      const reqId = ++reqRef.current;
      if (!isBackground) setLoading(true);
      setError(null);
      try {
        const next = await fetchInstagramData(username, type, { force });
        if (reqRef.current !== reqId) return;
        try {
          writeCache(key, next);
        } catch (e: any) {
          setFailure({
            step: "cache",
            message: e?.message || "Cache write failed",
            username,
            type,
            at: Date.now(),
          });
        }
        try {
          setData(next);
          setCachedAt(Date.now());
          setFailure(null);
        } catch (e: any) {
          setFailure({
            step: "parse",
            message: e?.message || "Parse failed",
            username,
            type,
            at: Date.now(),
          });
          throw e;
        }
      } catch (e: any) {
        if (reqRef.current !== reqId) return;
        const meta = e?.__trace as
          | { traceId?: string; serverTraceId?: string; status?: number; url?: string }
          | undefined;
        if (!isBackground) {
          setError(e?.message || "Failed to load");
          setFailure({
            step: "fetch",
            message: e?.message || "Network request failed",
            traceId: meta?.traceId,
            serverTraceId: meta?.serverTraceId,
            status: meta?.status,
            url: meta?.url,
            username,
            type,
            at: Date.now(),
          });
        }
      } finally {
        if (reqRef.current === reqId && !isBackground) setLoading(false);
      }
    },
    [username, type]
  );

  // Load the next page of posts/reels using the cursor returned in `data`.
  const loadMore = useCallback(async () => {
    if (!username || !data || loadingMore) return;
    const cursor = data.reelsNextCursor || data.postsNextCursor || "";
    const hasMore = !!(data.reelsHasMore ?? data.postsHasMore ?? false);
    if (!cursor || !hasMore) return;

    setLoadingMore(true);
    try {
      const next = await fetchInstagramData(username, type, { cursor });
      const merged: InstaScrapeResult = {
        ...data,
        reels: mergeUnique(data.reels, next.reels),
        posts: mergeUnique(data.posts, next.posts),
        reelsNextCursor: next.reelsNextCursor ?? "",
        reelsHasMore: !!next.reelsHasMore,
        postsNextCursor: next.postsNextCursor ?? "",
        postsHasMore: !!next.postsHasMore,
      };
      const key = getCacheKey(username, type);
      writeCache(key, merged);
      setData(merged);
      setCachedAt(Date.now());
    } catch (e: any) {
      console.warn("[ig-scraper] loadMore failed", e?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [username, type, data, loadingMore]);

  useEffect(() => {
    load(false);
  }, [load]);

  const refetch = useCallback((force = true) => load(force), [load]);
  const dismissFailure = useCallback(() => setFailure(null), []);

  const hasMore = !!(data?.reelsHasMore ?? data?.postsHasMore ?? false);

  return {
    data,
    loading,
    loadingMore,
    error,
    failure,
    dismissFailure,
    refetch,
    loadMore,
    hasMore,
    username,
    cachedAt,
  };
}

export const proxyIgImage = (url?: string | null): string => {
  if (!url) return "";
  // Media URLs are persisted locally after cloning. Keep this transform
  // idempotent so a restored proxy URL is never wrapped in another proxy URL
  // (the outer request would reject the backend hostname with a 403).
  if (url.includes("/functions/v1/ig-image-proxy?url=")) return url;
  if (!/cdninstagram\.com|fbcdn\.net|instagram\.com|socialhubapi\.com|clipssaver\.com/.test(url)) return url;
  const base = SUPABASE_URL || (PROJECT_ID ? `https://${PROJECT_ID}.supabase.co` : "");
  return `${base}/functions/v1/ig-image-proxy?url=${encodeURIComponent(url)}`;
};

export const formatCount = (n: number): string => {
  if (!n || n < 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
};

export interface AggregateInsights {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  interactions: number;
  contentShared: number;
  followers: number;
  following: number;
  postsCount: number;
}

export const aggregateInsights = (d?: InstaScrapeResult | null): AggregateInsights => {
  const reels = d?.reels ?? [];
  const posts = d?.posts ?? [];
  const all = [...reels, ...posts];
  const sum = (k: keyof InstaReel) => all.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const views = sum("views");
  const likes = sum("likes");
  const comments = sum("comments");
  const shares = sum("shares");
  return {
    views,
    likes,
    comments,
    shares,
    interactions: likes + comments + shares,
    contentShared: all.length,
    followers: d?.profile?.followers ?? 0,
    following: d?.profile?.following ?? 0,
    postsCount: d?.profile?.postsCount ?? 0,
  };
};
