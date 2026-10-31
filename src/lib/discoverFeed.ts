import { useEffect, useMemo, useState } from "react";
import { fetchInstagramData, proxyIgImage } from "@/lib/instagramApi";

export const DISCOVER_USERNAMES = [
  "selenagomez",
  "therock",
  "kyliejenner",
  "arianagrande",
  "kimkardashian",
  "mrbeast",
  "realdonaldtrump",
  "cristiano",
  "leomessi",
  "theclips.agency",
  "getclipify",
  "jannatzubair29",
  "anushkasen0408",
  "bhuvan.bam22",
  "avneetkaur_13",
  "mostlysane",
  "lelepons",
  "ashishchanchlani",
  "barkhasingh03",
  "ahsaaschanna_",
];

// Cached records contain short-lived signed CDN URLs. Keeping this cache for a
// year made story/profile images permanently broken after the signatures
// expired. The version bump immediately drops those stale records on devices.
const CACHE_KEY = "discover_feed_v6_celebs";
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface DiscoverProfile {
  username: string;
  fullName: string;
  avatar: string;
  isVerified: boolean;
}

export interface DiscoverPost {
  id: string;
  profile: DiscoverProfile;
  caption: string;
  thumbnail: string;
  videoUrl?: string;
  videoFallbackUrl?: string;
  likes: number;
  comments: number;
  shares: number;
  reposts: number;
  views: number;
  takenAt: number;
  timeAgo: string;
}

export interface DiscoverReel extends DiscoverPost {
  videoUrl: string;
}

interface DiscoverCache {
  fetchedAt: number;
  posts: DiscoverPost[];
  reels: DiscoverReel[];
}

const timeAgo = (takenAt: number): string => {
  if (!takenAt) return "recently";
  const ms = Date.now() - takenAt * (takenAt < 1e12 ? 1000 : 1);
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  return `${Math.floor(d / 30)}mo`;
};

