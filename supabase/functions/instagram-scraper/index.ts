// ---------------------------------------------------------------------------
// Instagram Scraper Edge Function
// Data sources:
//   FALLBACK ClipsSaver: https://clipssaver.com/api/instagram/instagramDownloader
//   PRIMARY  w-ig-eight: https://w-ig-eight.vercel.app (/info /reels /posts)
//   FALLBACK IG public web feed / RapidAPI / Vercel w-ig / Railway
//   RAPIDAPI instagram120 (preferred when configured): userInfo + posts + reels
//   PRIMARY /info  : https://w-ig-fudt.vercel.app/info?username=<u>
//   PRIMARY /posts : https://w-ig-fudt.vercel.app/posts?username=<u>
//   LEGACY fallback: https://instaprofile-production.up.railway.app/api/profile?username=<u>
//
// Client contract (unchanged so the existing frontend keeps working):
//   POST { username, type?, force?, cursor? }
//   headers: x-access-key, x-device-fp
//   → { username, profile, reels[], posts[], highlights[] }
// ---------------------------------------------------------------------------

import { parseProfileHtml, profileCounts } from "./profileCounts.ts";
import { unavailableResult } from "./resultStatus.ts";
import { zylaPagination, zylaMedia } from "./zylaPagination.ts";
import { ZylaProviderError, zylaFailure, preserveZylaFailure } from "./zylaError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trace-id, x-access-key, x-device-fp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-trace-id, x-cache, x-cache-age, x-duration-ms",
};

const SUPABASE_URL_ENV = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY") ?? "";
const RAPIDAPI_HOST = Deno.env.get("RAPIDAPI_HOST") || "instagram120.p.rapidapi.com";

const PRIMARY_BASE = "https://w-ig-fudt.vercel.app";
const LEGACY_URL = "https://instaprofile-production.up.railway.app/api/profile";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

const PRIMARY_TIMEOUT_MS = 25_000;
const RAPIDAPI_TIMEOUT_MS = 22_000;
const LEGACY_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000; // 60 s in-memory cache per username
const KEY_CACHE_TTL_MS = 30_000;

// ---- tiny helpers ----------------------------------------------------------
const newTraceId = () =>
  Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 8);

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const maskKey = (k: string) =>
  !k ? "" : k.length <= 8 ? k[0] + "•••" + k.slice(-1) : `${k.slice(0, 4)}••••${k.slice(-4)}`;

// ---- access-key gate -------------------------------------------------------
const KEY_CACHE = new Map<string, { ok: boolean; at: number; label?: string }>();

// Keys created by the bot live on the primary key server; fall back to it when
// the local lookup rejects, so every app URL accepts the same keys.
const PRIMARY_KEY_SERVER = "https://xkgjifugwislpbczoduy.supabase.co/functions/v1/";
const PRIMARY_OK = new Map<string, number>();

async function validateAccessKey(
  key: string,
  fp: string,
): Promise<{ ok: boolean; reason?: string; label?: string; keyMasked?: string }> {
  const local = await validateAccessKeyLocal(key, fp);
  if (local.ok || !key || !fp) return local;
  if (SUPABASE_URL_ENV?.includes("xkgjifugwislpbczoduy")) return local;
  const cacheKey = `${key}::${fp}`;
  const okAt = PRIMARY_OK.get(cacheKey);
  if (okAt && Date.now() - okAt < 5 * 60_000) return { ok: true, label: "User", keyMasked: maskKey(key) };
  try {
    const r = await fetch(PRIMARY_KEY_SERVER + "check-key-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceFingerprint: fp }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.valid !== false) {
      PRIMARY_OK.set(cacheKey, Date.now());
      return { ok: true, label: "User", keyMasked: maskKey(key) };
    }
    const code = String(d?.code || "");
    if (["invalid_key", "deactivated", "expired"].includes(code)) return { ok: false, reason: code };
  } catch (_) { /* keep local result */ }
  return local;
}

async function validateAccessKeyLocal(
  key: string,
  fp: string,
): Promise<{ ok: boolean; reason?: string; label?: string; keyMasked?: string }> {
  if (!key || !fp) return { ok: false, reason: "missing_credentials" };
  if (!SUPABASE_URL_ENV || !SUPABASE_SRK) return { ok: false, reason: "server_misconfig" };

  const cacheKey = `${key}::${fp}`;
  const cached = KEY_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < KEY_CACHE_TTL_MS) {
    return cached.ok
      ? { ok: true, label: cached.label, keyMasked: maskKey(key) }
      : { ok: false, reason: "cached_reject" };
  }

  try {
    const url =
      `${SUPABASE_URL_ENV}/rest/v1/access_keys?key=eq.${encodeURIComponent(key)}` +
      `&select=active,expires_at,device_fingerprints,max_devices,label&limit=1`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_SRK,
        Authorization: `Bearer ${SUPABASE_SRK}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { ok: false, reason: "lookup_failed" };
    const rows = (await r.json()) as Array<{
      active: boolean;
      expires_at: string | null;
      device_fingerprints: string[] | null;
      max_devices: number | null;
      label: string | null;
    }>;
    const row = rows?.[0];
    if (!row) {
      KEY_CACHE.set(cacheKey, { ok: false, at: Date.now() });
      return { ok: false, reason: "invalid_key" };
    }
    if (!row.active) {
      KEY_CACHE.set(cacheKey, { ok: false, at: Date.now() });
      return { ok: false, reason: "deactivated" };
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      KEY_CACHE.set(cacheKey, { ok: false, at: Date.now() });
      return { ok: false, reason: "expired" };
    }
    const fps = row.device_fingerprints || [];
    if (!fps.includes(fp)) {
      const maxDev = row.max_devices ?? 1;
      if (fps.length >= maxDev) {
        KEY_CACHE.set(cacheKey, { ok: false, at: Date.now() });
        return { ok: false, reason: "device_limit_reached" };
      }
      try {
        await fetch(
          `${SUPABASE_URL_ENV}/rest/v1/access_keys?key=eq.${encodeURIComponent(key)}`,
          {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_SRK,
              Authorization: `Bearer ${SUPABASE_SRK}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              device_fingerprints: [...fps, fp],
              updated_at: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(3000),
          },
        );
      } catch (_) {
        // best-effort — allow this request regardless
      }
    }
    const label = row.label || "User";
    KEY_CACHE.set(cacheKey, { ok: true, at: Date.now(), label });
    return { ok: true, label, keyMasked: maskKey(key) };
  } catch (_e) {
    return { ok: false, reason: "lookup_error" };
  }
}

// ---- Telegram admin broadcast (fire-and-forget) ----------------------------
function getAdminChatIds(): string[] {
  const ids = [
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_1") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_2") || "",
    Deno.env.get("TELEGRAM_ADMIN_CHAT_ID_3") || "",
    ...(Deno.env.get("TELEGRAM_CHAT_ID") || "").split(","),
  ];
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

let SEARCH_SEQ = 0;
function broadcastSearchToAdmins(
  username: string,
  traceId: string,
  searcher: { label?: string; keyMasked?: string },
) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatIds = getAdminChatIds();
  if (!botToken || chatIds.length === 0) return;

  SEARCH_SEQ += 1;
  const seq = SEARCH_SEQ;
  const ts = new Date().toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const msg =
    `🛰️ <b>𝗗𝗔𝗥𝗞𝗦𝗜𝗗𝗘𝗫 • 𝗟𝗜𝗩𝗘 𝗦𝗘𝗔𝗥𝗖𝗛</b> 🛰️\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Searcher:</b> <code>${searcher.label || "Unknown"}</code>\n` +
    `🔑 <b>Access Key:</b> <code>${searcher.keyMasked || "—"}</code>\n` +
    `🔎 <b>Target:</b> <code>@${username}</code>\n` +
    `🆔 <b>Trace:</b> <code>${traceId}</code>\n` +
    `📊 <b>Search #</b> <code>${seq}</code>\n` +
    `⏱ <b>Time:</b> ${ts}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 <b>DARKSIDEX • TO THE MOON</b> 🌙`;

  const task = (async () => {
    await Promise.allSettled(
      chatIds.map((id) =>
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: id, text: msg, parse_mode: "HTML", disable_web_page_preview: true,
          }),
        }).catch(() => null),
      ),
    );
  })();
  // @ts-ignore EdgeRuntime is a Supabase Deno global
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  }
}

// ---- data source calls -----------------------------------------------------
interface PrimaryInfo {
  id?: string; username?: string; full_name?: string; bio?: string;
  category?: string | null; followers?: number; following?: number;
  posts?: number; profile_picture?: string; website?: string;
  bio_links?: string[]; is_private?: boolean; is_verified?: boolean;
}
interface PrimaryPost {
  id?: string; shortcode?: string; type?: string; caption?: string;
  taken_at?: number; likes?: number; comments?: number; plays?: number;
  duration_seconds?: number; width?: number; height?: number;
  image_url?: string; video_url?: string;
  views?: number; view_count?: number; video_view_count?: number;
}

const parseMetricNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const compact = value.trim().replace(/,/g, "").toUpperCase();
  const match = compact.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])?/);
  if (!match) return 0;
  const base = Number(match[1]);
  const multiplier = ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[match[2] || ""] || 1;
  const parsed = base * multiplier;
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const n = parseMetricNumber(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

/**
 * Providers return `taken_at` in seconds, milliseconds or microseconds.
 * Mixing units broke newest-first sorting after merging sources, so the newest
 * posts of an account could be pushed out of the result window entirely.
 * Always normalise to milliseconds.
 */
const toMs = (value: unknown): number => {
  const n = parseMetricNumber(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e14) return Math.round(n / 1000); // microseconds
  if (n > 1e11) return Math.round(n); // already ms
  return Math.round(n * 1000); // seconds
};



const asObj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" ? v as Record<string, any> : {};

const pick = (obj: unknown, paths: string[]) => {
  for (const path of paths) {
    let cur: any = obj;
    let ok = true;
    for (const part of path.split(".")) {
      cur = cur?.[part];
      if (cur == null) { ok = false; break; }
    }
    if (ok && cur !== "") return cur;
  }
  return undefined;
};

const firstString = (...values: unknown[]) => {
  for (const value of values.flat()) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

async function fetchJson<T>(url: string, ms: number, retries = 1): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; IGScraper/1.0)",
        },
        signal: AbortSignal.timeout(ms),
      });
      if (!r.ok) {
        if (attempt < retries) continue;
        return null;
      }
      return (await r.json()) as T;
    } catch (_) {
      if (attempt < retries) continue;
      return null;
    }
  }
  return null;
}

