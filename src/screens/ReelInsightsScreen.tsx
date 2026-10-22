import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import InsightDetailSkeleton from "@/components/InsightDetailSkeleton";
import { Button } from "@/components/ui/button";
import * as React from "react";

import { ArrowLeft, MoreVertical, Heart, MessageCircle, Bookmark, Info, Pencil, X, Plus, TrendingUp, ChevronRight, Clock, RefreshCw } from "lucide-react";
import InstagramShareIcon from "@/components/icons/InstagramShareIcon";
import RepostIcon from "@/components/icons/RepostIcon";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import { mockAccounts, currentUser } from "@/data/mockData";
import { getCurrentReelsScope, loadReelsData, saveReelsData } from "@/data/reelInsightsData";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid, ReferenceLine, LineChart, Line } from "recharts";
import GraphEditorModal from "@/components/GraphEditorModal";
import RetentionEditorModal from "@/components/RetentionEditorModal";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { applyOverrideToReel, getOverrideSync, getReelsAccountKey, mergeAndSaveOverride } from "@/lib/reelsDataStore";
import { getReelGraphVisibility, setReelGraphVisibility } from "@/lib/reelGraphVisibility";
import { AnimatePresence, motion } from "framer-motion";

// Seeded pseudo-random number generator
const seededRandom = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

// Auto-calculate the next nice Y-axis interval (Instagram style: steps of 1, 2, 2.5, 5, 10)
const getNiceTopValue = (val: number) => {
  if (val <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / magnitude;
  let nextNorm;
  if (norm <= 1) nextNorm = 1;
  else if (norm <= 2) nextNorm = 2;
  else if (norm <= 2.5) nextNorm = 2.5;
  else if (norm <= 5) nextNorm = 5;
  else nextNorm = 10;
  return nextNorm * magnitude;
};

// Generate graph: pink line peaks at center (bell curve), gray line flat at top
const generateOrganicGraph = (totalViews: number, seed: number, startDate: string, typicalTop?: number) => {
  // Parse start date
  const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const parts = startDate.trim().split(" ");
  const day = parseInt(parts[0]) || 1;
  const monthStr = parts[1] || "Jan";
  const month = months[monthStr] ?? 0;
  const baseDate = new Date(2025, month, day);

  const rng = seededRandom(seed + totalViews + 7);
  const numPoints = 5;
  const points: { day: string; thisReel: number; typical: number }[] = [];
  const peak = totalViews;
  const topVal = typicalTop ?? Math.round(peak * 0.55);

  // Bell curve ratios for pink line with slight randomization
  const bellBase = [0, 0.55, 1.0, 0.65, 0.15];
  const typicalBase = [0, 0.45, 0.75, 0.9, 0.95];

  for (let i = 0; i < numPoints; i++) {
    const dayOffset = i === 0 ? 0 : Math.round((i * 22) / (numPoints - 1));
    const date = new Date(baseDate);
    date.setDate(date.getDate() + dayOffset);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = i === 0 || i === 2 || i === 4 ? `${date.getDate()} ${monthNames[date.getMonth()]}` : "";

    // Add slight variation per reel (±10%)
    const bellVar = i === 0 ? 0 : bellBase[i] * (0.9 + rng() * 0.2);
    const typVar = i === 0 ? 0 : typicalBase[i] * (0.85 + rng() * 0.3);

    points.push({
      day: label,
      thisReel: Math.round(peak * bellVar),
      typical: Math.round(topVal * typVar),
    });
  }

  return points;
};

// Helper: compute 3 X-axis date labels from a start date string like "23 Jan"
const computeXDates = (startDate: string): [string, string, string] => {
  const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11, January: 0, February: 1, March: 2, April: 3, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const parts = startDate.trim().split(" ");
  const day = parseInt(parts[0]) || 1;
  const monthStr = parts[1] || "Jan";
  const month = months[monthStr] ?? months[monthStr.slice(0, 3)] ?? 0;
  const baseDate = new Date(2025, month, day);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const offsets = [0, 11, 22]; // indices 0, 2, 4 → dayOffset formula
  return offsets.map(off => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + off);
    return `${d.getDate()} ${monthNames[d.getMonth()]}`;
  }) as [string, string, string];
};

const defaultCountries = [
  { name: "India", pct: 54.1 },
  { name: "Iran", pct: 19.9 },
  { name: "Uzbekistan", pct: 5.7 },
  { name: "Türkiye", pct: 2.6 },
  { name: "Kazakhstan", pct: 1.6 },
];

const defaultAgeGroups = [
  { range: "13-17", pct: 32.3 },
  { range: "18-24", pct: 35.9 },
  { range: "25-34", pct: 20.2 },
  { range: "35-44", pct: 7.1 },
  { range: "45-54", pct: 2.3 },
  { range: "55-64", pct: 0.8 },
  { range: "65+", pct: 1.4 },
];

const hasAudienceRows = <T,>(items: T[] | undefined): items is T[] => Array.isArray(items) && items.length > 0;

