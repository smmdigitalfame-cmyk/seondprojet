import { mockAccounts, currentUser, saveProfileOverrides, type PostItem } from "@/data/mockData";
import { fetchInstagramData, proxyIgImage, setConnectedUsername, beginPriorityFetch, endPriorityFetch, type InstaScrapeResult } from "@/lib/instagramApi";
import { saveReelsData, loadReelsData, type ExtendedPostItem } from "@/data/reelInsightsData";
import { isMediaUrlExpired } from "@/lib/mediaExpiry";

const MAX_REELS = 350;
let activeCloneToken = 0;

const mediaIdentity = (item: InstaScrapeResult["posts"] extends (infer T)[] | undefined ? T : never, index: number) => {
  const code = String((item as any)?.code || "").trim();
  if (code) return code;
  const stableParts = [
    String((item as any)?.videoUrl || "").split("?")[0],
    String((item as any)?.thumbnail || "").split("?")[0],
    String((item as any)?.takenAt || ""),
  ].filter(Boolean).join("|");
  if (!stableParts) return `media-${index}`;
  let hash = 2166136261;
  for (let i = 0; i < stableParts.length; i += 1) {
    hash ^= stableParts.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `media-${(hash >>> 0).toString(36)}`;
};

/**
 * Clone a real Instagram account's data into the local mock store
 * so the existing UI (Home/Profile/Reels) shows it without any UI changes.
 */
const AVATAR_CACHE_KEY = "ig_avatar_data_v1";

/**
 * Signed Instagram/CDN avatar links expire after a while, which left a broken
 * picture on the profile and bottom bar. Keep a tiny permanent copy instead.
 */
async function toPermanentAvatar(url: string): Promise<string | null> {
  if (!url || url.startsWith("data:")) return null;
  try {
    const res = await fetch(proxyIgImage(url) || url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") || blob.size > 400_000) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function getCachedAvatar(username: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(AVATAR_CACHE_KEY) || "{}");
    return map[username.toLowerCase()] || null;
  } catch {
    return null;
  }
}

function setCachedAvatar(username: string, dataUrl: string) {
  try {
    const map = JSON.parse(localStorage.getItem(AVATAR_CACHE_KEY) || "{}");
    // Keep only a handful of recent accounts.
    const next: Record<string, string> = { [username.toLowerCase()]: dataUrl };
    Object.entries(map).slice(0, 5).forEach(([k, v]) => { if (!(k in next)) next[k] = v as string; });
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(next));
  } catch {}
}

/**
 * Clone a real Instagram account's data into the local mock store
 * so the existing UI (Home/Profile/Reels) shows it without any UI changes.
 *
 * Two steps run together: a quick request (profile + newest posts, a few
 * seconds) is shown immediately, and the full list (up to 350) replaces it in
 * the background as soon as it arrives.
 */
export async function cloneInstagramAccount(
  usernameRaw: string,
  options: { force?: boolean } = {},
): Promise<InstaScrapeResult> {
  const cloneToken = ++activeCloneToken;
  const username = usernameRaw.trim().replace(/^@/, "");
  beginPriorityFetch();

  const fetchFull = async (): Promise<InstaScrapeResult> => {
    let data = await fetchInstagramData(username, "all", { pages: 30, force: options.force });
    // If the provider answered without view counts for most videos, ask once
    // more for a fresh copy so the grid does not show 0 on every reel.
    const videoItems = (data.reels ?? []).filter((m: any) => !!m.videoUrl);
    const zeroViews = videoItems.filter((m: any) => !(Number(m.views) > 0)).length;
    if (!options.force && videoItems.length >= 3 && zeroViews / videoItems.length > 0.5) {
      try {
        const retry = await fetchInstagramData(username, "all", { pages: 30, force: true });
        const retryVideos = (retry.reels ?? []).filter((m: any) => !!m.videoUrl);
        const retryZero = retryVideos.filter((m: any) => !(Number(m.views) > 0)).length;
        if (retry.profile?.username && retryVideos.length && retryZero < zeroViews) data = retry;
      } catch {}
    }
    return data;
  };

  const fullPromise = fetchFull();
  fullPromise.finally(endPriorityFetch).catch(() => {});
  const quickPromise = options.force
    ? null
    : fetchInstagramData(username, "all", { pages: 1 }).catch(() => null);

  type Winner = { kind: "full"; data: InstaScrapeResult } | { kind: "quick"; data: InstaScrapeResult | null };
  const first: Winner = quickPromise
    ? await Promise.race([
        fullPromise.then((data) => ({ kind: "full" as const, data })),
        quickPromise.then((data) => ({ kind: "quick" as const, data })),
      ])
    : { kind: "full", data: await fullPromise };

  if (first.kind === "quick" && first.data?.profile?.username && Number(first.data.profile.followers) > 0 && ((first.data.reels?.length || 0) + (first.data.posts?.length || 0) > 0 || !first.data.profile.postsCount)) {
    applyCloneData(first.data, cloneToken);
    // Full list continues in the background and replaces the quick preview.
    fullPromise
      .then((full) => {
        if (cloneToken !== activeCloneToken || !full.profile?.username) return;
        try { applyCloneData(full, cloneToken); } catch {}
      })
      .catch(() => {});
    return first.data;
  }

  const full = first.kind === "full" ? first.data : await fullPromise;
  applyCloneData(full, cloneToken);
  return full;
}

function applyCloneData(data: InstaScrapeResult, cloneToken: number) {
  const p = data.profile;
  if (!p?.username) throw new Error("Account not found");
  const username = p.username;
  if (cloneToken !== activeCloneToken) throw new Error("Newer search is already loading.");

  // The scraper endpoint is already scoped to the requested username. Some
  // providers expose an uploader/display-name field as `username`, which is
  // not always the profile handle; filtering on it removed every valid item
  // and left a profile with correct stats but an empty grid.
  const reels = data.reels ?? [];
  const posts = data.posts ?? [];
  const highlights = data.highlights ?? [];

  if (p.postsCount > 0 && reels.length === 0 && posts.length === 0) {
    throw new Error(`Media for @${p.username} could not be loaded. Please try again.`);
  }

  // Merge reels first (real view counts) then posts, dedupe by shortcode.
  // Numeric IG ids lose precision through JSON parsing → never dedupe by id.
  const seen = new Set<string>();
  const merged: typeof posts = [];
  for (const [itemIndex, item] of [...reels, ...posts].entries()) {
    const key = mediaIdentity(item, itemIndex);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);

    merged.push(item);
  }
  // Keep newest media first even when one provider omitted a timestamp.
  // Unknown dates are placed last instead of disabling sorting for everything.
  merged.sort((a, b) => {
    const aTime = Number((a as any).takenAt) || 0;
    const bTime = Number((b as any).takenAt) || 0;
    if (aTime === bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return bTime - aTime;
  });
  // Photo posts mislabelled as videos (image URL in videoUrl) must not be
  // treated as reels — they have no public view count.
  for (const m of merged as any[]) {
    const v = String(m.videoUrl || "").split("?")[0].toLowerCase();
    if (v && /\.(jpe?g|png|webp|heic|avif)$/.test(v)) { m.videoUrl = ""; m.isVideo = false; }
  }
  const combined = merged.slice(0, MAX_REELS);

  const postItems: PostItem[] = combined.map((m) => ({
    thumbnail: proxyIgImage(m.thumbnail) || m.thumbnail,
    // Keep video on its direct CDN URL. Sending every byte-range request through
    // the image proxy adds a cold-start and makes opening a reel feel stuck.
    videoUrl: m.videoUrl || undefined,
  }));

  const reelItems: ExtendedPostItem[] = combined.map((m, index) => {
    // Use ONLY real scraped values — no random fallback. If a field is missing
    // from the scraper, keep it at 0 so the UI shows the truth.
    const views = Math.max(0, Number(m.views) || 0);
    const likes = Math.max(0, Number(m.likes) || 0);
    const comments = Math.max(0, Number(m.comments) || 0);
    const scrapedShares = Math.max(0, Number(m.shares) || 0);

    // Never invent private metrics. Public sources usually omit these values;
    // display zero unless the scraper explicitly returned a real value.
    const saves = 0;
    const shares = scrapedShares;
    const reposts = Math.max(0, Number((m as any).reposts) || 0);
    return {
      sourceId: mediaIdentity(m, index),
      thumbnail: proxyIgImage(m.thumbnail) || m.thumbnail,
      videoUrl: m.videoUrl || undefined,
      videoFallbackUrl: m.videoUrl ? (proxyIgImage(m.videoUrl) || undefined) : undefined,
      sourceUsername: p.username,
      caption: m.caption || "",
      duration: m.duration ? String(m.duration) : undefined,
      musicTitle: m.code ? `Original audio · ${p.username}` : "",
      musicIcon: proxyIgImage(p.avatarUrl) || p.avatarUrl || currentUser.avatar,
      insights: {
        views,
        likes,
        comments,
        shares,
        reposts,
        saves,
        watchTime: "0m",
        avgWatchTime: "0s",
        followerViewsPct: 0,
        viewRatePast3Sec: 0,
        genderMale: 0,
        genderFemale: 0,
        countries: [],
        ageGroups: [],
        sources: [],
        accountsReached: views,
        follows: 0,
        viewsOverTime: [],
        skipRate: 0,
        typicalSkipRate: 0,
      },
    };
  });

  // Apply to the owned account slot. That slot may have been renamed by the
  // profile editor, so relying only on the original key makes a successful
  // scrape appear to do nothing in the UI.
  // We REPLACE posts entirely (no padding from previous account) to avoid leakage.
  // Accounts with 0/1 posts are valid — profile must still load and persist.
  const realPosts = p.postsCount || 0;
  const realFollowers = p.followers || 0;
  const realFollowing = p.following || 0;
  const profilePatch = {
    username: p.username,
    fullName: p.fullName || p.username,
    // Avatar CDN links from the scraper load directly; skipping the proxy avoids
    // a slow/failed extra hop that left the old picture visible on phones.
    avatar: getCachedAvatar(p.username) || (/socialhubapi\.com/.test(p.avatarUrl || "") ? p.avatarUrl : proxyIgImage(p.avatarUrl)) || p.avatarUrl || currentUser.avatar,
    bio: p.bio || "",
    posts: realPosts || postItems.length,
    followers: realFollowers,
    following: realFollowing,
    isVerified: !!p.isVerified,
    website: p.externalUrl || "",
  };

  // The owned profile can live under several keys: the original slot, a key
  // renamed by the profile editor, or a copy recreated from saved edits after a
  // refresh. Patch every one of them, otherwise the visible profile kept the old
  // photo/name/followers while only the videos changed.
  let activeKey = "";
  try { activeKey = localStorage.getItem("ig_active_profile_username") || ""; } catch {}
  const prevOwnedName = (currentUser.username || "").toLowerCase();
  const ownedKeys = Object.entries(mockAccounts)
    .filter(([key, account]) =>
      key === "just4abhii" ||
      key === activeKey ||
      account.profile === currentUser ||
      account.profile.username.toLowerCase() === prevOwnedName ||
      key.toLowerCase() === prevOwnedName,
    )
    .map(([key]) => key);
  if (!ownedKeys.length && mockAccounts["just4abhii"]) ownedKeys.push("just4abhii");
  const slotKey = (activeKey && ownedKeys.includes(activeKey)) ? activeKey : (ownedKeys[0] ?? "just4abhii");
  const fmt = (n: number) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  };
  for (const key of ownedKeys) {
    const slot = mockAccounts[key];
    if (!slot) continue;
    Object.assign(slot.profile, profilePatch);
    slot.posts = postItems;
    (slot as any).postsDisplay = fmt(realPosts || postItems.length);
    (slot as any).followersDisplay = fmt(realFollowers);
    (slot as any).followingDisplay = fmt(realFollowing);
    (slot as any).dashboardViews = undefined;
    slot.highlights = highlights.length
      ? highlights.slice(0, 8).map((h) => ({
          name: h.name || "Highlight",
          image: proxyIgImage(h.image) || h.image,
        }))
      : [];
    slot.category = p.category || "";
  }

  // Mirror onto currentUser (live reference in many screens)
  Object.assign(currentUser, profilePatch);

  setConnectedUsername(p.username);

  // Save locally before any network sync so the visible profile/reels switch
  // together and never temporarily falls back to another username's videos.
  saveReelsData(reelItems);
  saveProfileOverrides();

  // Notify any listeners
  try {
    window.dispatchEvent(new CustomEvent("ig-account-cloned", {
      // Carry the fresh in-memory result too. Mobile browsers can reject a
      // large localStorage write; re-reading storage in that case showed the
      // previous account's reels even though the clone itself succeeded.
      detail: { username: p.username, slotKey, reels: reelItems },
    }));
  } catch {}

  // Replace the expiring avatar link with a permanent tiny copy.
  void toPermanentAvatar(p.avatarUrl).then((dataUrl) => {
    if (!dataUrl || cloneToken !== activeCloneToken) return;
    setCachedAvatar(username, dataUrl);
    for (const key of ownedKeys) {
      const slot = mockAccounts[key];
      if (slot) slot.profile.avatar = dataUrl;
    }
    currentUser.avatar = dataUrl;
    saveProfileOverrides();
    try {
      window.dispatchEvent(new CustomEvent("ig-avatar-updated", { detail: { username, avatar: dataUrl } }));
    } catch {}
  });
}