function normalizeItem(p: PrimaryPost) {
  const isVideo = (p.type || "").toLowerCase() === "video";
  const likes = Number(p.likes || 0);
  const rawViews = firstNumber(p.plays, p.views, p.view_count, p.video_view_count);
  return {
    id: String(p.id || p.shortcode || ""),
    code: String(p.shortcode || p.id || ""),
    caption: p.caption || "",
    thumbnail: p.image_url || "",
    videoUrl: isVideo ? (p.video_url || "") : "",
    duration: Math.round((p.duration_seconds || 0) * 1) || 0,
    views: rawViews,
    likes,
    comments: Number(p.comments || 0),
    shares: firstNumber((p as any).shares, (p as any).share_count),
    takenAt: toMs(p.taken_at),
    isVideo,
    width: Number(p.width || 0),
    height: Number(p.height || 0),
  };
}

// ---- RapidAPI instagram120 --------------------------------------------------
async function rapidPost<T>(path: string, username: string): Promise<T | null> {
  if (!RAPIDAPI_KEY || !RAPIDAPI_HOST) return null;
  try {
    const r = await fetch(`${RAPIDAPI_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
      body: JSON.stringify({ username }),
      signal: AbortSignal.timeout(RAPIDAPI_TIMEOUT_MS),
    });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!r.ok) {
      console.warn(JSON.stringify({ event: "rapidapi_non_ok", path, status: r.status, detail: text.slice(0, 180) }));
      return null;
    }
    return data as T;
  } catch (e) {
    console.warn(JSON.stringify({ event: "rapidapi_failed", path, err: (e as Error).message }));
    return null;
  }
}

function extractRapidUser(raw: any, username: string) {
  const user = asObj(
    pick(raw, [
      "user", "data.user", "result.user", "response.user",
      "data", "result", "response",
    ]) || raw,
  );
  if (!Object.keys(user).length) return null;
  const profile = {
    username: firstString(user.username, username),
    fullName: firstString(user.full_name, user.fullName, user.name),
    bio: firstString(user.biography, user.bio),
    avatarUrl: firstString(user.profile_pic_url_hd, user.profile_pic_url, user.profilePicture, user.profile_pic),
    isVerified: !!(user.is_verified ?? user.isVerified),
    followers: firstNumber(user.follower_count, user.followers, user.edge_followed_by?.count),
    following: firstNumber(user.following_count, user.following, user.edge_follow?.count),
    postsCount: firstNumber(user.media_count, user.posts, user.post_count, user.edge_owner_to_timeline_media?.count),
    category: firstString(user.category, user.category_name),
    externalUrl: firstString(user.external_url, user.website, user.url),
  };
  return profile.username ? profile : null;
}

function extractRapidArray(raw: any): any[] {
  const candidates = [
    raw?.items, raw?.posts, raw?.reels, raw?.medias,
    raw?.data?.items, raw?.data?.posts, raw?.data?.reels, raw?.data?.medias,
    raw?.result?.items, raw?.result?.posts, raw?.result?.reels,
    raw?.response?.items, raw?.response?.posts, raw?.response?.reels,
    raw?.data?.user?.edge_owner_to_timeline_media?.edges,
    raw?.user?.edge_owner_to_timeline_media?.edges,
  ];
  const arr = candidates.find(Array.isArray) as any[] | undefined;
  return arr || [];
}

function normalizeRapidItem(input: any, idx: number, forceVideo = false) {
  const n = asObj(input?.node || input);
  const captionObj = Array.isArray(n.caption?.edges) ? n.caption.edges[0]?.node : n.caption;
  const videoVersions = Array.isArray(n.video_versions) ? n.video_versions : [];
  const imageCandidates = Array.isArray(n.image_versions2?.candidates) ? n.image_versions2.candidates : [];
  const mediaType = Number(n.media_type || n.mediaType || 0);
  const videoCandidates = [
    n.video_url, n.videoUrl,
    ...videoVersions.map((v: any) => v?.url),
    n.video_dash_manifest,
  ].filter((url) => typeof url === "string" && url.trim());
  const videoUrl = firstString(
    videoCandidates.find((url) => !/\.m3u8/i.test(url)),
    videoCandidates[0],
  );
  const isVideo = forceVideo || !!videoUrl || mediaType === 2 || n.is_video === true || String(n.product_type || "").includes("clips");
  const thumb = firstString(
    n.thumbnail_url, n.thumbnail, n.display_url, n.image_url,
    n.image_versions2?.candidates?.[0]?.url,
    imageCandidates.map((v: any) => v?.url),
  );
  const likes = firstNumber(n.like_count, n.likes, n.edge_media_preview_like?.count);
  const views = firstNumber(
    n.play_count, n.ig_play_count, n.view_count, n.video_view_count, n.video_play_count,
    n.fb_play_count, n.plays, n.views, n.playCount, n.videoViewCount,
    n.clips_metadata?.play_count, n.media?.play_count, n.media?.view_count,
    n.edge_media_video_play_count?.count,
  );
  const code = firstString(n.code, n.shortcode, n.short_code, n.pk, n.id, `rapid_${idx}`);
  const takenAt = toMs(firstNumber(n.taken_at, n.taken_at_timestamp, n.device_timestamp, n.created_at));
  return {
    id: String(firstString(n.id, n.pk, code)),
    code: String(code),
    caption: firstString(captionObj?.text, n.caption_text, typeof n.caption === "string" ? n.caption : ""),
    thumbnail: thumb,
    videoUrl: isVideo ? videoUrl : "",
    duration: Math.round(Number(n.duration || n.video_duration || 0)) || 0,
    views,
    likes,
    comments: firstNumber(n.comment_count, n.comments, n.edge_media_to_comment?.count),
    shares: firstNumber(n.share_count, n.shares),
    takenAt,
    isVideo,
    width: Number(n.original_width || n.width || n.dimensions?.width || 0),
    height: Number(n.original_height || n.height || n.dimensions?.height || 0),
  };
}

async function rapidApiScrape(username: string) {
  const [infoRaw, postsRaw, reelsRaw] = await Promise.all([
    rapidPost<any>("/api/instagram/userInfo", username),
    rapidPost<any>("/api/instagram/posts", username),
    rapidPost<any>("/api/instagram/reels", username),
  ]);

  const profile = extractRapidUser(infoRaw, username);
  const seen = new Set<string>();
  const items = [
    ...extractRapidArray(reelsRaw).map((x, i) => normalizeRapidItem(x, i, true)),
    ...extractRapidArray(postsRaw).map((x, i) => normalizeRapidItem(x, i + 1000)),
  ].filter((x) => {
    if (!x.thumbnail && !x.videoUrl) return false;
    const key = x.id || x.code || x.thumbnail || x.videoUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!profile && items.length === 0) return null;
  return { profile, items };
}

// ---- RapidAPI instagram-looter2 (PRIMARY) ----------------------------------
const LOOTER_KEY = Deno.env.get("RAPIDAPI_LOOTER_KEY") ?? "";
const LOOTER_HOST = Deno.env.get("RAPIDAPI_LOOTER_HOST") || "instagram-looter2.p.rapidapi.com";
const LOOTER_TIMEOUT_MS = 25_000;

async function looterGet<T>(path: string): Promise<T | null> {
  if (!LOOTER_KEY) return null;
  try {
    const r = await fetch(`https://${LOOTER_HOST}${path}`, {
      headers: {
        "x-rapidapi-key": LOOTER_KEY,
        "x-rapidapi-host": LOOTER_HOST,
      },
      signal: AbortSignal.timeout(LOOTER_TIMEOUT_MS),
    });
    const text = await r.text();
    if (!r.ok) {
      console.warn(JSON.stringify({ event: "looter_non_ok", path, status: r.status, detail: text.slice(0, 180) }));
      return null;
    }
    try { return JSON.parse(text) as T; } catch { return null; }
  } catch (e) {
    console.warn(JSON.stringify({ event: "looter_failed", path, err: (e as Error).message }));
    return null;
  }
}

async function looterProfileOnly(username: string) {
  const info: any = await looterGet<any>(`/profile?username=${encodeURIComponent(username)}`);
  console.log(JSON.stringify({ event: "looter_profile", username, ok: !!info, status: info?.status }));
  if (!info || info.status === false) return null;
  return {
    items: [] as any[],
    profile: {
      username: firstString(info.username, username),
      fullName: firstString(info.full_name),
      bio: firstString(info.biography),
      avatarUrl: firstString(info.profile_pic_url_hd, info.profile_pic_url),
      isVerified: !!info.is_verified,
      ...profileCounts(info),
      category: firstString(info.category_name, info.business_category_name),
      externalUrl: firstString(info.external_url),
    },
  };
}