const ReelInsightsScreen = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [revealStage, setRevealStage] = useState(0);
  useEffect(() => {
    const pageTimer = setTimeout(() => setIsLoading(false), 120);
    const metricsTimer = setTimeout(() => setRevealStage(1), 600);
    const summaryTimer = setTimeout(() => setRevealStage(2), 1500);
    return () => {
      clearTimeout(pageTimer);
      clearTimeout(metricsTimer);
      clearTimeout(summaryTimer);
    };
  }, []);
  const searchParams = new URLSearchParams(window.location.search);
  const accountUsername = searchParams.get("account") || "just4abhii";
  const requestedMediaId = searchParams.get("media") || "";
  const account = mockAccounts[accountUsername] || mockAccounts["just4abhii"] || Object.values(mockAccounts)[0];
  const routeIndex = Math.max(0, parseInt(id || "0") || 0);

  const isMainAccount =
    accountUsername === "just4abhii" ||
    account?.profile === currentUser ||
    accountUsername.toLowerCase() === (currentUser.username || "").toLowerCase();
  const reelsAccountKey = getReelsAccountKey(accountUsername, isMainAccount);
  const reelsScope = getCurrentReelsScope(account?.profile?.username || accountUsername);
  const reelsData = isMainAccount ? loadReelsData() : null;
  const postIndex = (() => {
    if (!requestedMediaId || !reelsData) return routeIndex;
    const matchedIndex = reelsData.findIndex((reel) => reel.sourceId === requestedMediaId);
    return matchedIndex >= 0 ? matchedIndex : routeIndex;
  })();
  const sourceId = reelsData?.[postIndex]?.sourceId;
  const [savedOverride, setSavedOverride] = useState<Record<string, unknown> | null>(() => getOverrideSync(reelsAccountKey, postIndex, sourceId));
  const fallbackPost = account?.posts?.[postIndex] || account?.posts?.[0];
  // Base reel: real data for the owned account, otherwise a light shell built
  // from the browsed account's grid item. Either way saved overrides (edits)
  // are applied on top so "Save changes" persists for EVERY account.
  const basePost: any = isMainAccount && reelsData?.[postIndex]
    ? reelsData[postIndex]
    : {
      thumbnail: (fallbackPost as any)?.thumbnail,
      videoUrl: (fallbackPost as any)?.videoUrl,
      caption: (fallbackPost as any)?.caption,
      insights: {
        views: (fallbackPost as any)?.views,
        likes: (fallbackPost as any)?.likes,
        comments: (fallbackPost as any)?.comments,
      },
    };
  const post = applyOverrideToReel(basePost, savedOverride);
  console.log("[Insights] isMain:", isMainAccount, "postIndex:", postIndex, "graphStartDate:", post?.graphStartDate, "views:", post?.insights?.views, "caption:", post?.caption?.slice(0, 20));

  // Thumbnail: prioritize custom thumbnail, then auto-generate from video URL
  const getPostImage = () => {
    if (post?.thumbnail) return post.thumbnail;
    if (post?.videoUrl?.includes("streamable.com")) {
      const idMatch = post.videoUrl.match(/streamable\.com\/(?:e\/|o\/)?([a-zA-Z0-9]+)/);
      const videoId = idMatch ? idMatch[1] : post.videoUrl.split("/").pop();
      return `https://cdn-cf-east.streamable.com/image/${videoId}.jpg`;
    }
    return fallbackPost?.thumbnail;
  };
  const [postImage, setPostImage] = useState(getPostImage());
  const [postVideoUrl, setPostVideoUrl] = useState(post?.videoUrl || "");
  const [postCaption, setPostCaption] = useState(post?.caption || "❤️🤍...");
  const [retentionImageUrl, setRetentionImageUrl] = useState<string>((post as any)?.retentionImage || '');
  const [viewsGraphImageUrl, setViewsGraphImageUrl] = useState<string>((post as any)?.viewsGraphImage || '');
  const [sourcesImageUrl, setSourcesImageUrl] = useState<string>((post as any)?.sourcesImage || '');
  const [actionsImageUrl, setActionsImageUrl] = useState<string>((post as any)?.actionsImage || '');
  const [interactionsImageUrl, setInteractionsImageUrl] = useState<string>((post as any)?.interactionsImage || '');
  const [impactsImageUrl, setImpactsImageUrl] = useState<string>((post as any)?.impactsImage || '');
  const [sourcesImageSaving, setSourcesImageSaving] = useState(false);
  const [actionsImageSaving, setActionsImageSaving] = useState(false);
  const [interactionsImageSaving, setInteractionsImageSaving] = useState(false);
  const sourcesImageInputRef = useRef<HTMLInputElement>(null);
  const actionsImageInputRef = useRef<HTMLInputElement>(null);
  const interactionsImageInputRef = useRef<HTMLInputElement>(null);

  // Get insights data
  const ins = post?.insights || null;

  const [viewsFilter, setViewsFilter] = useState("All");
  const filterOrder = ["All", "Followers", "Non-followers"];
  const [audienceTab, setAudienceTab] = useState("Age");

  // Editable state - all values can be long-pressed to edit
  // Use the exact public values attached to this media. Zero means unavailable;
  // inventing an index-based fallback made the grid, reel and insights disagree.
  const [editViews, setEditViews] = useState(Math.max(0, Number(ins?.views) || 0));
  const [editLikes, setEditLikes] = useState(Math.max(0, Number(ins?.likes) || 0));
  const [editComments, setEditComments] = useState(ins?.comments ?? 11);
  const [editShares, setEditShares] = useState(ins?.shares ?? 2);
  const [editSaves, setEditSaves] = useState(ins?.saves ?? 8);
  const [editReposts, setEditReposts] = useState(ins?.reposts ?? 0);
  // A saved 0% is a legitimate edit (Non-followers = 100%), so only fall back
  // to the default when no numeric value was ever stored.
  const [editFollowerPct, setEditFollowerPct] = useState(
    Number.isFinite(savedOverride?.followerViewsPct as number)
      ? Number(savedOverride!.followerViewsPct)
      : Number.isFinite(ins?.followerViewsPct as number) && (ins!.followerViewsPct > 0 || savedOverride != null)
        ? Number(ins!.followerViewsPct)
        : 36
  );
  const [editGenderMale, setEditGenderMale] = useState(
    Number.isFinite(savedOverride?.genderMale as number)
      ? Number(savedOverride!.genderMale)
      : ins?.genderMale && ins.genderMale > 0 ? ins.genderMale : 56
  );

  const [editViewRate, setEditViewRate] = useState(ins?.viewRatePast3Sec ?? 42);
  const [editStartDate, setEditStartDate] = useState(post?.graphStartDate || ins?.viewsOverTime?.[0]?.day || "23 Jan");
  const [editDisplayDate, setEditDisplayDate] = useState((post as any)?.displayDate || post?.graphStartDate || "5 February");
  const [editDuration, setEditDuration] = useState(post?.duration || "0:10");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [graphEditorOpen, setGraphEditorOpen] = useState(false);
  // Restore a previously-saved custom graph from localStorage on mount so
  // user-drawn views graphs persist across refreshes.
  const [customGraphData, setCustomGraphData] = useState<{ day: string; thisReel: number | null; typical: number | null }[] | null>(() => {
    const vot: any = ins?.viewsOverTime;
    if (Array.isArray(vot) && vot.length >= 5 && vot.some((d: any) => typeof d?.thisReel === "number")) {
      return vot.map((d: any) => ({
        day: d.day ?? "",
        thisReel: typeof d.thisReel === "number" ? d.thisReel : null,
        typical: typeof d.typical === "number" ? d.typical : null,
      }));
    }
    return null;
  });
  const [editTypicalTop, setEditTypicalTop] = useState((post as any)?.editTypicalTop ?? Math.round((ins?.views ?? 1000) * 0.55));
  const [editGraphYMax, setEditGraphYMax] = useState<number | null>(null);

  // Watch time editable state
  const [editWatchTime, setEditWatchTime] = useState(ins?.watchTime || "1h 3m 53s");
  const [editAvgWatchTime, setEditAvgWatchTime] = useState(ins?.avgWatchTime || "6 sec");

  // Retention state
  const [editSkipRate, setEditSkipRate] = useState(ins?.skipRate ?? 28.2);
  const [editTypicalSkipRate, setEditTypicalSkipRate] = useState(ins?.typicalSkipRate ?? 54.7);
  const [editRetentionCurve, setEditRetentionCurve] = useState<{ t: string; pct: number | null }[]>(
    ins?.retentionCurve || [
      { t: "0:00", pct: 100 },
      { t: "", pct: 68 },
      { t: "0:12", pct: 42 },
      { t: "", pct: 2 },
      { t: "0:19", pct: 2 },
    ]
  );
  const [editEngagementCurve, setEditEngagementCurve] = useState<{ t: string; pct: number | null }[]>(
    (ins as any)?.engagementCurve || (post as any)?.engagementCurve || ins?.retentionCurve || [
      { t: "0:00", pct: 68 },
      { t: "", pct: 0 },
      { t: "", pct: 18 },
      { t: "", pct: 0 },
      { t: "0:30", pct: 0 },
    ]
  );
  const [typicalRetentionCurve, setTypicalRetentionCurve] = useState<{ t: string; pct: number }[]>(
    ins?.typicalRetentionCurve || [
      { t: "0:00", pct: 100 },
      { t: "", pct: 55 },
      { t: "", pct: 32 },
      { t: "", pct: 15 },
      { t: "0:19", pct: 8 },
    ]
  );
  const [retentionEditorOpen, setRetentionEditorOpen] = useState(false);
  const [retentionEditorMode, setRetentionEditorMode] = useState<"retention" | "engagement">("retention");
  const [editYCenter, setEditYCenter] = useState(post?.yCenter ?? 500);
  const [editYTop, setEditYTop] = useState(post?.yTop ?? 1000);
  const [editYCenterLabel, setEditYCenterLabel] = useState<string>((post as any)?.yCenterLabel || "");
  const [editYTopLabel, setEditYTopLabel] = useState<string>((post as any)?.yTopLabel || "");
  const [editEngagementYCenter, setEditEngagementYCenter] = useState((post as any)?.engagementYCenter ?? 35);
  const [editEngagementYTop, setEditEngagementYTop] = useState((post as any)?.engagementYTop ?? 70);
  const [editRetentionYCenter, setEditRetentionYCenter] = useState((post as any)?.retentionYCenter ?? 50);
  const [editRetentionYTop, setEditRetentionYTop] = useState((post as any)?.retentionYTop ?? 100);


  // Prefer saved viewsOverTime labels (e.g. "0", "12h", "24h") over computed dates
  const [editXDate1, setEditXDate1] = useState(() => {
    if (savedOverride?.xDate1 !== undefined && savedOverride.xDate1 !== null) return String(savedOverride.xDate1);
    const vot = ins?.viewsOverTime;
    if (vot && vot.length >= 5 && vot[0].day) return vot[0].day;
    const dates = computeXDates(post?.graphStartDate || vot?.[0]?.day || "23 Jan");
    return dates[0];
  });
  const [editXDate2, setEditXDate2] = useState(() => {
    if (savedOverride?.xDate2 !== undefined && savedOverride.xDate2 !== null) return String(savedOverride.xDate2);
    const vot = ins?.viewsOverTime;
    if (vot && vot.length >= 3) {
      const midI = Math.floor((vot.length - 1) / 2);
      if (vot[midI]?.day) return vot[midI].day;
      if (vot[2]?.day) return vot[2].day;
    }
    const dates = computeXDates(post?.graphStartDate || vot?.[0]?.day || "23 Jan");
    return dates[1];
  });
  const [editXDate3, setEditXDate3] = useState(() => {
    if (savedOverride?.xDate3 !== undefined && savedOverride.xDate3 !== null) return String(savedOverride.xDate3);
    const vot = ins?.viewsOverTime;
    if (vot && vot.length >= 3) {
      const lastI = vot.length - 1;
      if (vot[lastI]?.day) return vot[lastI].day;
      if (vot[4]?.day) return vot[4].day;
    }
    const dates = computeXDates(post?.graphStartDate || vot?.[0]?.day || "23 Jan");
    return dates[2];
  });
  const [timeRangeMode, setTimeRangeMode] = useState<"custom" | "12h" | "24h">(((post as any)?.timeRangeMode as "custom" | "12h" | "24h") || "custom");
  const [showGraph, setShowGraph] = useState(() => getReelGraphVisibility(reelsAccountKey, postIndex));
  const [editCountries, setEditCountries] = useState(hasAudienceRows(ins?.countries) ? ins.countries : defaultCountries);
  const [editAgeGroups, setEditAgeGroups] = useState(hasAudienceRows(ins?.ageGroups) ? ins.ageGroups : defaultAgeGroups);
  const [editSources, setEditSources] = useState(
    hasAudienceRows(ins?.sources) ? ins!.sources : [
      { name: "Feed", pct: 63.4 }, { name: "Reels tab", pct: 11.1 }, { name: "Stories", pct: 10.6 }, { name: "Explore", pct: 7.4 },
    ]
  );
  const [editAccountsReached, setEditAccountsReached] = useState(ins?.accountsReached ?? 567);
  const [editFollows, setEditFollows] = useState(ins?.follows ?? 0);
  const [editInteractions, setEditInteractions] = useState<number | null>((post as any)?.interactions ?? null);
  const [monetisationStatus, setMonetisationStatus] = useState((post as any)?.monetisationStatus || "Not monetising");
  const [editTypicalViewRate, setEditTypicalViewRate] = useState((post as any)?.typicalViewRate ?? 41.1);
  const [editProfileVisits, setEditProfileVisits] = useState((post as any)?.profileVisits ?? 0);
  const [editAudienceText, setEditAudienceText] = useState((post as any)?.audienceText ?? "Audience demographics, such as top locations, age ranges and gender, are not available because fewer than 100 accounts interacted with your content during the selected time period.");
  const [activeTab, setActiveTab] = useState<"Overview" | "Engagement" | "Audience">("Overview");
  const longPressTimerRef = useRef<any>(null);

  // ── Supabase: save all editable state ──────────────────────────────────────
  const saveToSupabase = useCallback(async (overrides?: Record<string, unknown>) => {
    const data = {
      sourceUsername: account.profile.username,
      views: editViews, likes: editLikes, comments: editComments,
      shares: editShares, saves: editSaves, reposts: editReposts,
      followerViewsPct: editFollowerPct, genderMale: editGenderMale,
      viewRatePast3Sec: editViewRate,
      typicalViewRate: editTypicalViewRate,
      monetisationStatus,
      graphStartDate: editStartDate, displayDate: editDisplayDate,
      duration: editDuration,
      watchTime: editWatchTime, avgWatchTime: editAvgWatchTime,
      skipRate: editSkipRate, typicalSkipRate: editTypicalSkipRate,
      retentionCurve: editRetentionCurve,
      engagementCurve: editEngagementCurve,
      typicalRetentionCurve,
      customGraphData,
      yCenter: editYCenter, yTop: editYTop,
      yCenterLabel: editYCenterLabel, yTopLabel: editYTopLabel,
      engagementYCenter: editEngagementYCenter, engagementYTop: editEngagementYTop,
      retentionYCenter: editRetentionYCenter, retentionYTop: editRetentionYTop,
      editTypicalTop,
      xDate1: editXDate1, xDate2: editXDate2, xDate3: editXDate3,
      timeRangeMode,
      sources: editSources,
      countries: editCountries,
      ageGroups: editAgeGroups,
      accountsReached: editAccountsReached,
      follows: editFollows,
      interactions: editInteractions,
      profileVisits: editProfileVisits,
      audienceText: editAudienceText,
      thumbnail: postImage,
      videoUrl: postVideoUrl,
      caption: postCaption,
      retentionImage: retentionImageUrl,
      viewsGraphImage: viewsGraphImageUrl,
      sourcesImage: sourcesImageUrl,
      actionsImage: actionsImageUrl,
      interactionsImage: interactionsImageUrl,
      impactsImage: impactsImageUrl,
      ...overrides,
    };
    try {
      const saved = await mergeAndSaveOverride(reelsAccountKey, postIndex, data, sourceId);
      if (!saved) throw new Error("Unable to save reel override");
      setSavedOverride(prev => ({ ...(prev ?? {}), ...data }));
      try { window.dispatchEvent(new CustomEvent("reel-insights-updated", { detail: { index: postIndex, data, source: "self-insights", scope: reelsScope } })); } catch {}
    } catch (e) {
      console.warn('[ReelInsights] Save failed:', e);
      return false;
    }
    return true;
  }, [
    editViews, editLikes, editComments, editShares, editSaves, editReposts,
    editFollowerPct, editGenderMale, editViewRate, editTypicalViewRate, monetisationStatus,
    editStartDate, editDisplayDate, editDuration,
    editWatchTime, editAvgWatchTime,
    editSkipRate, editTypicalSkipRate, editRetentionCurve, editEngagementCurve, typicalRetentionCurve,
    customGraphData, editYCenter, editYTop, editYCenterLabel, editYTopLabel, editEngagementYCenter, editEngagementYTop, editRetentionYCenter, editRetentionYTop, editTypicalTop,
    editXDate1, editXDate2, editXDate3, timeRangeMode,
    editSources, editCountries, editAgeGroups, editAccountsReached, editFollows, editInteractions,
    editProfileVisits, editAudienceText, postImage, postVideoUrl, postCaption, retentionImageUrl, viewsGraphImageUrl, sourcesImageUrl, actionsImageUrl, interactionsImageUrl, impactsImageUrl,
    account.profile.username, reelsAccountKey, reelsScope, postIndex, sourceId,
  ]);

  // Remote Supabase load disabled: user's local edits should persist and
  // never be overwritten by remote fetches. State is hydrated from
  // localStorage via initial useState defaults only.

  // Live-sync: when ReelDetailScreen (or anywhere else) updates a reel's
  // insights, mirror the changes here so the Summary "Views" card and metric
  // icons reflect what the user sees on the thumbnail.
  useEffect(() => {
    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<{ index?: number; updates?: Record<string, number>; data?: Record<string, any>; source?: string; scope?: string }>;
      const detail = ce.detail || {};
      if (detail.scope && detail.scope !== reelsScope) return;
      if (detail.index != null && detail.index !== postIndex) return;
      // Ignore events we dispatched ourselves — they would overwrite the
      // user's in-progress edits with whatever was captured at dispatch time.
      if (detail.source === "self-insights") return;
      // Don't overwrite local edits while the user is actively editing.
      if (isEditMode) return;
      const u = detail.updates || detail.data;
      if (u) {
        if (u.views != null) setEditViews(u.views);
        if (u.likes != null) setEditLikes(u.likes);
        if (u.comments != null) setEditComments(u.comments);
        if (u.shares != null) setEditShares(u.shares);
        if (u.saves != null) setEditSaves(u.saves);
        if (u.reposts != null) setEditReposts(u.reposts);
        if (u.interactions != null) setEditInteractions(u.interactions);
      } else {
        // Fallback: re-read fresh data from localStorage when the event
        // didn't carry payload data (e.g. older event shape).
        try {
          const fresh = loadReelsData();
          const reel = fresh?.[postIndex];
          const ins = reel?.insights;
          if (ins) {
            if (typeof ins.views === "number" && ins.views > 0) setEditViews(ins.views);
            if (typeof ins.likes === "number" && ins.likes > 0) setEditLikes(ins.likes);
            if (typeof ins.comments === "number") setEditComments(ins.comments);
            if (typeof ins.shares === "number") setEditShares(ins.shares);
            if (typeof ins.saves === "number") setEditSaves(ins.saves);
            if (typeof ins.reposts === "number") setEditReposts(ins.reposts);
            if (typeof (reel as any).interactions === "number") setEditInteractions((reel as any).interactions);
          }
        } catch {}
      }
    };
    window.addEventListener("reel-insights-updated", handler as EventListener);
    return () => window.removeEventListener("reel-insights-updated", handler as EventListener);
  }, [postIndex, isEditMode, reelsScope]);
  // If saved viewsOverTime has custom labels at ANY of the 3 positions, mark as manually edited
  const hasCustomLabels = (() => {
    const vot = ins?.viewsOverTime;
    if (!vot || vot.length < 5) return false;
    const computed = computeXDates(post?.graphStartDate || vot[0]?.day || "23 Jan");
    return (vot[0].day && vot[0].day !== computed[0]) ||
      (vot[2].day && vot[2].day !== computed[1]) ||
      (vot[4].day && vot[4].day !== computed[2]);
  })();
  const xDatesManuallyEdited = useRef(
    !!hasCustomLabels ||
    savedOverride?.xDate1 !== undefined ||
    savedOverride?.xDate2 !== undefined ||
    savedOverride?.xDate3 !== undefined
  );

  // Sync X-axis dates when editStartDate changes (from display date edit) — skip if user manually edited
  useEffect(() => {
    if (timeRangeMode === "custom" && !xDatesManuallyEdited.current) {
      const newDates = computeXDates(editStartDate);
      setEditXDate1(newDates[0]);
      setEditXDate2(newDates[1]);
      setEditXDate3(newDates[2]);
    }
  }, [editStartDate]);

  // Edit modal state
  const [editModal, setEditModal] = useState<{ label: string; value: string; onSave: (v: number, raw?: string) => void; isText?: boolean } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Use editable values
  const views = editViews;
  const likes = editLikes;
  const comments = editComments;
  const shares = editShares;
  const saves = editSaves;
  const reposts = editReposts;
  const followerPct = editFollowerPct;
  const nonFollowerPct = 100 - followerPct;
  const viewRate = editViewRate;
  const genderMale = editGenderMale;
  const genderFemale = 100 - genderMale;
  const watchTime = editWatchTime;
  const avgWatchTime = editAvgWatchTime;
  const countries = hasAudienceRows(editCountries) ? editCountries : defaultCountries;
  const ageGroups = hasAudienceRows(editAgeGroups) ? editAgeGroups : defaultAgeGroups;
  const sources = editSources.slice(0, 4);
  const accountsReached = editAccountsReached;
  const follows = editFollows;

  // Generate separate graphs for All, Followers, Non-followers
  // customGraphData = user-drawn graph (Draw ON + save). Otherwise auto-generate from views count.
  // Compute effective X-axis labels based on time range mode
  const effectiveXLabels = useMemo(() => {
    if (timeRangeMode === "12h") {
      return ["0h", "6h", "12h"];
    }
    if (timeRangeMode === "24h") {
      return ["0h", "12h", "24h"];
    }
    return [editXDate1, editXDate2, editXDate3];
  }, [timeRangeMode, editXDate1, editXDate2, editXDate3]);

  const viewsOverTimeAll = useMemo(() => {
    if (customGraphData) {
      const lastI = customGraphData.length - 1;
      const midI = Math.floor(lastI / 2);
      const labeled = customGraphData.map((d, i) => {
        const labelIdx = i === 0 ? 0 : i === midI ? 1 : i === lastI ? 2 : -1;
        return {
          ...d,
          day: labelIdx >= 0 ? effectiveXLabels[labelIdx] : "",
        };
      });
      return labeled;
    }
    // Auto-generate, then override labels
    const generated = generateOrganicGraph(editViews, postIndex, editStartDate, editTypicalTop);
    return generated.map((d, i) => {
      const labelIdx = i === 0 ? 0 : i === 2 ? 1 : i === 4 ? 2 : -1;
      return { ...d, day: labelIdx >= 0 ? effectiveXLabels[labelIdx] : "" };
    });
  }, [customGraphData, editViews, postIndex, editStartDate, editTypicalTop, effectiveXLabels]);

  const viewsOverTimeFollowers = useMemo(() => {
    const ratio = followerPct / 100;
    return viewsOverTimeAll.map(d => ({
      ...d,
      thisReel: d.thisReel == null ? null : Math.round(d.thisReel * ratio),
      typical: d.typical == null ? null : Math.round(d.typical * ratio),
    }));
  }, [viewsOverTimeAll, followerPct]);

  const viewsOverTimeNonFollowers = useMemo(() => {
    const ratio = nonFollowerPct / 100;
    return viewsOverTimeAll.map(d => ({
      ...d,
      thisReel: d.thisReel == null ? null : Math.round(d.thisReel * ratio),
      typical: d.typical == null ? null : Math.round(d.typical * ratio),
    }));
  }, [viewsOverTimeAll, nonFollowerPct]);

  const viewsOverTime = viewsFilter === "Followers" ? viewsOverTimeFollowers
    : viewsFilter === "Non-followers" ? viewsOverTimeNonFollowers
      : viewsOverTimeAll;

  const computedInteractions = likes + comments + shares + saves;
  const totalInteractions = editInteractions ?? computedInteractions;
  const fmtNum = (n: number) => {
    if (!Number.isFinite(n)) return String(n);
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(abs >= 10_000_000_000_000 ? 0 : 1).replace(/\.0$/, '') + 'T';
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '') + 'B';
    return n >= 1000 ? n.toLocaleString() : String(n);
  };

  // Persist current edits back to localStorage
  const persistEdits = useCallback(() => {
    if (!isMainAccount) return;
    const freshData = loadReelsData();
    const reel = freshData[postIndex];
    if (!reel) return;
    reel.insights = {
      ...reel.insights,
      views: editViews,
      likes: editLikes,
      comments: editComments,
      shares: editShares,
      saves: editSaves,
      reposts: editReposts,
      followerViewsPct: editFollowerPct,
      genderMale: editGenderMale,
      genderFemale: 100 - editGenderMale,
      viewRatePast3Sec: editViewRate,
      skipRate: editSkipRate,
      typicalSkipRate: editTypicalSkipRate,
      retentionCurve: editRetentionCurve,
      engagementCurve: editEngagementCurve,
      watchTime: editWatchTime,
      avgWatchTime: editAvgWatchTime,
      sources: editSources,
      countries: editCountries,
      ageGroups: editAgeGroups,
      accountsReached: editAccountsReached,
      follows: editFollows,
      typicalRetentionCurve,
    };
    reel.graphStartDate = editStartDate;
    (reel as any).displayDate = editDisplayDate;
    reel.duration = editDuration;
    (reel as any).editTypicalTop = editTypicalTop;
    (reel as any).timeRangeMode = timeRangeMode;
    (reel as any).interactions = editInteractions;
    (reel as any).profileVisits = editProfileVisits;
    (reel as any).audienceText = editAudienceText;
    (reel as any).retentionImage = retentionImageUrl;
    (reel as any).viewsGraphImage = viewsGraphImageUrl;
    (reel as any).sourcesImage = sourcesImageUrl;
    (reel as any).actionsImage = actionsImageUrl;
    (reel as any).interactionsImage = interactionsImageUrl;
    (reel as any).impactsImage = impactsImageUrl;
    // Save custom X-axis labels into viewsOverTime (first / middle / last)
    if (reel.insights.viewsOverTime && reel.insights.viewsOverTime.length >= 3) {
      const vot = reel.insights.viewsOverTime;
      const lastI = vot.length - 1;
      const midI = Math.floor(lastI / 2);
      vot[0].day = editXDate1;
      vot[midI].day = editXDate2;
      vot[lastI].day = editXDate3;
    }
    if (customGraphData) {
      const lastI = customGraphData.length - 1;
      const midI = Math.floor(lastI / 2);
      reel.insights.viewsOverTime = customGraphData.map((d, i) => {
        const labelIdx = i === 0 ? 0 : i === midI ? 1 : i === lastI ? 2 : -1;
        return { ...d, day: labelIdx === 0 ? editXDate1 : labelIdx === 1 ? editXDate2 : labelIdx === 2 ? editXDate3 : "" };
      });
    }
    reel.yCenter = editYCenter;
    reel.yTop = editYTop;
    (reel as any).yCenterLabel = editYCenterLabel;
    (reel as any).yTopLabel = editYTopLabel;
    (reel as any).engagementYCenter = editEngagementYCenter;
    (reel as any).engagementYTop = editEngagementYTop;
    (reel as any).retentionYCenter = editRetentionYCenter;
    (reel as any).retentionYTop = editRetentionYTop;
    if (postImage !== undefined) reel.thumbnail = postImage;
    if (postCaption !== undefined) reel.caption = postCaption;
    if (postVideoUrl !== undefined) reel.videoUrl = postVideoUrl;
    freshData[postIndex] = reel;
    saveReelsData(freshData);
    try { window.dispatchEvent(new CustomEvent("reel-insights-updated", { detail: { index: postIndex, source: "self-insights", scope: reelsScope } })); } catch {}
    console.log("[InsightsPersist] Saved edits for reel", postIndex);
  }, [isMainAccount, postIndex, reelsScope, editViews, editLikes, editComments, editShares, editSaves, editReposts, editFollowerPct, editGenderMale, editViewRate, editStartDate, editDisplayDate, editDuration, editXDate1, editXDate2, editXDate3, customGraphData, editYCenter, editYTop, editYCenterLabel, editYTopLabel, editEngagementYCenter, editEngagementYTop, editRetentionYCenter, editRetentionYTop, editTypicalTop, timeRangeMode, editSkipRate, editTypicalSkipRate, editRetentionCurve, editEngagementCurve, typicalRetentionCurve, editWatchTime, editAvgWatchTime, editSources, editCountries, editAgeGroups, editAccountsReached, editFollows, editInteractions, editProfileVisits, editAudienceText, retentionImageUrl, viewsGraphImageUrl, sourcesImageUrl, actionsImageUrl, interactionsImageUrl, postImage, postCaption, postVideoUrl]);

  // Graph saves must also update the reel payload synchronously. The override
  // store is the primary source, but ReelDetail/Profile refresh their own reel
  // snapshot while navigating back; without this mirror that stale snapshot
  // could restore the original axis labels before Insights was opened again.
  const persistGraphSnapshot = useCallback((
    graphData: { day: string; thisReel: number | null; typical: number | null }[],
    dates: [string, string, string],
  ) => {
    if (!isMainAccount) return;
    const freshData = loadReelsData();
    const reel = freshData[postIndex];
    if (!reel) return;
    const lastI = graphData.length - 1;
    const midI = Math.floor(lastI / 2);
    reel.insights = {
      ...reel.insights,
      viewsOverTime: graphData.map((point, index) => ({
        ...point,
        day: index === 0 ? dates[0] : index === midI ? dates[1] : index === lastI ? dates[2] : "",
      })),
    };
    reel.graphStartDate = dates[0];
    (reel as any).timeRangeMode = timeRangeMode;
    freshData[postIndex] = reel;
    saveReelsData(freshData);
  }, [isMainAccount, postIndex, timeRangeMode]);

  // Same idea for the retention / engagement curves: write them into the local
  // reel snapshot right away so re-opening insights shows the saved curve.
  const persistCurveSnapshot = useCallback((patch: Record<string, unknown>) => {
    if (!isMainAccount) return;
    const freshData = loadReelsData();
    const reel = freshData[postIndex];
    if (!reel) return;
    reel.insights = { ...reel.insights, ...(patch as any) };
    freshData[postIndex] = reel;
    saveReelsData(freshData);
  }, [isMainAccount, postIndex]);


  // Auto-persist edits to localStorage (skip initial mount)
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const timer = setTimeout(() => {
      persistEdits();
      saveToSupabase();
    }, 350);
    return () => clearTimeout(timer);
  }, [persistEdits, saveToSupabase]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cancel = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
    const handleStart = (e: any) => {
      // Never toggle while an editor sheet is open — drawing a curve takes
      // longer than the long-press threshold and used to silently flip the
      // mode off mid-edit.
      if (graphEditorOpen || retentionEditorOpen || editModal) return;
      const t = e.target as HTMLElement;
      if (!t?.closest) return;
      if (t.closest('button') || t.closest('input') || t.closest('[data-no-longpress]')) return;
      cancel();
      longPressTimerRef.current = setTimeout(() => {
        setIsEditMode((prev) => {
          toast.info(prev ? "View mode" : "Edit mode active");
          return !prev;
        });
      }, 900);
    };
    const main = document.getElementById('insights-main');
    if (main) {
      main.addEventListener('mousedown', handleStart);
      main.addEventListener('mouseup', cancel);
      main.addEventListener('mouseleave', cancel);
      main.addEventListener('touchstart', handleStart, { passive: true });
      main.addEventListener('touchmove', cancel, { passive: true });
      main.addEventListener('touchend', cancel);
      main.addEventListener('touchcancel', cancel);
      window.addEventListener('scroll', cancel, { passive: true });
      return () => {
        main.removeEventListener('mousedown', handleStart);
        main.removeEventListener('mouseup', cancel);
        main.removeEventListener('mouseleave', cancel);
        main.removeEventListener('touchstart', handleStart);
        main.removeEventListener('touchmove', cancel);
        main.removeEventListener('touchend', cancel);
        main.removeEventListener('touchcancel', cancel);
        window.removeEventListener('scroll', cancel);
        cancel();
      };
    }
  }, [graphEditorOpen, retentionEditorOpen, editModal]);


  if (loading) {
    return (
      <div className="pb-20 min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3.5 bg-background">
          <div className="flex items-center gap-5">
            <button onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/profile'); }} className="text-foreground">
              <ArrowLeft size={22} strokeWidth={1.8} />
            </button>
            <h1 className="text-[17px] font-semibold text-foreground">Reel insights</h1>
          </div>
          <div className="w-[29px] h-[29px] shrink-0" />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-7 w-7 rounded-full border-[1.5px] border-muted-foreground/25 border-t-muted-foreground/60 animate-spin" />
        </div>
      </div>
    );
  }

  if (isLoading) return <InsightDetailSkeleton />;

  return (
    <div id="insights-main" className="pb-4 bg-background animate-fade-in">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3.5 bg-background">
        <div className="flex items-center gap-5">
          <button onClick={() => { persistEdits(); saveToSupabase(); if (window.history.length > 1) navigate(-1); else navigate('/profile'); }} className="text-foreground">
            <ArrowLeft size={22} strokeWidth={1.8} />
          </button>
          <h1 
            className="text-[17px] font-semibold text-foreground"
            onClick={() => { if (!isEditMode) { setIsEditMode(true); toast.info("Edit mode active"); } }}
          >
            Reel insights
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setIsEditMode(true); toast.info("Edit mode active"); }}
            className={cn("p-1 text-foreground active:opacity-60", isEditMode && "hidden")}
            aria-label="Enable edit mode"
          >
            <TrendingUp size={22} className="text-foreground" />
          </button>
          {!isEditMode ? (
            <button onClick={() => setIsActionMenuOpen(true)} className="p-1 text-foreground active:opacity-60">
              <MoreVertical size={21} />
            </button>
          ) : (

            <button 
              onClick={() => { setIsEditMode(false); saveToSupabase(); persistEdits(); toast.success("All changes saved"); }}
              className="text-[14px] font-bold text-[hsl(var(--ig-blue))] leading-none"
            >
              Done
            </button>
          )}
        </div>
      </header>

      {/* Reel Preview - Large square thumbnail */}
      <div className="flex flex-col items-center pt-2 pb-3 px-4">
        <label className={cn("w-[120px] rounded-lg overflow-hidden shadow-md relative block", isEditMode && "cursor-pointer active:opacity-60")}>
          {isEditMode && (
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const tid = toast.loading("Uploading thumbnail...");
              try {
                const url = await uploadToCloudinary(file);
                setPostImage(url);
                saveToSupabase({ thumbnail: url });
                toast.success("Thumbnail updated!", { id: tid });
              } catch (err) { toast.error("Upload failed", { id: tid }); }
            }} />
          )}
          <img src={postImage} alt="Reel thumbnail" className="w-full aspect-[9/16] object-cover" />
          {isEditMode && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <Plus size={24} className="text-white drop-shadow-lg" />
            </div>
          )}
        </label>
      </div>

      {/* Engagement stats scroll away with the reel preview, as on Instagram. */}
      <div className="flex justify-around px-4 py-4">
        {[
          { icon: <Heart size={22} className="text-foreground" strokeWidth={2.2} />, val: likes, set: setEditLikes, label: "Likes" },
          { icon: <MessageCircle size={22} className="text-foreground -scale-x-100" strokeWidth={2.2} />, val: comments, set: setEditComments, label: "Comments" },
          { icon: <RepostIcon size={22} strokeWidth={2.2} className="text-foreground" />, val: reposts, set: setEditReposts, label: "Reposts" },
          { icon: <InstagramShareIcon size={22} strokeWidth={2.2} className="text-foreground" />, val: shares, set: setEditShares, label: "Shares" },
          { icon: <Bookmark size={22} className="text-foreground" strokeWidth={2.2} />, val: saves, set: setEditSaves, label: "Saves" },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1.5 cursor-pointer" onClick={() => isEditMode && setEditModal({ label: item.label, value: String(item.val), onSave: item.set })}>
            {item.icon}
            <span className="relative flex h-4 min-w-7 items-center justify-center">
              <AnimatePresence initial={false} mode="wait">
                {revealStage >= 1 ? (
                  <motion.span
                    key="value"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                    className="text-[13px] font-medium leading-4 text-foreground"
                  >
                    {fmtNum(item.val)}
                  </motion.span>
                ) : (
                  <motion.span
                    key="placeholder"
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="block h-4 w-7 rounded-[4px] bg-secondary"
                    aria-label={`${item.label} loading`}
                  />
                )}
              </AnimatePresence>
            </span>
          </div>
        ))}
      </div>

      {/* Only the tabs remain below the title bar while the page scrolls. */}
      <div className="sticky top-[50px] z-30 bg-background">
      <div className="flex border-b border-border">
        {(["Overview", "Engagement", "Audience"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-3 text-[14px] font-medium text-center transition-colors relative",
              activeTab === tab ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-[97px] bg-foreground" />}
          </button>
        ))}
      </div>
      </div>

      {/* ═══════════ OVERVIEW TAB ═══════════ */}
      {activeTab === "Overview" && (
        <div>
          {/* Summary section */}
          <div className="px-4 pt-8 pb-10">
            <div className="flex items-center gap-2 mb-9">
              <h2 className="text-[16px] font-bold text-foreground">Summary</h2>
              <Info size={14} className="text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Views", value: fmtNum(views), onEdit: () => setEditModal({ label: "Views", value: String(views), onSave: setEditViews }) },
                { label: "Viewers", value: fmtNum(accountsReached), onEdit: () => setEditModal({ label: "Viewers", value: String(accountsReached), onSave: setEditAccountsReached }) },
                { label: "Average watch time", value: avgWatchTime, onEdit: () => setEditModal({ label: "Average watch time", value: editAvgWatchTime, isText: true, onSave: ((v: any) => setEditAvgWatchTime(String(v))) as any }) },
                { label: "Follows", value: String(follows), onEdit: () => setEditModal({ label: "Follows", value: String(follows), onSave: setEditFollows }) },
              ].map((item) => (
                <motion.div
                  key={item.label}
                  initial={false}
                  className={cn("min-h-[69px] bg-[#EEF0F2] dark:bg-[#1C1C1E] rounded-xl p-4", isEditMode && "cursor-pointer active:opacity-60")}
                  onClick={() => isEditMode && item.onEdit()}
                >
                  <AnimatePresence initial={false}>
                    {revealStage >= 2 && (
                      <motion.div
                        key="summary-value"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                      <span className="text-[12px] text-muted-foreground block mb-1">{item.label}</span>
                      <span className="text-[20px] font-bold text-foreground">{item.value}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {revealStage < 2 && <span className="sr-only" aria-label={`${item.label} loading`} />}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Views row */}
          <div className="px-4 pb-2">
            <div className="flex items-center">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-foreground">Views over time</span>
                <Info size={14} className="text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Views over time graph (editable) */}
          {showGraph && (
            <div className="px-4 pt-7 pb-1">
              {/* All / Followers / Non-followers pills */}
              <div className="flex gap-2 mb-[60px]">
                {(["All", "Followers", "Non-followers"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setViewsFilter(opt)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-[13px] font-semibold border transition-colors",
                      viewsFilter === opt
                        ? "bg-secondary text-foreground border-transparent"
                        : "bg-transparent text-foreground border-border"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {viewsGraphImageUrl ? (
                <img src={viewsGraphImageUrl} alt="Views over time" className="w-full h-auto object-contain rounded-lg" />
              ) : (
              <>
              {/* Keep a dedicated tap target above Recharts. Its SVG touch
                  handlers can otherwise swallow taps on some mobile WebViews. */}
              <div
                data-no-longpress
                className="h-[180px] -ml-2 relative [&_.recharts-wrapper]:pointer-events-none"
              >
                <button
                  type="button"
                  aria-label="Customize views over time graph"
                  className="absolute inset-0 z-10 cursor-pointer touch-manipulation bg-transparent active:bg-secondary/10"
                  onClick={() => {
                    setIsEditMode(true);
                    setGraphEditorOpen(true);
                  }}
                />

                {(() => {
                  // Remap data values onto a fixed visual scale [0..2] so the 3 gridlines
                  // (bottom=0, middle=1, top=2) are ALWAYS evenly spaced regardless of
                  // the actual numeric values entered for middle/top labels.
                  const topVal = Math.max(1, editYTop);
                  const midVal = Math.min(Math.max(0, editYCenter), topVal);
                  const remap = (v: number) => {
                    if (v <= 0) return 0;
                    if (v <= midVal) return midVal === 0 ? 0 : (v / midVal); // 0..1
                    if (v >= topVal) return 2;
                    return 1 + (v - midVal) / (topVal - midVal); // 1..2
                  };
                  const visualData = viewsOverTime.map(d => ({
                    ...d,
                    thisReel: d.thisReel == null ? null : remap(d.thisReel),
                    typical: d.typical == null ? null : remap(d.typical),
                  }));
                  const fmt = (v: number) => v === 0 ? '0' : Math.round(v).toLocaleString('en-US');
                  const tickLabel = (v: number) => v === 0 ? fmt(0)
                    : v === 1 ? (editYCenterLabel?.trim() ? editYCenterLabel : fmt(midVal))
                    : (editYTopLabel?.trim() ? editYTopLabel : fmt(topVal));
                  return (
                    <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={visualData} margin={{ top: 14, right: 26, left: 0, bottom: 0 }}>
                        <XAxis
                          dataKey="day"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          padding={{ left: 2, right: 2 }}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={42}
                          domain={[0, 2]}
                          ticks={[0, 1, 2]}
                          interval={0}
                          tickFormatter={tickLabel}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        {/* Always 3 evenly-spaced gridlines: bottom, middle, top */}
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <ReferenceLine y={1} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <ReferenceLine y={2} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <Line type="monotone" dataKey="typical" stroke="hsl(var(--muted-foreground))" strokeWidth={2.5} strokeDasharray="6 6" dot={false} />
                        <Line type="monotone" dataKey="thisReel" stroke="#E040FB" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })()}
                {isEditMode && (
                  <>
                    <button
                       onClick={(e) => { e.stopPropagation(); setEditModal({ label: "Y-axis Top value", value: editYTopLabel || String(editYTop), onSave: (v, raw) => { setEditYTop(Math.max(1, v)); setEditYTopLabel(raw ?? ""); } }); }}
                      className="absolute z-20 left-0 top-[6px] w-[42px] h-[26px] bg-[hsl(var(--ig-blue))]/15 rounded"
                      aria-label="Edit top Y value"
                    />
                    <button
                       onClick={(e) => { e.stopPropagation(); setEditModal({ label: "Y-axis Middle value", value: editYCenterLabel || String(editYCenter), onSave: (v, raw) => { setEditYCenter(Math.max(0, v)); setEditYCenterLabel(raw ?? ""); } }); }}
                      className="absolute z-20 left-0 top-1/2 -translate-y-1/2 w-[42px] h-[26px] bg-[hsl(var(--ig-blue))]/15 rounded"
                      aria-label="Edit middle Y value"
                    />
                  </>
                )}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 mt-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#E040FB]" />
                  <span className="text-[12px] text-foreground">This reel</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-[12px] text-foreground">Your typical reel</span>
                </div>
              </div>
              </>
              )}
              {isEditMode && (
                <div className="flex items-center gap-3 mt-2 justify-end">
                  {viewsGraphImageUrl && (
                    <button onClick={() => { setViewsGraphImageUrl(''); saveToSupabase({ viewsGraphImage: '' }); }} className="text-[11px] font-bold text-red-500">Remove Image</button>
                  )}
                  <label className="text-[11px] text-[hsl(var(--ig-blue))] font-bold flex items-center gap-1 cursor-pointer active:opacity-60">
                    <Plus size={12} /> Upload Image
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const tid = toast.loading("Uploading graph...");
                      try {
                        const url = await uploadToCloudinary(file);
                        setViewsGraphImageUrl(url);
                        saveToSupabase({ viewsGraphImage: url });
                        toast.success("Graph updated!", { id: tid });
                      } catch (err) { toast.error("Upload failed", { id: tid }); }
                    }} />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* What impacts your views */}
          <div className="px-4 pt-[42px] pb-2">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[16px] font-bold text-foreground">What impacts your views</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>
            <p className="text-[12px] text-muted-foreground mb-3">Rates are listed in order of importance to reach.</p>
            {impactsImageUrl ? (
              <img src={impactsImageUrl} alt="What impacts your views" className="w-full h-auto object-contain rounded-lg" />
            ) : (
            <div className="space-y-1">
              {[
                { icon: Clock, label: "Skip rate", pct: editSkipRate, comparison: editSkipRate <= editTypicalSkipRate ? "Lower" : "Higher", onEdit: () => setEditModal({ label: "Skip rate %", value: String(editSkipRate), onSave: (v) => setEditSkipRate(Math.min(100, Math.max(0, v))) }) },
                { icon: InstagramShareIcon, label: "Share rate", pct: views > 0 ? (editShares / views) * 100 : 0, comparison: "Lower", onEdit: () => setEditModal({ label: "Share rate %", value: String(views > 0 ? ((editShares / views) * 100).toFixed(2) : "0"), onSave: (v) => setEditShares(Math.round((Math.min(100, Math.max(0, v)) / 100) * views)) }) },
                { icon: Heart, label: "Like rate", pct: views > 0 ? (editLikes / views) * 100 : 0, comparison: "Higher", onEdit: () => setEditModal({ label: "Like rate %", value: String(views > 0 ? ((editLikes / views) * 100).toFixed(2) : "0"), onSave: (v) => setEditLikes(Math.round((Math.min(100, Math.max(0, v)) / 100) * views)) }) },
                { icon: Bookmark, label: "Save rate", pct: views > 0 ? (editSaves / views) * 100 : 0, comparison: "Lower", onEdit: () => setEditModal({ label: "Save rate %", value: String(views > 0 ? ((editSaves / views) * 100).toFixed(2) : "0"), onSave: (v) => setEditSaves(Math.round((Math.min(100, Math.max(0, v)) / 100) * views)) }) },
                { icon: RepostIcon, label: "Repost rate", pct: views > 0 ? (editReposts / views) * 100 : 0, comparison: "Higher", onEdit: () => setEditModal({ label: "Repost rate %", value: String(views > 0 ? ((editReposts / views) * 100).toFixed(2) : "0"), onSave: (v) => setEditReposts(Math.round((Math.min(100, Math.max(0, v)) / 100) * views)) }) },
                { icon: MessageCircle, label: "Comment rate", pct: views > 0 ? (editComments / views) * 100 : 0, comparison: "Lower", onEdit: () => setEditModal({ label: "Comment rate %", value: String(views > 0 ? ((editComments / views) * 100).toFixed(2) : "0"), onSave: (v) => setEditComments(Math.round((Math.min(100, Math.max(0, v)) / 100) * views)) }) },
              ].map(({ icon: Icon, label, pct, comparison, onEdit }) => (
                <div
                  key={label}
                  className={cn("flex items-center justify-between py-2.5", isEditMode && "cursor-pointer active:opacity-60")}
                  onClick={() => isEditMode && onEdit()}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#EEF0F2] dark:bg-[#1C1C1E] flex items-center justify-center">
                      <Icon size={20} className="text-foreground" strokeWidth={2.2} />
                    </div>
                    <span className="text-[15px] text-foreground">{label}</span>
                  </div>
                  <div className="flex min-w-[52px] flex-col items-end leading-tight">
                    <span className="text-[15px] font-bold text-foreground">{pct.toFixed(1)}%</span>
                    <span className="text-[12px] font-normal text-muted-foreground">{comparison}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
            {isEditMode && (
              <div className="flex items-center gap-3 mt-2 justify-end">
                {impactsImageUrl && (
                  <button onClick={() => { setImpactsImageUrl(''); saveToSupabase({ impactsImage: '' }); }} className="text-[11px] font-bold text-red-500">Remove Image</button>
                )}
                <label className="text-[11px] text-[hsl(var(--ig-blue))] font-bold flex items-center gap-1 cursor-pointer active:opacity-60">
                  <Plus size={12} /> Upload Image
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const tid = toast.loading("Uploading image...");
                    try {
                      const url = await uploadToCloudinary(file);
                      setImpactsImageUrl(url);
                      saveToSupabase({ impactsImage: url });
                      toast.success("Image updated!", { id: tid });
                    } catch (err) { toast.error("Upload failed", { id: tid }); }
                  }} />
                </label>
              </div>
            )}
          </div>

          {/* How long people watched your reel */}
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-[16px] font-bold text-foreground">How long people watched your reel</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>

            {/* Phone mockup with thumbnail */}
            <div className="flex justify-center mb-12">
              <div className="relative w-[100px] h-[178px] rounded-[18px] overflow-hidden bg-black shadow-lg">
                <img src={postImage} alt="Reel thumbnail" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round">
                    <polygon points="6,3 21,12 6,21" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Retention graph */}
            <div className="relative select-none -mx-2">
              {retentionImageUrl ? (
                <img src={retentionImageUrl} alt="Retention graph" className="w-full h-auto object-contain rounded-lg" />
              ) : (
                <div data-no-longpress className="h-[124px] relative [&_.recharts-wrapper]:pointer-events-none">
                  <button
                    type="button"
                    aria-label="Customize retention graph"
                    className="absolute inset-0 z-10 cursor-pointer touch-manipulation bg-transparent active:bg-secondary/10"
                    onClick={() => { setIsEditMode(true); setRetentionEditorMode("retention"); setRetentionEditorOpen(true); }}
                  />
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={editRetentionCurve} margin={{ top: 5, right: 5, left: -5, bottom: 0 }}>
                      <CartesianGrid horizontal={true} vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                      <XAxis dataKey="t" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} width={46} domain={[0, editRetentionYTop]} ticks={[0, editRetentionYCenter, editRetentionYTop]} tickFormatter={(v: number) => v === 0 ? '0' : `${v}%`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Line type="linear" dataKey="pct" stroke="#E040FB" strokeWidth={5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  {(

                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsEditMode(true); setEditModal({ label: "Graph top %", value: String(editRetentionYTop), onSave: (v) => setEditRetentionYTop(Math.max(1, v)) }); }}
                        className={cn("absolute left-0 top-0 w-[46px] h-[24px] rounded z-20", isEditMode ? "bg-primary/15" : "bg-transparent")}
                        aria-label="Edit retention top percentage"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsEditMode(true); setEditModal({ label: "Graph middle %", value: String(editRetentionYCenter), onSave: (v) => setEditRetentionYCenter(Math.max(0, v)) }); }}
                        className={cn("absolute left-0 top-[38px] w-[46px] h-[24px] rounded z-20", isEditMode ? "bg-primary/15" : "bg-transparent")}
                        aria-label="Edit retention middle percentage"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 justify-end">

              {isEditMode && (
                <>
                {retentionImageUrl && (
                  <button onClick={() => { setRetentionImageUrl(''); saveToSupabase({ retentionImage: '' }); }} className="text-[11px] font-bold text-red-500">Remove Image</button>
                )}
                <label className="text-[11px] text-[hsl(var(--ig-blue))] font-bold flex items-center gap-1 cursor-pointer active:opacity-60">
                  <Plus size={12} /> Upload Image
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const tid = toast.loading("Uploading graph...");
                    try {
                      const url = await uploadToCloudinary(file);
                      setRetentionImageUrl(url);
                      saveToSupabase({ retentionImage: url });
                      toast.success("Graph updated!", { id: tid });
                    } catch (err) { toast.error("Upload failed", { id: tid }); }
                  }} />
                </label>
                </>
              )}
            </div>
          </div>

          {/* Top sources of views */}
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-12">
              <h3 className="text-[16px] font-bold text-foreground">Top sources of views</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>
            {sourcesImageUrl ? (
              <img src={sourcesImageUrl} alt="Top sources of views" className="w-full h-auto object-contain rounded-lg" />
            ) : (
            <div className="space-y-4">
              {sources.map((item, idx) => (
                <div key={idx}>
                  <span className={cn("text-[15px] font-medium text-foreground block mb-1.5 select-none", isEditMode && "cursor-pointer active:bg-secondary/20 rounded px-1 -ml-1")}
                    onClick={() => isEditMode && setEditModal({ label: `Source name #${idx + 1}`, value: item.name, isText: true, onSave: ((v: any) => { const updated = [...editSources]; updated[idx] = { ...updated[idx], name: String(v) }; setEditSources(updated); }) as any })}
                  >{item.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[10px] rounded-full ig-bar-track overflow-hidden">
                      <div className="h-full ig-bar-gradient" style={{ width: `${item.pct}%` }} />
                    </div>
                    <span className={cn("text-[15px] font-semibold text-foreground min-w-[52px] text-right leading-none select-none", isEditMode && "cursor-pointer active:bg-secondary/20 rounded px-1")}
                      onClick={() => isEditMode && setEditModal({ label: `${item.name} %`, value: String(item.pct), onSave: ((v: any) => { const updated = [...editSources]; updated[idx] = { ...updated[idx], pct: Math.min(100, Number(v)) }; setEditSources(updated); }) as any })}
                    >{item.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
            )}
            {isEditMode && (
              <div className="flex items-center gap-3 mt-2 justify-end" data-no-longpress>
                {sourcesImageUrl && (
                  <Button variant="ghost" disabled={sourcesImageSaving} className="h-auto p-0 text-[11px] font-bold text-destructive" onClick={async () => {
                    setSourcesImageSaving(true);
                    try {
                      if (!await saveToSupabase({ sourcesImage: '' })) throw new Error('Save failed');
                      setSourcesImageUrl('');
                      toast.success('Image removed');
                    } catch {
                      toast.error('Changes could not be saved. Please try again.');
                    } finally {
                      setSourcesImageSaving(false);
                    }
                  }}>Remove Image</Button>
                )}
                <Button variant="ghost" disabled={sourcesImageSaving} className="h-auto p-0 text-[11px] text-[hsl(var(--ig-blue))] font-bold gap-1 [&_svg]:size-3" onClick={() => sourcesImageInputRef.current?.click()}>
                  <Plus size={12} /> {sourcesImageSaving ? 'Uploading...' : 'Upload Image'}
                </Button>
                <input ref={sourcesImageInputRef} aria-label="Upload Top sources of views image" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setSourcesImageSaving(true);
                  const tid = toast.loading('Uploading image...');
                  try {
                    const url = await uploadToCloudinary(file);
                    if (!await saveToSupabase({ sourcesImage: url })) throw new Error('Save failed');
                    setSourcesImageUrl(url);
                    toast.success('Image saved!', { id: tid });
                  } catch {
                    toast.error('Image could not be saved. Please try again.', { id: tid });
                  } finally {
                    setSourcesImageSaving(false);
                  }
                }} />
              </div>
            )}
          </div>

          {/* Ad section */}
          <div className="px-4 pt-4 pb-5">
            <h3 className="text-[16px] font-bold text-foreground mb-3">Ad</h3>
            <button className="w-full flex items-center justify-between py-2" onClick={() => {}}>
              <div className="flex items-center gap-3">
                <TrendingUp size={22} className="text-foreground" />
                <span className="text-[15px] text-foreground">Boost this Reel</span>
              </div>
              <ChevronRight size={20} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ ENGAGEMENT TAB ═══════════ */}
      {activeTab === "Engagement" && (
        <div>
          {/* Actions after viewing */}
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[16px] font-bold text-foreground">Actions after viewing</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>
            {actionsImageUrl ? (
              <img src={actionsImageUrl} alt="Actions after viewing" className="w-full h-auto object-contain rounded-lg" />
            ) : (
            <div className="space-y-3">
              <div className={cn("flex items-center justify-between", isEditMode && "cursor-pointer active:opacity-60")} onClick={() => isEditMode && setEditModal({ label: "Profile visits", value: String(editProfileVisits), onSave: setEditProfileVisits })}>
                <span className="text-[15px] text-foreground">Profile visits</span>
                <span className="text-[15px] font-bold text-foreground">{fmtNum(editProfileVisits)}</span>
              </div>
              <div className={cn("flex items-center justify-between", isEditMode && "cursor-pointer active:opacity-60")} onClick={() => isEditMode && setEditModal({ label: "Follows", value: String(follows), onSave: setEditFollows })}>
                <span className="text-[15px] text-foreground">Follows</span>
                <span className="text-[15px] font-bold text-foreground">{fmtNum(follows)}</span>
              </div>
            </div>
            )}
            {isEditMode && (
              <div className="flex items-center gap-3 mt-2 justify-end" data-no-longpress>
                {actionsImageUrl && (
                  <Button variant="ghost" disabled={actionsImageSaving} className="h-auto p-0 text-[11px] font-bold text-destructive" onClick={async () => {
                    setActionsImageSaving(true);
                    try {
                      if (!await saveToSupabase({ actionsImage: '' })) throw new Error('Save failed');
                      setActionsImageUrl('');
                      toast.success('Image removed');
                    } catch {
                      toast.error('Changes could not be saved. Please try again.');
                    } finally {
                      setActionsImageSaving(false);
                    }
                  }}>Remove Image</Button>
                )}
                <Button variant="ghost" disabled={actionsImageSaving} className="h-auto p-0 text-[11px] text-[hsl(var(--ig-blue))] font-bold gap-1 [&_svg]:size-3" onClick={() => actionsImageInputRef.current?.click()}>
                  <Plus size={12} /> {actionsImageSaving ? 'Uploading...' : 'Upload Image'}
                </Button>
                <input ref={actionsImageInputRef} aria-label="Upload Actions after viewing image" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setActionsImageSaving(true);
                  const tid = toast.loading('Uploading image...');
                  try {
                    const url = await uploadToCloudinary(file);
                    if (!await saveToSupabase({ actionsImage: url })) throw new Error('Save failed');
                    setActionsImageUrl(url);
                    toast.success('Image saved!', { id: tid });
                  } catch {
                    toast.error('Image could not be saved. Please try again.', { id: tid });
                  } finally {
                    setActionsImageSaving(false);
                  }
                }} />
              </div>
            )}
          </div>

          {/* Interactions */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[16px] font-bold text-foreground">Interactions</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>
            {interactionsImageUrl ? (
              <img src={interactionsImageUrl} alt="Interactions" className="w-full h-auto object-contain rounded-lg" />
            ) : (
            <div className="space-y-3">
              {[
                { label: "Likes", value: likes, set: setEditLikes },
                { label: "Comments", value: comments, set: setEditComments },
                { label: "Reposts", value: reposts, set: setEditReposts },
                { label: "Shares", value: shares, set: setEditShares },
                { label: "Saves", value: saves, set: setEditSaves },
              ].map((item) => (
                <div key={item.label} className={cn("flex items-center justify-between", isEditMode && "cursor-pointer active:opacity-60")} onClick={() => isEditMode && setEditModal({ label: item.label, value: String(item.value), onSave: item.set })}>
                  <span className="text-[15px] text-foreground">{item.label}</span>
                  <span className="text-[15px] font-bold text-foreground">{fmtNum(item.value)}</span>
                </div>
              ))}
            </div>
            )}
            {isEditMode && (
              <div className="flex items-center gap-3 mt-2 justify-end" data-no-longpress>
                {interactionsImageUrl && (
                  <Button variant="ghost" disabled={interactionsImageSaving} className="h-auto p-0 text-[11px] font-bold text-destructive" onClick={async () => {
                    setInteractionsImageSaving(true);
                    try {
                      if (!await saveToSupabase({ interactionsImage: '' })) throw new Error('Save failed');
                      setInteractionsImageUrl('');
                      toast.success('Image removed');
                    } catch {
                      toast.error('Changes could not be saved. Please try again.');
                    } finally {
                      setInteractionsImageSaving(false);
                    }
                  }}>Remove Image</Button>
                )}
                <Button variant="ghost" disabled={interactionsImageSaving} className="h-auto p-0 text-[11px] text-[hsl(var(--ig-blue))] font-bold gap-1 [&_svg]:size-3" onClick={() => interactionsImageInputRef.current?.click()}>
                  <Plus size={12} /> {interactionsImageSaving ? 'Uploading...' : 'Upload Image'}
                </Button>
                <input ref={interactionsImageInputRef} aria-label="Upload Interactions image" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setInteractionsImageSaving(true);
                  const tid = toast.loading('Uploading image...');
                  try {
                    const url = await uploadToCloudinary(file);
                    if (!await saveToSupabase({ interactionsImage: url })) throw new Error('Save failed');
                    setInteractionsImageUrl(url);
                    toast.success('Image saved!', { id: tid });
                  } catch {
                    toast.error('Image could not be saved. Please try again.', { id: tid });
                  } finally {
                    setInteractionsImageSaving(false);
                  }
                }} />
              </div>
            )}
          </div>

          {/* When people liked your reel */}
          <div className="px-4 pt-4 pb-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-[16px] font-bold text-foreground">When people liked your reel</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>

            {/* Phone mockup with thumbnail */}
            <div className="flex justify-center mb-4">
              <div className="relative w-[100px] h-[178px] rounded-[18px] overflow-hidden bg-black shadow-lg">
                <img src={postImage} alt="Reel thumbnail" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round">
                    <polygon points="6,3 21,12 6,21" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="relative select-none -mx-2">
              <div
                data-no-longpress
                className="h-[180px] relative [&_.recharts-wrapper]:pointer-events-none"
              >
                <button
                  type="button"
                  aria-label="Customize engagement graph"
                  className="absolute inset-0 z-10 cursor-pointer touch-manipulation bg-transparent active:bg-secondary/10"
                  onClick={() => { setIsEditMode(true); setRetentionEditorMode("engagement"); setRetentionEditorOpen(true); }}
                />


                {(() => {
                  const topVal = Math.max(1, editEngagementYTop);
                  const midVal = Math.min(Math.max(0, editEngagementYCenter), topVal);
                  const remapPct = (v: number) => {
                    const clamped = Math.max(0, Math.min(topVal, v));
                    if (clamped <= midVal) return midVal === 0 ? 0 : clamped / midVal;
                    return 1 + (clamped - midVal) / (topVal - midVal || 1);
                  };
                  const engagementGraphData = editEngagementCurve.map((d) => ({ ...d, pct: d.pct == null ? null : remapPct(d.pct) }));
                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={engagementGraphData} margin={{ top: 5, right: 5, left: -5, bottom: 0 }}>
                        <XAxis dataKey="t" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} width={46} domain={[0, 2]} ticks={[0, 1, 2]} tickFormatter={(v: number) => v === 0 ? '0%' : `${v === 1 ? midVal : topVal}%`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                        <ReferenceLine y={1} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                        <ReferenceLine y={2} stroke="hsl(var(--border))" strokeOpacity={0.3} />
                        <Line type="linear" dataKey="pct" stroke="#E040FB" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })()}
                {(

                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setIsEditMode(true); setEditModal({ label: "Engagement graph top %", value: String(editEngagementYTop), onSave: (v) => setEditEngagementYTop(Math.max(1, v)) }); }}
                      className={cn("absolute left-0 top-0 z-20 w-[46px] h-[24px] p-0 rounded", isEditMode ? "bg-primary/15" : "bg-transparent")}
                      aria-label="Edit engagement top percentage"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setIsEditMode(true); setEditModal({ label: "Engagement graph middle %", value: String(editEngagementYCenter), onSave: (v) => setEditEngagementYCenter(Math.max(0, v)) }); }}
                      className={cn("absolute left-0 top-[66px] z-20 w-[46px] h-[24px] p-0 rounded", isEditMode ? "bg-primary/15" : "bg-transparent")}
                      aria-label="Edit engagement middle percentage"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ═══════════ AUDIENCE TAB ═══════════ */}
      {activeTab === "Audience" && (
        <div>
          {/* Who viewed your reel */}
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-5">
              <h3 className="text-[16px] font-bold text-foreground">Who viewed your reel</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[14px] text-foreground block mb-1.5">Followers</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden">
                    <div className="h-full ig-bar-gradient" style={{ width: `${followerPct}%` }} />
                  </div>
                  <span className={cn("text-[14px] text-foreground w-[42px] text-right", isEditMode && "cursor-pointer active:opacity-60 bg-secondary/30 rounded px-1")}
                    onClick={() => isEditMode && setEditModal({ label: "Followers %", value: String(followerPct), onSave: (v) => setEditFollowerPct(Math.min(100, v)) })}
                  >{followerPct.toFixed(1)}%</span>
                </div>
              </div>
              <div>
                <span className="text-[14px] text-foreground block mb-1.5">Non-followers</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${nonFollowerPct}%`, background: "linear-gradient(90deg, #7B2BFF 0%, #8B3DFF 100%)" }} />
                  </div>
                  <span className={cn("text-[14px] text-foreground w-[42px] text-right", isEditMode && "cursor-pointer active:opacity-60 bg-secondary/30 rounded px-1")}
                    onClick={() => isEditMode && setEditModal({ label: "Non-followers % (auto = 100 - followers)", value: String(nonFollowerPct), onSave: (v) => setEditFollowerPct(100 - Math.min(100, v)) })}
                  >{nonFollowerPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-border mx-4" />

          {/* Audience details */}
          <div className="px-4 py-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[16px] font-bold text-foreground">Audience details</h3>
              <Info size={14} className="text-muted-foreground" />
            </div>
            {/* Age / Country / Gender pill tabs */}
            <div className="flex items-center gap-2 mb-5">
              {(["Age", "Country", "Gender"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAudienceTab(tab)}
                  className={cn(
                    "px-5 py-2 rounded-full text-[14px] font-medium border transition-colors",
                    audienceTab === tab
                      ? "bg-secondary text-foreground border-transparent"
                      : "bg-transparent text-foreground border-border"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Age view */}
            {audienceTab === "Age" && (
              <div className="space-y-1">
                {ageGroups.map((g, idx) => (
                  <div key={g.range}>
                    <div className="text-[13px] text-foreground mb-1">{g.range}</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden">
                        <div
                          className="h-full ig-bar-gradient"
                          style={{ width: `${Math.min(100, g.pct)}%` }}
                        />
                      </div>
                      <span
                        className={cn("text-[14px] text-foreground min-w-[48px] text-right", isEditMode && "cursor-pointer")}
                        onClick={() => isEditMode && setEditModal({
                          label: `${g.range} %`,
                          value: String(g.pct),
                          onSave: (v) => {
                            const next = [...editAgeGroups];
                            next[idx] = { ...next[idx], pct: Math.min(100, Math.max(0, v)) };
                            setEditAgeGroups(next);
                          },
                        })}
                      >
                        {g.pct % 1 === 0 ? `${g.pct}%` : `${g.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Country view */}
            {audienceTab === "Country" && (
              <div className="space-y-1">
                {countries.map((c, idx) => (
                  <div key={c.name}>
                    <div
                      className={cn("text-[13px] text-foreground mb-1", isEditMode && "cursor-pointer")}
                      onClick={() => isEditMode && setEditModal({
                        label: "Country name",
                        value: c.name,
                        isText: true,
                        onSave: ((v: any) => {
                          const next = [...countries];
                          next[idx] = { ...next[idx], name: String(v) };
                          setEditCountries(next);
                        }) as any,
                      })}
                    >
                      {c.name}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden">
                        <div
                          className="h-full ig-bar-gradient"
                          style={{ width: `${Math.min(100, c.pct)}%` }}
                        />
                      </div>
                      <span
                        className={cn("text-[14px] text-foreground min-w-[48px] text-right", isEditMode && "cursor-pointer")}
                        onClick={() => isEditMode && setEditModal({
                          label: `${c.name} %`,
                          value: String(c.pct),
                          onSave: (v) => {
                            const next = [...countries];
                            next[idx] = { ...next[idx], pct: Math.min(100, Math.max(0, v)) };
                            setEditCountries(next);
                          },
                        })}
                      >
                        {c.pct % 1 === 0 ? `${c.pct}%` : `${c.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Gender view */}
            {audienceTab === "Gender" && (
              <div className="space-y-1">
                {[
                  { label: "Men", pct: editGenderMale },
                  { label: "Women", pct: 100 - editGenderMale },
                ].map(({ label, pct }) => (
                  <div key={label}>
                    <div className="text-[13px] text-foreground mb-1">{label}</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden">
                        <div
                          className="h-full ig-bar-gradient"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span
                        className={cn("text-[14px] text-foreground min-w-[48px] text-right", isEditMode && label === "Men" && "cursor-pointer")}
                        onClick={() => isEditMode && label === "Men" && setEditModal({
                          label: "Men %",
                          value: String(editGenderMale),
                          onSave: (v) => setEditGenderMale(Math.min(100, Math.max(0, v))),
                        })}
                      >
                        {pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simple value editor */}
      {editModal && (
        <div data-no-longpress className="fixed inset-0 z-[90] bg-black/50 flex items-end justify-center" onClick={() => setEditModal(null)}>
          <div className="w-full max-w-[420px] max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-5 pb-8 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            {editModal && (
              <>
                <h3 className="text-base font-bold text-foreground text-center mb-4">{editModal.label}</h3>
                 <input
                   value={editModal.value}
                   onChange={(e) => setEditModal({ ...editModal, value: e.target.value })}
                   type="text"
                   inputMode={editModal.isText || editModal.label.includes("Date") || editModal.label.includes("time") ? "text" : "text"}
                   className="w-full bg-secondary rounded-lg px-4 py-2.5 text-[16px] text-foreground text-center outline-none"
                   autoFocus
                 />
                <button
                  onClick={() => {
                     if (editModal.isText || editModal.label.includes("Date") || editModal.label.includes("time")) {
                       (editModal.onSave as any)(editModal.value);
                      } else {
                        const raw = String(editModal.value).trim().replace(/,/g, '');
                        const m = raw.match(/^(-?\d*\.?\d+)\s*([kmbt])?$/i);
                        let num = 0;
                        if (m) {
                          num = parseFloat(m[1]);
                          const suf = (m[2] || '').toLowerCase();
                          if (suf === 'k') num *= 1_000;
                          else if (suf === 'm') num *= 1_000_000;
                          else if (suf === 'b') num *= 1_000_000_000;
                          else if (suf === 't') num *= 1_000_000_000_000;
                        } else {
                          num = parseFloat(raw) || 0;
                        }
                        editModal.onSave(Math.max(0, num), String(editModal.value).trim());
                      }
                    setEditModal(null);
                  }}
                  className="w-full mt-3 py-2.5 rounded-lg bg-[hsl(var(--ig-blue))] text-white text-[14px] font-semibold"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Graph editors are mounted directly at page level. Keeping them out of
          the generic editor sheet prevents mobile touch events and fixed
          positioning from being trapped by a nested scrolling panel. */}
      <GraphEditorModal
        key={`graph-${postIndex}-${graphEditorOpen ? "open" : "closed"}`}
        open={graphEditorOpen}
        onClose={() => setGraphEditorOpen(false)}
        onSave={async (data) => {
          setCustomGraphData(data);
          let nextXDate1 = editXDate1;
          let nextXDate2 = editXDate2;
          let nextXDate3 = editXDate3;
          if (data.length >= 3) {
            const lastI = data.length - 1;
            const midI = Math.floor(lastI / 2);
            xDatesManuallyEdited.current = true;
            if (data[0].day) { nextXDate1 = data[0].day; setEditXDate1(nextXDate1); setEditStartDate(nextXDate1); }
            if (data[midI].day) { nextXDate2 = data[midI].day; setEditXDate2(nextXDate2); }
            if (data[lastI].day) { nextXDate3 = data[lastI].day; setEditXDate3(nextXDate3); }
          }
          persistGraphSnapshot(data, [nextXDate1, nextXDate2, nextXDate3]);
          const saved = await saveToSupabase({
            customGraphData: data,
            graphStartDate: nextXDate1,
            xDate1: nextXDate1,
            xDate2: nextXDate2,
            xDate3: nextXDate3,
            yCenter: editYCenter,
            yTop: editYTop,
            yCenterLabel: editYCenterLabel,
            yTopLabel: editYTopLabel,
          });
          if (!saved) {
            toast.error("Graph could not be saved. Please try again.");
            return false;
          }
          toast.success("Graph saved");
          return true;
        }}
        onDatesChange={(nd) => { xDatesManuallyEdited.current = true; setEditXDate1(nd[0]); setEditXDate2(nd[1]); setEditXDate3(nd[2]); }}
        controlledDates={[editXDate1, editXDate2, editXDate3]}
        initialData={viewsOverTimeAll}
        maxViews={editYTop}
        midViews={editYCenter}
      />

      <RetentionEditorModal
        key={`retention-${retentionEditorMode}-${postIndex}-${retentionEditorOpen ? "open" : "closed"}`}
        open={retentionEditorOpen}
        onClose={() => setRetentionEditorOpen(false)}
        initialData={retentionEditorMode === "engagement" ? editEngagementCurve : editRetentionCurve}
        initialTypical={typicalRetentionCurve}
        onSave={async (thisReel, typical) => {
          let ok = false;
          if (retentionEditorMode === "engagement") {
            setEditEngagementCurve(thisReel);
            persistCurveSnapshot({ engagementCurve: thisReel });
            ok = await saveToSupabase({ engagementCurve: thisReel });
          } else {
            setEditRetentionCurve(thisReel);
            setTypicalRetentionCurve(typical);
            persistCurveSnapshot({ retentionCurve: thisReel, typicalRetentionCurve: typical });
            ok = await saveToSupabase({ retentionCurve: thisReel, typicalRetentionCurve: typical });
          }
          if (ok) toast.success("Graph saved");
          else toast.error("Graph could not be saved. Please try again.");
          return ok;
        }}
        threeLineScale={retentionEditorMode === "engagement"}
        yCenter={retentionEditorMode === "engagement" ? editEngagementYCenter : editRetentionYCenter}
        yTop={retentionEditorMode === "engagement" ? editEngagementYTop : editRetentionYTop}
      />

      {/* 3 Dot Action Menu */}
      {isActionMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="absolute inset-0" onClick={() => setIsActionMenuOpen(false)} />
          <div className="w-full bg-background rounded-t-3xl shadow-lg pb-10 mt-auto z-10 relative" style={{ animation: "slide-up 0.2s ease-out" }}>
            <style>{`@keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 flex-shrink-0 rounded-full bg-border" />
            </div>
            <div className="px-3 flex flex-col gap-2 pt-2">
              <button className="w-full flex items-center justify-between px-4 py-4 rounded-2xl bg-secondary/50 active:bg-secondary/70 transition-colors" onClick={() => setIsActionMenuOpen(false)}>
                <div className="flex items-center gap-3">
                  <TrendingUp size={22} className="text-foreground" />
                  <span className="text-[15px] font-medium text-foreground">Boost this reel</span>
                </div>
                <ChevronRight size={20} className="text-muted-foreground" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-4 rounded-2xl bg-secondary/50 active:bg-secondary/70 transition-colors" onClick={() => setIsActionMenuOpen(false)}>
                <div className="flex items-center gap-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
                  <span className="text-[15px] font-medium text-foreground">View on Edits</span>
                </div>
                <ChevronRight size={20} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReelInsightsScreen;