let mediaRefreshAt = 0;
let mediaRefreshRunning = false;

/**
 * Cloned reels keep signed Instagram links that stop working after a few
 * hours, which turned every thumbnail into "No preview". When the stored links
 * have expired, quietly fetch fresh links for the connected account and swap
 * only the media (matched by stable sourceId). Edited stats stay untouched;
 * a missing (0) public count is filled from the fresh data.
 */
export async function refreshExpiredReelMedia(): Promise<boolean> {
  if (mediaRefreshRunning || Date.now() - mediaRefreshAt < 10 * 60_000) return false;
  let username = "";
  try { username = localStorage.getItem("ig_connected_username") || ""; } catch {}
  if (!username || (currentUser.username || "").toLowerCase() !== username.toLowerCase()) return false;
  const reels = loadReelsData();
  const needsRefresh = (r: ExtendedPostItem) =>
    isMediaUrlExpired(r.thumbnail) || isMediaUrlExpired(r.videoUrl);
  if (!reels.some(needsRefresh)) return false;

  mediaRefreshRunning = true;
  mediaRefreshAt = Date.now();
  const token = activeCloneToken;
  try {
    let data = await fetchInstagramData(username, "all", { pages: 30, background: true });
    const firstThumb = [...(data.reels ?? []), ...(data.posts ?? [])][0]?.thumbnail;
    if (!firstThumb || isMediaUrlExpired(proxyIgImage(firstThumb) || firstThumb)) {
      data = await fetchInstagramData(username, "all", { pages: 30, force: true, background: true });
    }
    if (token !== activeCloneToken) return false;
    if ((data.profile?.username || "").toLowerCase() !== username.toLowerCase()) return false;
    const fresh = new Map<string, any>();
    [...(data.reels ?? []), ...(data.posts ?? [])].forEach((m, i) => fresh.set(mediaIdentity(m, i), m));

    const urlSwap = new Map<string, string>();
    let changed = 0;
    const next = reels.map((reel) => {
      const m = reel.sourceId ? fresh.get(reel.sourceId) : undefined;
      if (!m) return reel;
      const copy: ExtendedPostItem = { ...reel, insights: { ...reel.insights } };
      if (isMediaUrlExpired(reel.thumbnail) && m.thumbnail) {
        const t = proxyIgImage(m.thumbnail) || m.thumbnail;
        if (reel.thumbnail) urlSwap.set(reel.thumbnail, t);
        copy.thumbnail = t;
        changed++;
      }
      if (m.videoUrl && (isMediaUrlExpired(reel.videoUrl) || !reel.videoUrl)) {
        if (reel.videoUrl) urlSwap.set(reel.videoUrl, m.videoUrl);
        copy.videoUrl = m.videoUrl;
        copy.videoFallbackUrl = proxyIgImage(m.videoUrl) || undefined;
        changed++;
      }
      // Never let a missing count stay 0 when the fresh data has the real one.
      const ins: any = copy.insights;
      if (!(Number(ins.views) > 0) && Number(m.views) > 0) { ins.views = Number(m.views); if (!(Number(ins.accountsReached) > 0)) ins.accountsReached = Number(m.views); }
      if (!(Number(ins.likes) > 0) && Number(m.likes) > 0) ins.likes = Number(m.likes);
      if (!(Number(ins.comments) > 0) && Number(m.comments) > 0) ins.comments = Number(m.comments);
      return copy;
    });
    if (!changed) return false;

    // Grid tiles on Home/Profile were built from the same links.
    Object.values(mockAccounts).forEach((acc) => {
      if (acc.profile !== currentUser && acc.profile.username.toLowerCase() !== username.toLowerCase()) return;
      acc.posts = acc.posts.map((p) => ({
        ...p,
        thumbnail: urlSwap.get(p.thumbnail) || p.thumbnail,
        videoUrl: p.videoUrl ? urlSwap.get(p.videoUrl) || p.videoUrl : p.videoUrl,
      }));
    });
    saveReelsData(next);
    saveProfileOverrides();
    try { window.dispatchEvent(new CustomEvent("reel-insights-updated", { detail: { reason: "media-refresh" } })); } catch {}
    return true;
  } catch {
    // Try again later instead of every screen change.
    return false;
  } finally {
    mediaRefreshRunning = false;
  }
}