async function looterScrape(username: string) {
  if (!LOOTER_KEY) return null;
  const info = await looterGet<any>(`/profile?username=${encodeURIComponent(username)}`);
  if (!info || info.status === false) return null;

  const profile = {
    username: firstString(info.username, username),
    fullName: firstString(info.full_name),
    bio: firstString(info.biography),
    avatarUrl: firstString(info.profile_pic_url_hd, info.profile_pic_url),
    isVerified: !!info.is_verified,
    followers: firstNumber(info.edge_followed_by?.count, info.follower_count),
    following: firstNumber(info.edge_follow?.count, info.following_count),
    postsCount: firstNumber(info.edge_owner_to_timeline_media?.count, info.media_count),
    category: firstString(info.category_name, info.business_category_name),
    externalUrl: firstString(info.external_url),
  };

  const uid = firstString(info.id, info.pk, info.eimu_id);
  // A profile-only response is not a usable clone. Let the next provider run
  // instead of treating missing media as a successful empty account.
  if (!uid) return null;

  const [feedRes, reelsRes] = await Promise.allSettled([
    (async () => {
      // One 50-item page already fills the app's 60-item grid when combined
      // with reels. Sequentially fetching four pages made mobile clones wait
      // for multiple third-party cold starts even after useful data was ready.
      const r = await looterGet<any>(`/user-feeds?id=${encodeURIComponent(uid)}&count=60`);
      const items = Array.isArray(r?.items)
        ? r.items
        : Array.isArray(r?.edges)
          ? r.edges.map((edge: any) => edge?.node || edge).filter(Boolean)
          : [];
      return { items };
    })(),
    looterGet<any>(`/reels?id=${encodeURIComponent(uid)}&count=60`),
  ]);
  const feed = feedRes.status === "fulfilled" ? feedRes.value : null;
  const reelsRaw = reelsRes.status === "fulfilled" ? reelsRes.value : null;

  const reelItems: any[] = Array.isArray(reelsRaw?.items)
    ? reelsRaw.items.map((x: any) => x?.media || x)
    : [];
  const feedItems: any[] = Array.isArray(feed?.items) ? feed.items : [];


  // Reels first (real play counts), then feed grid — dedupe by shortcode.
  const seen = new Set<string>();
  const items = [
    ...reelItems.map((x, i) => ({ ...normalizeRapidItem(x, i, true), src: "reels" })),
    ...feedItems.map((x, i) => {
      const n = normalizeRapidItem(x, i + 1000);
      return { ...n, src: n.isVideo ? "reels" : "posts" };
    }),
  ].filter((x) => {
    if (!x.thumbnail && !x.videoUrl) return false;
    const k = String(x.code || x.id);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(JSON.stringify({
    event: "looter_counts", username, reels: reelItems.length, feed: feedItems.length, merged: items.length,
  }));

  return { profile, items };
}

// ---- Legacy Railway fallback (only if /posts returns empty) ----------------

// ---- Instagram public web feed (unauth, 12/page, paginated) ---------------
const IG_APP_ID = "936619743392459";
const IG_HEADERS = {
  "x-ig-app-id": IG_APP_ID,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

async function igPublicUser(username: string) {
  console.log(JSON.stringify({ event: "ig_public_user_start", username }));
  try {
    const r = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers: IG_HEADERS, signal: AbortSignal.timeout(15_000) },
    );
    if (!r.ok) {
      console.warn(JSON.stringify({ event: "ig_public_user_non_ok", status: r.status }));
      return null;
    }
    const j = await r.json();
    const u = j?.data?.user;
    if (!u) return null;
    console.log(JSON.stringify({ event: "ig_public_user_ok", id: u.id }));
    return {
      id: String(u.id || ""),
      profile: {
        username: u.username || username,
        fullName: u.full_name || "",
        bio: u.biography || "",
        avatarUrl: u.profile_pic_url_hd || u.profile_pic_url || "",
        isVerified: !!u.is_verified,
        followers: Number(u.edge_followed_by?.count || 0),
        following: Number(u.edge_follow?.count || 0),
        postsCount: Number(u.edge_owner_to_timeline_media?.count || 0),
        category: u.category_name || "",
        externalUrl: u.external_url || "",
      },
    };
  } catch (e) {
    console.warn(JSON.stringify({ event: "ig_public_user_err", err: (e as Error).message }));
    return null;
  }
}

// ---- Instagram public profile page (free, no key) -------------------------
// web_profile_info is broken upstream, but the public profile page still
// carries followers/following/posts and the avatar in its share tags. Counts
// are the same short form Instagram shows (e.g. 207K, 4,143).
const decodeHtml = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#064;/g, "@").replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

const parseShortCount = (raw: string): number => {
  const m = raw.trim().replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return 0;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase() as "K" | "M" | "B"] || 1;
  return Math.round(Number(m[1]) * mult);
};

async function igHtmlProfile(username: string) {
  // Instagram intermittently returns a login wall or empty 201 response.
  // Retry another public-page variant rather than storing fabricated zeros.
  for (let attempt = 0; attempt < 3; attempt++) {
   try {
    const profileUrl = attempt === 2
      ? `https://www-instagram-com.translate.goog/${encodeURIComponent(username)}/?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en`
      : `https://www.instagram.com/${encodeURIComponent(username)}/${attempt === 1 ? "?hl=en" : ""}`;
    const r = await fetch(profileUrl, {
      headers: {
        "User-Agent": attempt === 1 ? IG_HEADERS["User-Agent"] : "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) {
      console.warn(JSON.stringify({ event: "ig_html_non_ok", username, status: r.status }));
      continue;
    }
    const html = await r.text();
    const parsed = parseProfileHtml(html, username);
    if (parsed && parsed.followers !== undefined && parsed.following !== undefined) {
      console.log(JSON.stringify({ event: "ig_html_counts_ok", username, followers: parsed.followers, following: parsed.following, attempt }));
      return parsed;
    }
    if (attempt < 2) continue;
    const meta = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, "i"));
      return m ? decodeHtml(m[1]) : "";
    };
    const desc = meta("og:description") || (html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1] ?? "");
    const countRe = /([\d.,]+[KMB]?)\s+Followers?,\s*([\d.,]+[KMB]?)\s+Following,\s*([\d.,]+[KMB]?)\s+Posts?/i;
    const counts = decodeHtml(desc).match(countRe) || decodeHtml(html).match(countRe);
    // Some page variants embed exact numbers in JSON; prefer those when present.
    const exactNum = (re: RegExp) => { const m = html.match(re); return m ? Number(m[1]) : 0; };
    const exactFollowers = exactNum(/"edge_followed_by":\{"count":(\d+)\}/);
    const exactFollowing = exactNum(/"edge_follow":\{"count":(\d+)\}/);
    const title = meta("og:title");
    // When Instagram serves its login wall instead of the profile, the share
    // image is the generic Instagram logo; never use that as the avatar.
    const isRealProfilePage = new RegExp(`\\(@${username.replace(/\./g, "\\.")}\\)`, "i").test(title);
    const fullName = (title.match(/^(.*?)\s*\(@/) || [])[1] || "";
    const profile = {
      username,
      fullName,
      avatarUrl: isRealProfilePage ? meta("og:image") : "",
      followers: exactFollowers || (counts ? parseShortCount(counts[1]) : 0),
      following: exactFollowing || (counts ? parseShortCount(counts[2]) : 0),
      postsCount: counts ? parseShortCount(counts[3]) : 0,
    };
    console.log(JSON.stringify({ event: "ig_html_profile", username, followers: profile.followers, following: profile.following, avatar: !!profile.avatarUrl, desc: counts ? undefined : desc.slice(0, 160), len: html.length, hint: counts ? undefined : (html.match(/.{0,80}[Ff]ollow.{0,80}/)?.[0] || "").slice(0, 160) }));
    if (!profile.followers && !profile.avatarUrl) return null;
    return profile;
  } catch (e) {
    console.warn(JSON.stringify({ event: "ig_html_err", username, err: (e as Error).message }));
  }
  }
  return null;
}

// Shared wall-clock budget for paginated loops so a big clone returns what it
// has instead of hitting the 150s gateway idle timeout (which returned nothing).
const PAGINATION_BUDGET_MS = 80_000;
let paginationDeadline = 0;
const pastDeadline = () => paginationDeadline > 0 && Date.now() > paginationDeadline;

async function igPublicFeedPage(username: string, maxId?: string) {
  try {
    const qs = new URLSearchParams({ count: "18" });
    if (maxId) qs.set("max_id", maxId);
    const r = await fetch(
      `https://i.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?${qs.toString()}`,
      { headers: IG_HEADERS, signal: AbortSignal.timeout(15_000) },
    );
    if (!r.ok) {
      console.warn(JSON.stringify({ event: "ig_public_feed_non_ok", status: r.status }));
      return null;
    }
    const j = await r.json();
    console.log(JSON.stringify({ event: "ig_public_feed_ok", count: (j?.items || []).length, more: !!j?.more_available }));
    return {
      items: Array.isArray(j?.items) ? j.items : [],
      nextMaxId: j?.next_max_id ? String(j.next_max_id) : "",
      more: !!j?.more_available,
    };
  } catch (e) {
    console.warn(JSON.stringify({ event: "ig_public_feed_err", err: (e as Error).message }));
    return null;
  }
}

async function instagramPublicScrape(username: string, target = 45) {
  const [user, ...rest] = await Promise.all([igPublicUser(username)]);
  const items: any[] = [];
  let nextId: string | undefined = undefined;
  for (let i = 0; i < Math.ceil(target / 12) + 2 && items.length < target; i++) {
    if (i > 0 && pastDeadline()) break;
    const page = await igPublicFeedPage(username, nextId);
    if (!page || page.items.length === 0) break;
    items.push(...page.items);
    if (!page.more || !page.nextMaxId) break;
    nextId = page.nextMaxId;
  }
  if (!user && items.length === 0) return null;
  // Fallback profile: extract from first feed item's embedded user object
  let profile = user?.profile || null;
  const feedUser = items[0]?.user;
  if (!profile && feedUser) {
    profile = {
      username: feedUser.username || username,
      fullName: feedUser.full_name || "",
      bio: "",
      avatarUrl: feedUser.profile_pic_url_hd || feedUser.profile_pic_url || "",
      isVerified: !!feedUser.is_verified,
      followers: 0,
      following: 0,
      postsCount: items.length,
      category: "",
      externalUrl: "",
    };
  }
  const norm = items
    .slice(0, target)
    .map((n, idx) => normalizeRapidItem(n, idx));
  return { profile, items: norm };
}

interface LegacyResp {
  response?: {
    biography?: string; category?: string; followers?: number;
    following?: number; full_name?: string; is_private?: boolean;
    is_verified?: boolean; post_count?: number;
    posts?: Array<{
      comments?: number; is_video?: boolean; likes?: number;
      thumbnail?: string; id?: string; shortcode?: string;
      caption?: string; taken_at?: number;
    }>;
    profile_picture?: string; profile_pic?: string; username?: string;
  };
}