const seededShuffle = <T,>(arr: T[], seed: number): T[] => {
  const a = arr.slice();
  let s = (seed | 0) || 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const dailySeed = (): number => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

// Run at most N background scrapes at once so user-initiated clones are never
// starved by the browser's per-origin connection limit.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/** Extracts posts/reels for a single scraped account. */
function extractAccount(
  d: any,
  i: number,
): { posts: DiscoverPost[]; reels: DiscoverReel[] } {
  const posts: DiscoverPost[] = [];
  const reels: DiscoverReel[] = [];
  const p = d?.profile;
  if (!p?.username) return { posts, reels };
  const profile: DiscoverProfile = {
    username: p.username,
    fullName: p.fullName || p.username,
    avatar: proxyIgImage(p.avatarUrl) || p.avatarUrl || "",
    isVerified: !!p.isVerified,
  };

  (d.posts ?? []).slice(0, 8).forEach((m: any, idx: number) => {
    const thumb = proxyIgImage(m.thumbnail) || m.thumbnail;
    if (!thumb) return;
    const likes = Math.max(0, Number(m.likes) || 0);
    const rawViews = Math.max(0, Number(m.views) || 0);
    const views = rawViews;
    posts.push({
      id: `${profile.username}_p_${m.id || m.code || idx}`,
      profile,
      caption: m.caption || "",
      thumbnail: thumb,
      videoUrl: m.videoUrl || undefined,
      videoFallbackUrl: m.videoUrl ? proxyIgImage(m.videoUrl) : undefined,
      likes,
      comments: Math.max(0, Number(m.comments) || 0),
      shares: Math.max(0, Number(m.shares) || 0),
      reposts: Math.max(0, Number(m.reposts) || 0),
      views,
      takenAt: Number(m.takenAt) || 0,
      timeAgo: timeAgo(Number(m.takenAt) || 0),
    });
  });

  (d.reels ?? []).slice(0, 8).forEach((m: any, idx: number) => {
    const videoUrl = m.videoUrl || "";
    if (!videoUrl) return;
    const thumb = proxyIgImage(m.thumbnail) || m.thumbnail || "";
    const likes = Math.max(0, Number(m.likes) || 0);
    const rawViews = Math.max(0, Number(m.views) || 0);
    const views = rawViews;
    reels.push({
      id: `${profile.username}_r_${m.id || m.code || idx}`,
      profile,
      caption: m.caption || "",
      thumbnail: thumb,
      videoUrl,
      videoFallbackUrl: proxyIgImage(videoUrl) || undefined,
      likes,
      comments: Math.max(0, Number(m.comments) || 0),
      shares: Math.max(0, Number(m.shares) || 0),
      reposts: Math.max(0, Number(m.reposts) || 0),
      views,
      takenAt: Number(m.takenAt) || 0,
      timeAgo: timeAgo(Number(m.takenAt) || 0),
    });
  });

  return { posts, reels };
}

async function fetchDiscoverData(
  onPartial?: (snapshot: DiscoverCache) => void,
): Promise<DiscoverCache> {
  const posts: DiscoverPost[] = [];
  const reels: DiscoverReel[] = [];
  // Emitting on every finished account re-shuffled and re-rendered the whole
  // feed 20+ times, which is what made scrolling stutter while data loaded.
  // Throttle snapshots so the UI updates smoothly instead.
  let lastEmit = 0;
  let emitted = false;
  const pushSnapshot = (final = false) => {
    const now = Date.now();
    if (!final && emitted && now - lastEmit < 1500) return;
    lastEmit = now;
    emitted = true;
    onPartial?.({ fetchedAt: now, posts: [...posts], reels: [...reels] });
  };

  const scrape = async (u: string, i: number) => {
    try {
      const d = await fetchInstagramData(u, "all", {
        pages: 1,
        background: true,
      });
      const part = extractAccount(d, i);
      if (!part.posts.length && !part.reels.length) return;
      posts.push(...part.posts);
      reels.push(...part.reels);
      // First account lands immediately; later ones are batched.
      pushSnapshot(!emitted);
    } catch (e: any) {
      console.warn("[discover] fail", u, e?.message);
    }
  };

  // Two waves: the first few accounts fill the story bar + first screen of
  // posts quickly, the rest trickle in slowly so a user-initiated clone always
  // has free sockets (that was the main cause of slow account cloning).
  const HEAD = 6;
  await mapLimit(DISCOVER_USERNAMES.slice(0, HEAD), 6, (u, i) => scrape(u, i));
  pushSnapshot(true);
  await mapLimit(DISCOVER_USERNAMES.slice(HEAD), 3, (u, i) => scrape(u, i + HEAD));

  return { fetchedAt: Date.now(), posts, reels };
}

let inflight: Promise<DiscoverCache> | null = null;

/** Subscribers that receive progressive snapshots while scraping runs. */
const listeners = new Set<(c: DiscoverCache) => void>();
let latest: DiscoverCache | null = null;

const emit = (c: DiscoverCache) => {
  latest = c;
  listeners.forEach((l) => {
    try {
      l(c);
    } catch {}
  });
};

export function subscribeDiscover(fn: (c: DiscoverCache) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reads whatever is stored locally, regardless of age. */
function readStoredCache(): { cache: DiscoverCache; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: DiscoverCache = JSON.parse(raw);
    if (!cached || !(cached.posts?.length || cached.reels?.length)) return null;
    return { cache: cached, fresh: Date.now() - cached.fetchedAt < CACHE_TTL_MS };
  } catch {
    return null;
  }
}

function startRefresh(): Promise<DiscoverCache> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await fetchDiscoverData((snap) => emit(snap));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {}
      emit(data);
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Background revalidation must never compete with the first paint or with a
 * user-initiated clone, so it waits for the main thread to be idle.
 */
function scheduleRefresh() {
  if (inflight) return;
  const run = () => void startRefresh();
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(run, { timeout: 3000 });
  else setTimeout(run, 800);
}

/**
 * Stale-while-revalidate: returns cached data instantly (even if expired) and
 * refreshes in the background, pushing progressive updates to subscribers.
 */
export function loadDiscover(_force = false): Promise<DiscoverCache> {
  // Paid scraper calls are only made when a user searches a username, so the
  // Home feed never fetches on its own; it keeps showing what is stored.
  if (latest) return Promise.resolve(latest);
  const stored = readStoredCache();
  if (stored) {
    latest = stored.cache;
    return Promise.resolve(stored.cache);
  }
  return Promise.resolve({ fetchedAt: Date.now(), posts: [], reels: [] });
}

/** Shared hook body: instant cache + live progressive updates. */
function useDiscoverCache() {
  const [cache, setCache] = useState<DiscoverCache | null>(
    () => latest ?? readStoredCache()?.cache ?? null,
  );
  const [loading, setLoading] = useState(() => !latest && !readStoredCache());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsub = subscribeDiscover((c) => {
      if (!cancelled) {
        setCache(c);
        setLoading(false);
      }
    });
    (async () => {
      try {
        const d = await loadDiscover();
        if (!cancelled) setCache((prev) => (prev && prev.fetchedAt >= d.fetchedAt ? prev : d));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load feed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { cache, loading, error };
}

/** Bumped by pull-to-refresh so the feed order actually changes. */
let feedSeedOffset = 0;

/** Force a fresh scrape + reshuffle (pull-to-refresh on Home). */
export async function refreshDiscover(): Promise<void> {
  feedSeedOffset += 1;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
  await startRefresh();
}

export function useDiscoverFeed() {
  const { cache, loading, error } = useDiscoverCache();
  const posts = useMemo(
    () => seededShuffle(cache?.posts ?? [], dailySeed() + feedSeedOffset * 977),
    [cache],
  );
  return { posts, loading: loading && posts.length === 0, error };
}

export function useDiscoverReels() {
  const { cache, loading, error } = useDiscoverCache();
  const reels = useMemo(
    () => seededShuffle(cache?.reels ?? [], dailySeed() + 7),
    [cache],
  );
  return { reels, loading: loading && reels.length === 0, error };
}

// ─── Stories ────────────────────────────────────────────────────────────────
export interface DiscoverStory {
  id: string;
  username: string;
  avatar: string;
  hasStory: true;
  isVerified?: boolean;
  /** A real reel clip from this account, played (with audio) in the story viewer. */
  videoUrl?: string;
  videoFallbackUrl?: string;
  poster?: string;
}

const STORIES_CACHE_KEY = "discover_stories_v5_celebs";

interface StoriesCache {
  fetchedAt: number;
  stories: DiscoverStory[];
}

const buildStoriesFromCache = (cache: DiscoverCache): DiscoverStory[] => {
  const byUser = new Map<string, DiscoverStory>();
  const collect = (profile: DiscoverProfile) => {
    const u = profile.username.toLowerCase();
    if (byUser.has(u)) return;
    byUser.set(u, {
      id: `story_${u}`,
      username: profile.username,
      avatar: profile.avatar,
      hasStory: true,
      isVerified: profile.isVerified,
    });
  };
  cache.posts.forEach((p) => collect(p.profile));
  cache.reels.forEach((r) => collect(r.profile));

  // Attach a real video clip per account so stories actually play something.
  const attach = (username: string, videoUrl?: string, poster?: string, videoFallbackUrl?: string) => {
    if (!videoUrl) return;
    const entry = byUser.get(username.toLowerCase());
    if (entry && !entry.videoUrl) {
      entry.videoUrl = videoUrl;
      entry.videoFallbackUrl = videoFallbackUrl;
      entry.poster = poster;
    }
  };
  cache.reels.forEach((r) => attach(r.profile.username, r.videoUrl, r.thumbnail, r.videoFallbackUrl));
  cache.posts.forEach((p) => attach(p.profile.username, p.videoUrl, p.thumbnail, p.videoFallbackUrl));

  // Preserve curated order when possible
  const orderIdx = new Map(
    DISCOVER_USERNAMES.map((u, i) => [u.toLowerCase(), i] as const),
  );
  return Array.from(byUser.values()).sort(
    (a, b) =>
      (orderIdx.get(a.username.toLowerCase()) ?? 99) -
      (orderIdx.get(b.username.toLowerCase()) ?? 99),
  );
};


let lastStoriesSignature = "";

export function useDiscoverStories() {
  const { cache, loading } = useDiscoverCache();

  const stories = useMemo(() => {
    // Prefer live cache; fall back to the last persisted story list so avatars
    // and usernames are visible instantly on app open.
    let all = cache ? buildStoriesFromCache(cache) : [];
    if (all.length === 0) {
      try {
        const raw = localStorage.getItem(STORIES_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StoriesCache;
          const stale = Date.now() - (parsed?.fetchedAt || 0) > CACHE_TTL_MS;
          // Signed CDN clip URLs expire; keeping them makes the story viewer
          // spin forever. Show the avatar-only story instead until refresh.
          all = (parsed?.stories ?? []).map((s) =>
            stale ? { ...s, videoUrl: undefined, videoFallbackUrl: undefined } : s,
          );
        }
      } catch {}
    } else {
      // Persist only when the story list actually changed — writing a JSON
      // blob on every progressive snapshot blocked the main thread.
      const signature = all.map((s) => `${s.username}:${s.videoUrl ? 1 : 0}`).join(",");
      if (signature !== lastStoriesSignature) {
        lastStoriesSignature = signature;
        try {
          localStorage.setItem(
            STORIES_CACHE_KEY,
            JSON.stringify({ fetchedAt: Date.now(), stories: all } satisfies StoriesCache),
          );
        } catch {}
      }
    }
    // Stable, curated order — stories must not re-shuffle into random people
    // every render/refresh.
    return all;
  }, [cache]);

  return { stories, loading: loading && stories.length === 0 };
}