/**
 * Older clones stored a signed avatar link that has since expired. On app open,
 * quietly fetch the connected account's current photo once and keep a
 * permanent copy, so the profile picture never shows as broken.
 */
export async function refreshConnectedAvatar(): Promise<void> {
  const current = currentUser.avatar || "";
  if (current.startsWith("data:")) return;
  let username = "";
  try { username = localStorage.getItem("ig_connected_username") || ""; } catch {}
  if (!username) return;
  const cached = getCachedAvatar(username);
  let dataUrl = cached;
  if (!dataUrl) {
    try {
      const d = await fetchInstagramData(username, "all", { pages: 1, background: true });
      if (!d.profile?.avatarUrl) return;
      dataUrl = await toPermanentAvatar(d.profile.avatarUrl);
    } catch {
      return;
    }
  }
  if (!dataUrl || (currentUser.username || "").toLowerCase() !== username.toLowerCase()) return;
  setCachedAvatar(username, dataUrl);
  const prev = currentUser.avatar;
  Object.values(mockAccounts).forEach((acc) => {
    if (acc.profile === currentUser || acc.profile.avatar === prev) acc.profile.avatar = dataUrl!;
  });
  currentUser.avatar = dataUrl;
  saveProfileOverrides();
  try {
    window.dispatchEvent(new CustomEvent("ig-avatar-updated", { detail: { username, avatar: dataUrl } }));
  } catch {}
}