async function legacyFallback(username: string) {
  // Railway endpoint returns HTTP 404 even when the body contains a valid
  // `response` object, so we can't use fetchJson's r.ok gate here.
  let data: LegacyResp | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(
        `${LEGACY_URL}?username=${encodeURIComponent(username)}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; IGScraper/1.0)",
          },
          signal: AbortSignal.timeout(LEGACY_TIMEOUT_MS),
        },
      );
      const text = await r.text();
      try {
        data = JSON.parse(text) as LegacyResp;
      } catch {
        data = null;
      }
      if (data?.response) break;
    } catch {
      // retry once
    }
  }
  const r = data?.response;
  if (!r || (!r.username && !(r.posts && r.posts.length))) return null;
  const items = (r.posts || []).map((p, idx) => {
    const isVideo = !!p.is_video;
    const likes = Number(p.likes || 0);
    const rawViews = firstNumber((p as any).views, (p as any).plays, (p as any).view_count, (p as any).video_view_count);
    return {
      id: String(p.id || `legacy_${idx}`),
      code: String(p.shortcode || p.id || `legacy_${idx}`),
      caption: p.caption || "",
      thumbnail: p.thumbnail || "",
      videoUrl: "",
      duration: 0,
      views: rawViews,
      likes,
      comments: Number(p.comments || 0),
      shares: 0,
      takenAt: toMs(p.taken_at),
      isVideo,
      width: 0,
      height: 0,
    };
  });
  const profile = {
    username: r.username || username,
    fullName: r.full_name || "",
    bio: r.biography || "",
    avatarUrl: r.profile_picture || r.profile_pic || "",
    isVerified: !!r.is_verified,
    followers: Number(r.followers || 0),
    following: Number(r.following || 0),
    postsCount: Number(r.post_count || items.length),
    category: r.category || "",
    externalUrl: "",
  };
  return { profile, items };
}

// ---- ClipsSaver (PRIMARY source) ------------------------------------------
// Real playCount views + MP4 video URLs. Endpoints:
//   /profile /reels /posts /highlights
const CLIPS_BASE = "https://clipssaver.com/api/instagram/instagramDownloader";
const CLIPS_TIMEOUT_MS = 18_000;
const CLIPS_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Origin: "https://clipssaver.com",
  Referer: "https://clipssaver.com/instagram-profile-downloader",
};

async function clipsPost(
  endpoint: "profile" | "reels" | "posts" | "highlights",
  username: string,
  cursor?: string,
): Promise<any> {
  const body: Record<string, string> = { username };
  if (cursor) body.cursor = cursor;
  let lastErr = "";
  // The profile route (followers/following/avatar) is small but sometimes
  // stalls; a second short attempt usually succeeds where one long wait fails.
  const attempts = endpoint === "profile" ? 2 : 1;
  const timeoutMs = endpoint === "profile" ? 13_000 : CLIPS_TIMEOUT_MS;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const r = await fetch(`${CLIPS_BASE}/${endpoint}`, {
        method: "POST",
        headers: CLIPS_HEADERS,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await r.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!r.ok || j?.status !== "success" || !j?.data) {
        lastErr = `status=${r.status} body=${text.slice(0, 140)}`;
        continue;
      }
      return j.data;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`clipssaver_${endpoint}_failed: ${lastErr}`);
}

function clipsProfile(data: any, username: string) {
  const p = asObj(data?.profile);
  if (!p || !Object.keys(p).length) return null;
  return {
    username: firstString(p.username, username),
    fullName: firstString(p.full_name, p.fullName),
    bio: firstString(p.biography, p.bio),
    avatarUrl: firstString(p.profile_pic_url_hd, p.profile_pic_url),
    isVerified: !!p.is_verified,
    followers: firstNumber(p.edge_followed_by?.count, p.follower_count, p.followers),
    following: firstNumber(p.edge_follow?.count, p.following_count, p.following),
    postsCount: firstNumber(p.edge_owner_to_timeline_media?.count, p.media_count),
    category: firstString(p.category_name, p.category),
    externalUrl: firstString(p.external_url),
  };
}

function clipsReelItem(r: any, idx: number) {
  const likes = firstNumber(r.likeCount, r.like_count);
  const views = firstNumber(r.playCount, r.videoViewCount, r.play_count);
  const code = String(firstString(r.shortCode, r.short_code, r.code) || `clips_reel_${idx}`);
  // MP4 only — iOS refuses HLS in <video> without extra work.
  const rawVideo = firstString(r.videoUrl, r.downloadUrl, r.url);
  const videoUrl = /\.m3u8/i.test(rawVideo) ? "" : rawVideo;
  return {
    id: String(firstString(r.id, r.post_id, code)),
    code,
    caption: firstString(r.description, r.caption, r.title),
    thumbnail: firstString(r.imageUrl, r.image_url, r.thumbnail),
    videoUrl,
    duration: Math.round(Number(r.videoDuration || r.video_duration || 0)) || 0,
    views,
    likes,
    comments: firstNumber(r.commentCount, r.comment_count),
    shares: firstNumber(r.shareCount, r.share_count, r.shares),
    reposts: firstNumber(r.repostCount, r.repost_count, r.reposts),
    takenAt: toMs(firstNumber(r.createdAt, r.created_at, r.taken_at)),
    isVideo: true,
    width: Number(r.dimensions?.width || 0),
    height: Number(r.dimensions?.height || 0),
  };
}

function clipsPostItem(node: any, idx: number) {
  const n = asObj(node?.node || node);
  const isVideo = n.__typename === "GraphVideo" || !!n.is_video || !!n.video_url;
  const likes = firstNumber(n.edge_media_preview_like?.count, n.edge_liked_by?.count, n.like_count);
  const views = firstNumber(n.play_count, n.video_view_count, n.view_count);
  const code = String(firstString(n.shortcode, n.short_code, n.code) || `clips_post_${idx}`);
  const rawVideo = firstString(n.video_url, n.videoUrl);
  const videoUrl = isVideo && !/\.m3u8/i.test(rawVideo) ? rawVideo : "";
  return {
    id: String(firstString(String(n.id ?? ""), code)),
    code,
    caption: firstString(
      n.edge_media_to_caption?.edges?.[0]?.node?.text,
      n.caption?.text,
      typeof n.caption === "string" ? n.caption : "",
    ),
    thumbnail: firstString(n.display_url, n.thumbnail_src, n.display_src),
    videoUrl,
    duration: Math.round(Number(n.video_duration || 0)) || 0,
    views,
    likes,
    comments: firstNumber(n.edge_media_to_comment?.count, n.comment_count),
    shares: firstNumber(n.share_count, n.shares),
    reposts: firstNumber(n.repost_count, n.reposts),
    takenAt: toMs(firstNumber(n.taken_at_timestamp, n.taken_at)),
    isVideo,
    width: Number(n.dimensions?.width || 0),
    height: Number(n.dimensions?.height || 0),
  };
}

// Dedupe by shortcode — numeric IG ids lose precision through JSON parsing.
function dedupeByCode<T extends { code?: string; id?: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list) {
    const key = String(x.code || x.id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

/**
 * Merge the same media coming from several providers.
 * Identity/media fields keep the highest-priority (first) provider's values,
 * but each metric takes the first REAL (non-zero) value found in priority
 * order — never a random or averaged number. This prevents a provider that
 * returns 0 (or a stale/partial count) from overwriting real engagement.
 */
function mergeItemsByCode<T extends Record<string, any>>(list: T[]): T[] {
  const byKey = new Map<string, any>();
  const order: string[] = [];
  const NUMERIC = ["views", "likes", "comments", "shares", "reposts", "duration", "takenAt", "width", "height"];
  const TEXT = ["caption", "thumbnail", "videoUrl", "id"];

  for (const item of list) {
    const key = String(item?.code || item?.id || "");
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item });
      order.push(key);
      continue;
    }
    for (const field of NUMERIC) {
      const current = Number(existing[field] || 0);
      const incoming = Number((item as any)[field] || 0);
      if (!current && incoming > 0) existing[field] = incoming;
    }
    for (const field of TEXT) {
      if (!existing[field] && (item as any)[field]) existing[field] = (item as any)[field];
    }
    if (!existing.isVideo && (item as any).isVideo) existing.isVideo = true;
    existing.src = existing.isVideo ? "reels" : "posts";
  }
  return order.map((k) => byKey.get(k));
}

async function clipsReelPages(username: string, pages: number, startCursor?: string) {
  const reels: any[] = [];
  let cursor = startCursor;
  let hasMore = false;
  for (let i = 0; i < Math.max(1, pages); i++) {
    if (i > 0 && pastDeadline()) break;
    // One failed page used to throw away every reel already fetched (and with
    // it every real view count). Keep what we have; retry the first page once.
    let data: any = null;
    try {
      data = await clipsPost("reels", username, cursor);
    } catch (e) {
      if (i === 0) {
        try { data = await clipsPost("reels", username, cursor); } catch { throw e; }
      } else {
        console.warn(JSON.stringify({ event: "clips_reels_page_failed", username, page: i, err: (e as Error).message.slice(0, 160) }));
        break;
      }
    }
    const batch = Array.isArray(data?.reels) ? data.reels : [];
    reels.push(...batch.map((r: any, idx: number) => clipsReelItem(r, reels.length + idx)));
    cursor = data?.cursor ? String(data.cursor) : "";
    hasMore = !!data?.hasNextPage && !!cursor;
    if (!hasMore) break;
  }
  return { reels: dedupeByCode(reels), cursor: cursor || "", hasMore };
}

async function clipsPostPages(username: string, pages: number) {
  const posts: any[] = [];
  let cursor = "";
  let hasMore = false;
  for (let page = 0; page < Math.max(1, pages); page++) {
    if (page > 0 && pastDeadline()) break;
    let data: any = null;
    try {
      data = await clipsPost("posts", username, cursor || undefined);
    } catch (e) {
      if (page === 0) throw e;
      console.warn(JSON.stringify({ event: "clips_posts_page_failed", username, page, err: (e as Error).message.slice(0, 160) }));
      break;
    }
    const timeline =
      data?.posts?.data?.user?.edge_owner_to_timeline_media ??
      data?.data?.user?.edge_owner_to_timeline_media;
    const edges = Array.isArray(timeline?.edges) ? timeline.edges : [];
    posts.push(...edges.map((edge: any, index: number) => clipsPostItem(edge, posts.length + index)));
    cursor = firstString(timeline?.page_info?.end_cursor, data?.cursor);
    hasMore = !!(timeline?.page_info?.has_next_page ?? data?.hasNextPage) && !!cursor;
    if (!hasMore || posts.length >= 350) break;
  }
  return dedupeByCode(posts).slice(0, 350);
}

async function clipsSaverScrape(username: string, pages = 4) {
  // Highlights is intentionally not part of the blocking clone request: that
  // provider route frequently hangs even while profile/reels/posts are healthy.
  const [profileRes, reelsRes, postsRes] = await Promise.allSettled([
    clipsPost("profile", username),
    clipsReelPages(username, pages),
    clipsPostPages(username, pages),
  ]);

  const profile =
    profileRes.status === "fulfilled" ? clipsProfile(profileRes.value, username) : null;
  console.log(JSON.stringify({
    event: "clips_profile", username, status: profileRes.status,
    err: profileRes.status === "rejected" ? String((profileRes as any).reason?.message || "").slice(0, 200) : undefined,
    followers: profile?.followers,
  }));
  const reels = reelsRes.status === "fulfilled" ? reelsRes.value : { reels: [], cursor: "", hasMore: false };

  let posts: any[] = [];
  if (postsRes.status === "fulfilled") {
    posts = postsRes.value;
  }

  // MERGE ORDER: reels first (real playCount), posts after — dedupe by code.
  const taggedReels = reels.reels.map((item: any) => ({ ...item, src: "reels" }));
  const taggedPosts = posts.map((item: any) => ({ ...item, src: "posts" }));
  const items = dedupeByCode([...taggedReels, ...taggedPosts]);
  if (!profile && items.length === 0) return null;
  return {
    profile,
    items,
    highlights: [] as Array<{ id: string; name: string; image: string }>,
    reelsCursor: reels.cursor,
    reelsHasMore: reels.hasMore,
  };
}

// ---- w-ig-eight (PRIMARY source) ------------------------------------------
// GET /info?username= , /reels?username= , /posts?username=
const WIG_BASE = "https://w-ig-eight.vercel.app";
const WIG_TIMEOUTS: Record<"info" | "reels" | "posts", number> = {
  info: 10_000,
  reels: 12_000,
  posts: 12_000,
};

async function wigGet(path: "info" | "reels" | "posts", username: string): Promise<any> {
  let lastErr = "";
  // Never retry inside the foreground search. Another provider is already
  // racing this request, so a retry only makes the user wait longer.
  const maxAttempts = 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const r = await fetch(`${WIG_BASE}/${path}?username=${encodeURIComponent(username)}`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(WIG_TIMEOUTS[path]),
      });

      const text = await r.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!r.ok || !j || j.error) {
        lastErr = `status=${r.status} body=${text.slice(0, 140)}`;
        continue;
      }
      return j;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`wig_${path}_failed: ${lastErr}`);
}


function wigMediaUrl(raw: string, proxied: string) {
  // Prefer the socialhubapi CDN url (allow-listed by ig-image-proxy).
  const u = firstString(raw, proxied);
  return /\.m3u8/i.test(u) ? "" : u;
}

function wigItem(m: any, idx: number, forceVideo: boolean) {
  const isVideo = forceVideo || m.type === "video" || !!m.video_url_raw || !!m.video_url;
  const likes = firstNumber(m.likes, m.like_count);
  const views = firstNumber(m.plays, m.play_count, m.views);
  const code = String(firstString(m.shortcode, m.code) || `wig_${forceVideo ? "reel" : "post"}_${idx}`);
  return {
    id: String(firstString(String(m.id ?? ""), code)),
    code,
    caption: firstString(m.caption, m.accessibility_caption),
    thumbnail: firstString(m.image_url, m.thumbnail_url, m.display_url),
    videoUrl: isVideo ? wigMediaUrl(m.video_url_raw, m.video_url) : "",
    duration: Math.round(Number(m.duration_seconds || 0)) || 0,
    views,
    likes,
    comments: firstNumber(m.comments, m.comment_count),
    shares: firstNumber(m.statistics?.shareCount, m.shareCount, m.share_count, m.shares),
    reposts: firstNumber(m.statistics?.repostCount, m.repostCount, m.repost_count, m.reposts),
    takenAt: toMs(firstNumber(m.taken_at)),
    isVideo,
    width: Number(m.width || 0),
    height: Number(m.height || 0),
  };
}

function wigProfile(p: any, username: string) {
  if (!p || !p.username) return null;
  return {
    username: firstString(p.username, username),
    fullName: firstString(p.full_name),
    bio: firstString(p.bio, p.biography),
    avatarUrl: firstString(p.profile_picture, p.profile_pic_url_hd, p.profile_pic_url),
    isVerified: !!p.is_verified,
    followers: firstNumber(p.followers),
    following: firstNumber(p.following),
    postsCount: firstNumber(p.posts),
    category: firstString(p.category),
    externalUrl: firstString(p.website, p.bio_links?.[0]),
  };
}

async function wigScrape(username: string) {
  const [infoRes, reelsRes, postsRes] = await Promise.allSettled([
    wigGet("info", username),
    wigGet("reels", username),
    wigGet("posts", username),
  ]);

  const profile = infoRes.status === "fulfilled" ? wigProfile(infoRes.value, username) : null;

  const reelsRaw = reelsRes.status === "fulfilled" && Array.isArray(reelsRes.value?.reels)
    ? reelsRes.value.reels : [];
  let postsRaw = postsRes.status === "fulfilled" && Array.isArray(postsRes.value?.posts)
    ? postsRes.value.posts : [];

  const reels = reelsRaw.map((r: any, i: number) => ({ ...wigItem(r, i, true), src: "reels" }));
  const posts = postsRaw.map((p: any, i: number) => ({ ...wigItem(p, i, false), src: "posts" }));

  console.log(JSON.stringify({ event: "wig_counts", username, reels: reels.length, posts: posts.length }));

  // MERGE ORDER: reels first (real play counts), posts after — dedupe by code.
  const items = dedupeByCode([...reels, ...posts]);
  if (!profile && items.length === 0) return null;
  return { profile, items };
}


// ---- ZylaLabs Instagram Profile & Media Data API (PRIMARY) -----------------
const ZYLA_KEY = Deno.env.get("ZYLALABS_API_KEY") ?? "";
const ZYLA_CONNECTION_KEY = Deno.env.get("UDC_ZYLALABS_INSTAGRAM_MEDIA_API_KEY") ?? "";
const ZYLA_GATEWAY_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const ZYLA_BASE = `${ZYLA_CONNECTION_KEY ? "https://connector-gateway.lovable.dev/udc_zylalabs_instagram_media" : "https://zylalabs.com"}/api/12390/instagram+profile+and+media+data+api`;
const ZYLA_PROFILE_EP = `${ZYLA_BASE}/23416/get+profile+details`;
const ZYLA_POSTS_EP = `${ZYLA_BASE}/23417/get+profile+posts+list`;
const ZYLA_REELS_EP = `${ZYLA_BASE}/23418/get+profile+reels+list`;
const ZYLA_TIMEOUT_MS = 15_000;

async function zylaGet(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: ZYLA_CONNECTION_KEY
      ? { Accept: "application/json", Authorization: `Bearer ${ZYLA_GATEWAY_KEY}`, "X-Connection-Api-Key": ZYLA_CONNECTION_KEY }
      : { Accept: "application/json", Authorization: `Bearer ${ZYLA_KEY}` },
    signal: AbortSignal.timeout(ZYLA_TIMEOUT_MS),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { j = null; }
  if (!r.ok || j?.success === false) throw zylaFailure(r.status, j);
  if (!j) throw new Error(`zyla_status=${r.status}`);
  return j;
}

function zylaProfile(d: any, username: string) {
  if (!d) return null;
  return {
    username: firstString(d.username, username),
    fullName: firstString(d.fullName),
    bio: firstString(d.biography),
    avatarUrl: firstString(d.avatarUrl),
    isVerified: !!d.isVerified,
    followers: firstNumber(d.followerCount),
    following: firstNumber(d.followingCount),
    postsCount: firstNumber(d.totalPosts),
    category: firstString(d.category),
    externalUrl: firstString(
      typeof d.bioLinks?.[0] === "string" ? d.bioLinks[0] : d.bioLinks?.[0]?.url,
      d.linkedFacebookInfo?.url,
    ),
  };
}

function zylaItem(p: any, idx: number, reel = false) {
  const media = Array.isArray(p.mediaList) ? p.mediaList : [];
  const first = media[0] || {};
  const { isVideo, thumbnail, videoUrl } = zylaMedia(p, reel);
  const code = String(firstString(p.code, String(p.id ?? "")) || `zyla_post_${idx}`);
  return {
    id: String(firstString(String(p.id ?? ""), code)),
    code,
    caption: firstString(p.title, p.caption),
    thumbnail,
    videoUrl,
    duration: Math.round(Number(p.duration || first.duration || 0)) || 0,
    views: firstNumber(p.statistics?.playCount, p.statistics?.viewCount, p.playCount),
    likes: firstNumber(p.statistics?.likeCount),
    comments: firstNumber(p.statistics?.commentCount),
    shares: firstNumber(p.statistics?.shareCount, p.shareCount, p.share_count, p.shares),
    reposts: firstNumber(p.statistics?.repostCount, p.repostCount, p.repost_count, p.reposts),
    takenAt: toMs(firstNumber(p.createdAt)),
    isVideo,
    width: Number(first.width || 0),
    height: Number(first.height || 0),
    src: isVideo ? "reels" : "posts",
  };
}

async function zylaPages(username: string, pages: number, reel: boolean, startCursor = "") {
  const items: any[] = [];
  let cursor = startCursor;
  let hasMore = false;
  const seen = new Set<string>();
  for (let i = 0; i < pages; i++) {
    try {
      const page = await zylaGet(`${reel ? ZYLA_REELS_EP : ZYLA_POSTS_EP}?username=${encodeURIComponent(username)}${cursor ? `&nextCursor=${encodeURIComponent(cursor)}` : ""}`);
      const raw = page?.data?.items;
      if (!Array.isArray(raw)) throw new Error("zyla_invalid_media_response");
      items.push(...raw.map((p: any, idx: number) => zylaItem(p, items.length + idx, reel)));
      const next = zylaPagination(page);
      cursor = next.cursor;
      hasMore = next.hasMore;
      if (!raw.length || !hasMore || seen.has(cursor)) { hasMore = false; break; }
      seen.add(cursor);
    } catch (e) {
      preserveZylaFailure(e);
      if (!items.length) throw e;
      console.warn(JSON.stringify({ event: "zyla_page_failed", username, page: i }));
      break;
    }
  }
  return { items: dedupeByCode(items), cursor: hasMore ? cursor : "", hasMore };
}

async function zylaScrape(username: string, pages = 4) {
  if (!ZYLA_KEY && !ZYLA_CONNECTION_KEY) return null;
  const [profJson, reels, posts] = await Promise.all([
    zylaGet(`${ZYLA_PROFILE_EP}?username=${encodeURIComponent(username)}`).catch(preserveZylaFailure),
    zylaPages(username, pages, true).catch(preserveZylaFailure),
    zylaPages(username, pages, false).catch(preserveZylaFailure),
  ]);
  const profile = zylaProfile(profJson?.data, username);
  const items = dedupeByCode([...(reels?.items || []), ...(posts?.items || [])]);
  if (!items.length && (!profile || profile.postsCount > 0)) return null;
  return { profile, items, reels, posts };
}

function zylaCursor(data: Awaited<ReturnType<typeof zylaScrape>>) {
  if (!data) return "";
  if (!data.reels?.hasMore && !data.posts?.hasMore) return "";
  return `zyla:${encodeURIComponent(JSON.stringify({ reels: data.reels?.hasMore ? data.reels.cursor : "", posts: data.posts?.hasMore ? data.posts.cursor : "" }))}`;
}


// ---- insta-scraper-api-alpha (PRIMARY source) -----------------------------
// GET /api/instagram/<username>/profile and /api/instagram/<username>/posts
const ALPHA_BASE = "https://insta-scraper-api-alpha.vercel.app/api/instagram";
const ALPHA_TIMEOUTS: Record<"profile" | "posts", number> = { profile: 4_000, posts: 4_000 };

async function alphaGet(path: "profile" | "posts", username: string): Promise<any> {
  let lastErr = "";
  // This is the fast primary provider. Do not make the user wait through a
  // second long request when it is unhealthy; move to the fallback chain.
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      const r = await fetch(`${ALPHA_BASE}/${encodeURIComponent(username)}/${path}`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(ALPHA_TIMEOUTS[path]),
      });
      const text = await r.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { j = null; }
      if (!r.ok || !j || j.error) {
        lastErr = `status=${r.status} body=${text.slice(0, 140)}`;
        continue;
      }
      return j;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`alpha_${path}_failed: ${lastErr}`);
}

function alphaItem(m: any, idx: number) {
  const isVideo = !!m.isVideo || m.mediaType === "video";
  const code = String(firstString(m.shortcode, String(m.id ?? "")) || `alpha_post_${idx}`);
  const dl = firstString(m.downloadUrl, m.videoUrl);
  return {
    id: String(firstString(String(m.id ?? ""), code)),
    code,
    caption: firstString(m.caption),
    thumbnail: firstString(m.thumbnailUrl, m.displayUrl),
    videoUrl: isVideo && !/\.m3u8/i.test(dl) ? dl : "",
    duration: Math.round(Number(m.duration || 0)) || 0,
    views: firstNumber(m.views, m.playCount),
    likes: firstNumber(m.likes),
    comments: firstNumber(m.comments),
    shares: firstNumber(m.shareCount, m.share_count, m.shares),
    reposts: firstNumber(m.repostCount, m.repost_count, m.reposts),
    takenAt: toMs(firstNumber(m.takenAt)),
    isVideo,
    width: Number(m.width || 0),
    height: Number(m.height || 0),
    src: isVideo ? "reels" : "posts",
  };
}

function alphaProfile(p: any, username: string) {
  if (!p || !p.username) return null;
  return {
    username: firstString(p.username, username),
    fullName: firstString(p.fullName, p.full_name),
    bio: firstString(p.biography, p.bio),
    avatarUrl: firstString(p.profilePicUrl, p.profile_pic_url),
    isVerified: !!p.isVerified,
    followers: firstNumber(p.followers),
    following: firstNumber(p.following),
    postsCount: firstNumber(p.postsCount),
    category: firstString(p.category),
    externalUrl: firstString(p.externalUrl),
  };
}

async function alphaScrape(username: string) {
  const [profRes, postsRes] = await Promise.allSettled([
    alphaGet("profile", username),
    alphaGet("posts", username),
  ]);
  const profile = profRes.status === "fulfilled" ? alphaProfile(profRes.value, username) : null;
  const raw = postsRes.status === "fulfilled" && Array.isArray(postsRes.value?.posts)
    ? postsRes.value.posts : [];
  const items = dedupeByCode(raw.map((p: any, i: number) => alphaItem(p, i)));
  console.log(JSON.stringify({ event: "alpha_counts", username, items: items.length }));
  if (!profile && items.length === 0) return null;
  return { profile, items };
}

// ---- in-memory cache (per isolate) ----------------------------------------
interface CacheRec { at: number; payload: any }
const CACHE = new Map<string, CacheRec>();

// ---- persistent cache (database) -------------------------------------------
// The in-memory cache only lives inside one isolate for 60s, so almost every
// app open paid a full 40s+ provider round-trip. Store finished payloads in the
// database and serve them instantly (stale-while-revalidate).
const DB_FRESH_MS = 10 * 60 * 1000;
const DB_STALE_MS = 6 * 60 * 60 * 1000;
const REFRESHING = new Set<string>();

function mediaExpiresAt(url: string): number | null {
  try {
    const u = new URL(url);
    const exp = u.searchParams.get("exp");
    if (exp && /^\d{12,14}$/.test(exp)) return Number(exp);
    const oe = u.searchParams.get("oe");
    if (oe && /^[0-9a-f]{8}$/i.test(oe)) return parseInt(oe, 16) * 1000;
  } catch (_) { /* not a url */ }
  return null;
}

/** True when the newest media links in a payload have (nearly) expired. */
function payloadMediaExpired(payload: any): boolean {
  const items = [...(payload?.reels || []), ...(payload?.posts || [])].slice(0, 6);
  const stamps = items.map((m: any) => mediaExpiresAt(String(m?.thumbnail || ""))).filter((n): n is number => n !== null);
  if (!stamps.length) return false;
  return Math.min(...stamps) - 15 * 60_000 <= Date.now();
}

async function dbCacheGet(key: string): Promise<CacheRec | null> {
  if (!SUPABASE_URL_ENV || !SUPABASE_SRK) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL_ENV}/rest/v1/ig_scrape_cache?cache_key=eq.${encodeURIComponent(key)}&select=payload,updated_at&limit=1`,
      {
        headers: { apikey: SUPABASE_SRK, Authorization: `Bearer ${SUPABASE_SRK}`, Accept: "application/json" },
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row?.payload) return null;
    return { at: new Date(row.updated_at).getTime(), payload: row.payload };
  } catch {
    return null;
  }
}

async function dbCacheSet(key: string, payload: unknown) {
  if (!SUPABASE_URL_ENV || !SUPABASE_SRK) return;
  try {
    await fetch(`${SUPABASE_URL_ENV}/rest/v1/ig_scrape_cache?on_conflict=cache_key`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SRK,
        Authorization: `Bearer ${SUPABASE_SRK}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ cache_key: key, payload, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (_) { /* cache is best-effort */ }
}

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}_timeout`)), ms)),
  ]);

// ZylaLabs omits view counts. Instagram's public profile JSON reports real
// views/likes/comments for the latest posts, so backfill those by shortcode.
async function igPublicTimelineStats(username: string) {
  const out = new Map<string, { views: number; likes: number; comments: number }>();
  try {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    const agents = [
      IG_HEADERS["User-Agent"],
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0",
    ];
    let j: any = null;
    for (const ua of agents) {
      const r = await fetch(url, { headers: { ...IG_HEADERS, "User-Agent": ua }, signal: AbortSignal.timeout(6_000) }).catch(() => null);
      if (r?.ok) { j = await r.json().catch(() => null); if (j?.data?.user) break; }
      console.warn(JSON.stringify({ event: "ig_timeline_stats_non_ok", username, status: r?.status ?? 0 }));
    }
    if (!j) return out;
    const u = j?.data?.user || {};
    const edges = [
      ...(u.edge_owner_to_timeline_media?.edges || []),
      ...(u.edge_felix_video_timeline?.edges || []),
    ];
    for (const e of edges) {
      const n = e?.node || {};
      if (!n.shortcode) continue;
      out.set(String(n.shortcode), {
        views: firstNumber(n.video_view_count, n.video_play_count),
        likes: firstNumber(n.edge_liked_by?.count, n.edge_media_preview_like?.count),
        comments: firstNumber(n.edge_media_to_comment?.count),
      });
    }
  } catch (e) {
    console.warn(JSON.stringify({ event: "ig_timeline_stats_err", username, err: (e as Error).message }));
  }
  return out;
}

function applyTimelineStats(items: any[], stats: Map<string, { views: number; likes: number; comments: number }>) {
  let filled = 0;
  for (const it of items) {
    const s = stats.get(String(it?.code));
    if (!s) continue;
    if (!Number(it.views) && s.views > 0) { it.views = s.views; filled++; }
    if (!Number(it.likes) && s.likes > 0) { it.likes = s.likes; filled++; }
    if (!Number(it.comments) && s.comments > 0) { it.comments = s.comments; filled++; }
  }
  return filled;
}

async function buildForUsername(username: string, pages = 4, lite = false) {
  if (ZYLA_CONNECTION_KEY) {
    const statsPromise = igPublicTimelineStats(username);
    const data = await zylaScrape(username, lite ? 1 : pages).catch(preserveZylaFailure);
    if (data?.profile && data.items.length) {
      const stats = await statsPromise;
      const filled = applyTimelineStats(data.items, stats);
      console.log(JSON.stringify({ event: "zyla_stats_backfill", username, items: data.items.length, known: stats.size, filled }));
      const cursor = zylaCursor(data);
      return {
        username, profile: data.profile,
        reels: data.items.filter((item: any) => item.isVideo),
        posts: data.items.filter((item: any) => !item.isVideo), highlights: [],
        profileOk: true, reelsOk: true, postsOk: true, highlightsOk: true,
        reelsHasMore: !!cursor, reelsNextCursor: cursor,
        postsHasMore: false, postsNextCursor: "",
      };
    }
  }
  const requestedItemCount = lite ? 24 : 350;
  if (!lite) paginationDeadline = Date.now() + PAGINATION_BUDGET_MS;
  // Start every real provider together. Keep a settled handler attached from
  // the beginning so a quick Alpha response cannot leave rejected fallback
  // promises unhandled in the edge runtime.
  const fastFallbacks = [
    withTimeout(wigScrape(username), lite ? 15_000 : 120_000, "wig").then((data) => {
      if (!data || (data.items.length === 0 && Number(data.profile?.postsCount || 0) > 0)) {
        throw new Error("wig_no_media");
      }
      return { source: "wig", data, highlights: [], reelsHasMore: false, reelsCursor: "" };
    }),
    withTimeout(clipsSaverScrape(username, pages), lite ? 30_000 : 140_000, "clips").then((data) => {
      if (!data || (data.items.length === 0 && Number(data.profile?.postsCount || 0) > 0)) {
        throw new Error("clipssaver_no_media");
      }
      return {
        source: "clipssaver", data, highlights: data.highlights,
        reelsHasMore: data.reelsHasMore, reelsCursor: data.reelsCursor,
      };
    }),
  ];
  // Start enrichers at the same time instead of waiting for Zyla and only then
  // starting Alpha. This removes a full provider timeout from failed clones.
  // Zyla already ran (and failed) above when its key exists; never pay twice.
  const zylaPromise = lite || ZYLA_CONNECTION_KEY ? Promise.resolve(null) : zylaScrape(username, 4).catch((e) => {
    console.warn(JSON.stringify({ event: "zyla_build_failed", username, err: (e as Error).message }));
    return null;
  });
  const alphaPromise = lite ? Promise.resolve(null) : alphaScrape(username).catch((e) => {
    console.warn(JSON.stringify({ event: "alpha_build_failed", username, err: (e as Error).message }));
    return null;
  });
  // Paginated public feed fills the grid up to 350 real posts (other providers
  // only return ~12 items).
  const publicPromise = lite ? Promise.resolve(null) : instagramPublicScrape(username, requestedItemCount).catch(() => null);
  // RapidAPI Looter gives exact followers/following/avatar; run it in quick mode too.
  const looterPromise = withTimeout(looterProfileOnly(username), 20_000, "looter").catch((e) => {
    console.warn(JSON.stringify({ event: "looter_build_failed", username, err: (e as Error).message }));
    return null;
  });
  // Free public-page fallback for when Looter is out of quota or down.
  const htmlPromise = igHtmlProfile(username).catch(() => null);
  // The public feed still works from the backend and carries the owner's photo.
  const feedAvatarPromise = igPublicFeedPage(username).then((page) => {
    const u = page?.items?.[0]?.user;
    return String(u?.hd_profile_pic_url_info?.url || u?.profile_pic_url || "");
  }).catch(() => "");
  const [fallbackResults, zylaData, alphaData, publicData, looterData, htmlProfile, feedAvatar] = await Promise.all([
    Promise.allSettled(fastFallbacks),
    zylaPromise,
    alphaPromise,
    publicPromise,
    looterPromise,
    htmlPromise,
    feedAvatarPromise,
  ]);
  const realAvatar = (v: any) => (v && !/static\.cdninstagram\.com\/rsrc/.test(String(v)) ? String(v) : "");
  const fillProfile = (p: any) => {
    const lp: any = looterData?.profile || {};
    const hp: any = htmlProfile || {};
    const realName = (v: any) => (v && v !== username ? v : "");
    return {
      ...p,
      fullName: realName(lp.fullName) || realName(p.fullName) || realName(hp.fullName) || p.fullName || username,
      bio: lp.bio || p.bio || "",
      // Exact source first, then whatever provider gave media, then public page.
      avatarUrl: realAvatar(lp.avatarUrl) || realAvatar(p.avatarUrl) || realAvatar(feedAvatar) || realAvatar(hp.avatarUrl) || "",
      isVerified: !!(lp.isVerified || p.isVerified),
      followers: lp.followers || p.followers || hp.followers || zylaData?.profile?.followers || alphaData?.profile?.followers || publicData?.profile?.followers || 0,
      following: lp.following ?? hp.following ?? (p.following || zylaData?.profile?.following || alphaData?.profile?.following || publicData?.profile?.following || 0),
      postsCount: lp.postsCount || hp.postsCount || p.postsCount || 0,
      category: p.category || lp.category || "",
      externalUrl: p.externalUrl || lp.externalUrl || "",
    };
  };

  // A first-success race previously returned WIG's six-item preview and threw
  // away the remaining real posts. Merge all successful providers by shortcode
  // instead, preserving primary metrics first and returning at most 30 items.
  const successfulFallbacks = fallbackResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  // Reconcile metrics across providers instead of blindly keeping the first
  // occurrence: same shortcode can come back with 0 likes from one provider
  // and the real value from another, which made counts look random.
  const clipsData = successfulFallbacks.find((result) => result.source === "clipssaver")?.data;
  const wigData = successfulFallbacks.find((result) => result.source === "wig")?.data;
  const mergedItems = mergeItemsByCode([
    // ClipsSaver is authoritative for the cloned reel's public metrics and its
    // directly playable MP4. Other providers only fill fields it omitted.
    ...(clipsData?.items || []),
    ...(zylaData?.items || []),
    ...(alphaData?.items || []),
    ...(((looterData as any)?.items || []) as any[]),
    ...(wigData?.items || []),
    ...(((publicData as any)?.items || []) as any[]),
  ]);
  // Sort newest-first BEFORE trimming. Previously the list was cut in provider
  // order, so a freshly uploaded post that only one provider returned (or that
  // came back late in ClipsSaver's list) was dropped and never cloned.
  mergedItems.sort((a: any, b: any) => {
    const aTime = Number(a?.takenAt) || 0;
    const bTime = Number(b?.takenAt) || 0;
    if (aTime === bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return bTime - aTime;
  });
  const allItems = mergedItems.slice(0, requestedItemCount);


  // Some providers omit playCount / like / comment counts, so items can come
  // back with 0. Backfill the REAL values by shortcode from any provider that
  // does report them (fallbacks first, then the public IG web feed).
  const missingStats = allItems.filter(
    (x: any) => (x.isVideo && !x.views) || !x.likes || !x.comments,
  );
  if (missingStats.length > 0) {
    const statMap = new Map<string, { views: number; likes: number; comments: number; shares: number; reposts: number }>();
    const collect = (items: any[]) => {
      for (const it of items || []) {
        if (!it?.code) continue;
        const key = String(it.code);
        const prev = statMap.get(key) || { views: 0, likes: 0, comments: 0, shares: 0, reposts: 0 };
        statMap.set(key, {
          views: prev.views || Number(it.views || 0),
          likes: prev.likes || Number(it.likes || 0),
          comments: prev.comments || Number(it.comments || 0),
          shares: prev.shares || Number(it.shares || 0),
          reposts: prev.reposts || Number(it.reposts || 0),
        });
      }
    };
    collect((zylaData?.items || []) as any[]);
    collect((alphaData?.items || []) as any[]);
    for (const result of successfulFallbacks) collect(result.data.items || []);
    const needsPublic = missingStats.some((x: any) => {
      const s = statMap.get(String(x.code));
      return !s || (x.isVideo && !x.views && !s.views) || (!x.likes && !s.likes);
    });
    if (needsPublic && !lite) {
      const pub = publicData || (pastDeadline() ? null : await instagramPublicScrape(username, 24).catch(() => null));
      collect((pub?.items || []) as any[]);
    }
    let filled = 0;
    for (const it of allItems as any[]) {
      const s = statMap.get(String(it.code));
      if (!s) continue;
      if (!it.views && s.views > 0) { it.views = s.views; filled++; }
      if (!it.likes && s.likes > 0) { it.likes = s.likes; filled++; }
      if (!it.comments && s.comments > 0) { it.comments = s.comments; filled++; }
      if (!it.shares && s.shares > 0) { it.shares = s.shares; filled++; }
      if (!it.reposts && s.reposts > 0) { it.reposts = s.reposts; filled++; }
    }
    console.log(JSON.stringify({
      event: "stats_backfill", username,
      missing: missingStats.length, filled, mapSize: statMap.size,
    }));
  }


  if (allItems.length > 0) {
    // Some providers label photo posts as videos and put the image URL in
    // videoUrl. Those posts have no public view count, so they showed "0 views".
    for (const it of allItems as any[]) {
      const v = String(it.videoUrl || "").split("?")[0].toLowerCase();
      if (v && /\.(jpe?g|png|webp|heic|avif)$/.test(v)) { it.videoUrl = ""; it.isVideo = false; }
    }
    const fallbackProfile = successfulFallbacks.find((result) => result.data.profile)?.data.profile;
    const profile = clipsData?.profile || zylaData?.profile || alphaData?.profile || fallbackProfile || {
      username, fullName: username, bio: "", avatarUrl: "",
      isVerified: false, followers: 0, following: 0, postsCount: allItems.length,
      category: "", externalUrl: "",
    };

    console.log(JSON.stringify({
      event: "providers_merged", username, items: allItems.length,
      zylaItems: zylaData?.items.length || 0,
      alphaItems: alphaData?.items.length || 0,
      fallbackSources: successfulFallbacks.map((result) => result.source),
      followers: profile.followers,
    }));

    return {
      username,
      profile: fillProfile({ ...profile, postsCount: profile.postsCount || allItems.length }),
      reels: allItems.filter((x: any) => !!x.isVideo),
      posts: allItems.filter((x: any) => !x.isVideo),
      highlights: successfulFallbacks.flatMap((result) => result.highlights || []),
      profileOk: true, reelsOk: true, postsOk: true, highlightsOk: true,
      postsHasMore: false,
      reelsHasMore: successfulFallbacks.some((result) => result.reelsHasMore),
      postsNextCursor: "",
      reelsNextCursor: successfulFallbacks.find((result) => result.reelsCursor)?.reelsCursor || "",
    };
  }
  console.warn(JSON.stringify({ event: "fast_fallbacks_failed", username, err: "no_real_media" }));


  // 1) Instagram public web feed (unauth) — gives up to ~25 posts with video URLs.
  //    Run Railway legacy in parallel purely to enrich profile stats (followers/bio).
  const [pub, legacy] = await Promise.all([
    instagramPublicScrape(username, 25),
    legacyFallback(username).catch(() => null),
  ]);

  // Accept small/new accounts too. Some valid public profiles have 0 followers
  // or only 1-2 posts, so requiring 12+ items incorrectly rejected them.
  const publicHasExpectedMedia = !!pub && (pub.items.length > 0 || Number(pub.profile?.postsCount || 0) === 0);
  if (pub && publicHasExpectedMedia && (pub.profile || pub.items.length > 0)) {
    let profile = pub.profile || {
      username, fullName: username, bio: "", avatarUrl: "",
      isVerified: false, followers: 0, following: 0,
      postsCount: pub.items.length, category: "", externalUrl: "",
    };
    if (legacy?.profile) {
      profile = {
        ...profile,
        fullName: profile.fullName || legacy.profile.fullName,
        bio: profile.bio || legacy.profile.bio,
        avatarUrl: profile.avatarUrl || legacy.profile.avatarUrl,
        isVerified: profile.isVerified || legacy.profile.isVerified,
        followers: profile.followers || legacy.profile.followers,
        following: profile.following || legacy.profile.following,
        postsCount: legacy.profile.postsCount || profile.postsCount,
        category: profile.category || legacy.profile.category,
      };
    }
    return {
      username,
      profile: fillProfile({ ...profile, postsCount: profile.postsCount || pub.items.length }),
      reels: pub.items.filter((x) => x.isVideo),
      posts: pub.items.filter((x) => !x.isVideo),
      highlights: [] as Array<{ id: string; name: string; image: string }>,
      profileOk: true, reelsOk: true, postsOk: true, highlightsOk: true,
      postsHasMore: false, reelsHasMore: false,
      postsNextCursor: "", reelsNextCursor: "",
    };
  }

  const rapid = await rapidApiScrape(username);
  const rapidHasExpectedMedia = !!rapid && (rapid.items.length > 0 || Number(rapid.profile?.postsCount || 0) === 0);
  if (rapid && rapidHasExpectedMedia && (rapid.profile || rapid.items.length)) {
    const profile = rapid.profile || {
      username,
      fullName: username,
      bio: "",
      avatarUrl: "",
      isVerified: false,
      followers: 0,
      following: 0,
      postsCount: rapid.items.length,
      category: "",
      externalUrl: "",
    };
    const items = rapid.items;
    return {
      username,
      profile: fillProfile({ ...profile, postsCount: profile.postsCount || items.length }),
      reels: items.filter((x) => x.isVideo),
      posts: items.filter((x) => !x.isVideo),
      highlights: [] as Array<{ id: string; name: string; image: string }>,
      profileOk: true,
      reelsOk: true,
      postsOk: true,
      highlightsOk: true,
      postsHasMore: false,
      reelsHasMore: false,
      postsNextCursor: "",
      reelsNextCursor: "",
    };
  }

  const [info, postsResp] = await Promise.all([
    fetchJson<PrimaryInfo>(
      `${PRIMARY_BASE}/info?username=${encodeURIComponent(username)}`,
      PRIMARY_TIMEOUT_MS,
    ),
    fetchJson<{ total?: number; posts?: PrimaryPost[] }>(
      `${PRIMARY_BASE}/posts?username=${encodeURIComponent(username)}`,
      PRIMARY_TIMEOUT_MS,
    ),
  ]);

  let items = (postsResp?.posts || []).map(normalizeItem);
  let profile: any = null;
  if (info) {
    profile = {
      username: info.username || username,
      fullName: info.full_name || "",
      bio: info.bio || "",
      avatarUrl: info.profile_picture || "",
      isVerified: !!info.is_verified,
      followers: Number(info.followers || 0),
      following: Number(info.following || 0),
      postsCount: Number(info.posts || items.length),
      category: info.category || "",
      externalUrl: info.website || "",
    };
  }

  if (items.length === 0) {
    const fb = await legacyFallback(username);
    if (fb) {
      items = fb.items;
      if (!profile) profile = fb.profile;
    }
  }

  if ((!profile && items.length === 0) || (items.length === 0 && Number(profile?.postsCount || 0) > 0)) return null;

  if (!profile) {
    profile = {
      username,
      fullName: username,
      bio: "",
      avatarUrl: "",
      isVerified: false,
      followers: 0,
      following: 0,
      postsCount: items.length,
      category: "",
      externalUrl: "",
    };
  }

  const reels = items.filter((x) => x.isVideo);
  const posts = items.filter((x) => !x.isVideo);

  return {
    username,
    profile: fillProfile(profile),
    reels,
    posts,
    highlights: [] as Array<{ id: string; name: string; image: string }>,
    profileOk: true,
    reelsOk: true,
    postsOk: true,
    highlightsOk: true,
    postsHasMore: false,
    reelsHasMore: false,
    postsNextCursor: "",
    reelsNextCursor: "",
  };
}

// ---- HTTP handler ----------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = req.headers.get("x-trace-id") || newTraceId();
  const startedAt = Date.now();

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { "x-trace-id": traceId });
  }

  // ---- auth ----
  const accessKey = req.headers.get("x-access-key") || "";
  const deviceFp = req.headers.get("x-device-fp") || "";
  const auth = await validateAccessKey(accessKey, deviceFp);
  if (!auth.ok) {
    const temporaryFailure = auth.reason === "lookup_failed" ||
      auth.reason === "lookup_error" || auth.reason === "server_misconfig";
    return json(
      { error: "unauthorized", reason: auth.reason },
      temporaryFailure ? 503 : 401,
      { "x-trace-id": traceId },
    );
  }

  // ---- parse body ----
  let body: { username?: string; force?: boolean; cursor?: string; pages?: number } = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "invalid_json" }, 400, { "x-trace-id": traceId });
  }
  const raw = String(body.username || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,40}$/.test(raw)) {
    return json({ error: "invalid_username" }, 400, { "x-trace-id": traceId });
  }
  const cursor = typeof body.cursor === "string" ? body.cursor : "";
  const pages = Math.min(Math.max(Number(body.pages) || 4, 1), 30);

  // ---- pagination request: only fetch the next reels page ----
  if (cursor) {
    try {
      if (cursor.startsWith("zyla:")) {
        const cursors = JSON.parse(decodeURIComponent(cursor.slice(5)));
        if (typeof cursors.reels !== "string" || typeof cursors.posts !== "string") return json({ error: "invalid_cursor" }, 400);
        const [reels, posts] = await Promise.all([
          cursors.reels ? zylaPages(raw, 1, true, cursors.reels) : Promise.resolve(null),
          cursors.posts ? zylaPages(raw, 1, false, cursors.posts) : Promise.resolve(null),
        ]);
        const next = zylaCursor({ profile: null, items: [], reels, posts });
        const items = dedupeByCode([...(reels?.items || []), ...(posts?.items || [])]);
        return json({ username: raw, reels: items.filter((item: any) => item.isVideo), posts: items.filter((item: any) => !item.isVideo), paginated: true, reelsNextCursor: next, reelsHasMore: !!next, postsNextCursor: "", postsHasMore: false }, 200, { "x-trace-id": traceId });
      }
      const page = await clipsReelPages(raw, 1, cursor);
      return json(
        {
          username: raw,
          reels: page.reels,
          posts: [],
          paginated: true,
          reelsNextCursor: page.cursor,
          reelsHasMore: page.hasMore,
          postsNextCursor: "",
          postsHasMore: false,
        },
        200,
        { "x-trace-id": traceId, "x-cache": "MISS", "x-duration-ms": String(Date.now() - startedAt) },
      );
    } catch (e) {
      if (e instanceof ZylaProviderError) return json({ error: "provider_request_failed", message: e.message }, e.status, { "x-trace-id": traceId });
      console.warn(JSON.stringify({ event: "paginate_failed", username: raw, err: (e as Error).message }));
      return json({ error: "pagination_failed" }, 502, { "x-trace-id": traceId });
    }
  }

  // ---- cache lookup ----
  // pages <= 1 is the lightweight request used by the Home feed, stories and
  // the first quick step of a clone: profile + newest posts in a few seconds.
  const lite = Number(body.pages || 0) === 1;
  const fullKey = `${raw}:full`;
  const liteKey = `${raw}:lite`;
  const myKey = lite ? liteKey : fullKey;
  const hdr = (cache: string, at?: number) => ({
    "x-trace-id": traceId,
    "x-cache": cache,
    ...(at ? { "x-cache-age": String(Math.round((Date.now() - at) / 1000)) } : {}),
    "x-duration-ms": String(Date.now() - startedAt),
  });

  const runBuild = async () => {
    const payload = await buildForUsername(raw, pages, lite);
    const complete = !!payload && Number((payload as any).profile?.followers || 0) > 0 &&
      (((payload as any).reels?.length || 0) + ((payload as any).posts?.length || 0) > 0);
    if (payload && complete) {
      CACHE.set(myKey, { at: Date.now(), payload });
      if (CACHE.size > 500) {
        const oldestKey = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
        if (oldestKey) CACHE.delete(oldestKey);
      }
      await dbCacheSet(myKey, payload);
    }
    return payload;
  };

  if (!body.force) {
    const mem = CACHE.get(myKey) || (lite ? CACHE.get(fullKey) : undefined);
    if (mem && Date.now() - mem.at < CACHE_TTL_MS) {
      const out = lite
        ? { ...mem.payload, reels: (mem.payload.reels || []).slice(0, 15), posts: (mem.payload.posts || []).slice(0, 15) }
        : mem.payload;
      return json(out, 200, hdr("HIT", mem.at));
    }
    // A full clone payload is a superset of the lite one, so either can serve lite.
    const candidates = lite ? await Promise.all([dbCacheGet(liteKey), dbCacheGet(fullKey)]) : [await dbCacheGet(fullKey)];
    const db = candidates.filter((entry): entry is CacheRec => !!entry && Number(entry.payload?.profile?.followers) > 0).sort((a, b) => b.at - a.at)[0] || null;
    // Signed media links inside a saved payload expire after a few hours;
    // serving them showed "No preview" everywhere, so rebuild instead.
    if (db && Date.now() - db.at < DB_STALE_MS && !payloadMediaExpired(db.payload)) {
      const age = Date.now() - db.at;
      // No background rebuilds: every paid provider call must come from a user search.
      if (false && age >= DB_FRESH_MS && !REFRESHING.has(myKey)) {
        REFRESHING.add(myKey);
        const task = runBuild().catch(() => null).finally(() => REFRESHING.delete(myKey));
        // @ts-ignore EdgeRuntime is a Supabase Deno global
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
      }
      // Quick requests only need the newest posts; trim a full clone payload
      // so the Home feed downloads kilobytes instead of megabytes.
      const out = lite
        ? { ...db.payload, reels: (db.payload.reels || []).slice(0, 15), posts: (db.payload.posts || []).slice(0, 15) }
        : db.payload;
      return json(out, 200, hdr(age < DB_FRESH_MS ? "HIT-DB" : "STALE", db.at));
    }
  }

  // ---- notify admins about live search (fire-and-forget) ----
  if (!lite) {
    broadcastSearchToAdmins(raw, traceId, {
      label: auth.label,
      keyMasked: auth.keyMasked,
    });
  }

  // ---- build payload ----
  try {
    const payload = await runBuild();

    if (!payload) {
      const failure = unavailableResult(raw);
      return json(
        failure.body,
        failure.status,
        { "x-trace-id": traceId },
      );
    }
    return json(payload, 200, hdr("MISS"));
  } catch (e) {
    if (e instanceof ZylaProviderError) return json({ error: "provider_request_failed", message: e.message }, e.status, { "x-trace-id": traceId });
    console.error(JSON.stringify({
      t: new Date().toISOString(), level: "error", trace: traceId,
      event: "scrape_failed", username: raw, err: (e as Error).message,
    }));
    return json(
      { error: "scraper_failed", message: "Instagram data provider is temporarily down." },
      502,
      { "x-trace-id": traceId },
    );
  }
});