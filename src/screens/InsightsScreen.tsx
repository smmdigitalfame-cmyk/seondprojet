import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Info, Heart, MessageCircle, Bookmark, CornerUpLeft, User, ExternalLink, Store } from "lucide-react";
import InstagramShareIcon from "@/components/icons/InstagramShareIcon";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import RepostIcon from "@/components/icons/RepostIcon";
import InsightDetailSkeleton from "@/components/InsightDetailSkeleton";
import ContentListSkeleton from "@/components/ContentListSkeleton";
import OverviewSkeleton from "@/components/OverviewSkeleton";
import AudienceSkeleton from "@/components/AudienceSkeleton";
import GraphEditorModal from "@/components/GraphEditorModal";
import VideoThumbnail from "@/components/VideoThumbnail";

import DecimalInput from "@/components/DecimalInput";
import { getPersistentJson, getPersistentScope, setPersistentJson } from "@/lib/persistentStorage";
import { getInsightsBackup, setInsightsBackup } from "@/lib/insightsBackup";
import { useActiveUsernameVersion } from "@/hooks/useActiveUsernameVersion";
import { getInsightTopReels, formatCompactMetric } from "@/lib/insightTopReels";
import { loadReelsData } from "@/data/reelInsightsData";
import { toast } from "sonner";

const PINK = "#D500F9";
const PINK_LIGHT = "#F583F0";
const OVERVIEW_GRAPH_KEY = "ig_insights_overview_graph_v1";

interface SavedOverviewGraph {
  graph: (number | null)[];
  graphStart: string;
  graphMid: string;
  graphEnd: string;
}

type TabKey = "overview" | "content" | "audience";

interface BarRow {
  name: string;
  followers: number;
  nonFollowers: number;
  label: string;
}

interface ContentItemData {
  thumbnail: string;
  caption: string;
  age: string;
  likes: number;
  comments: number;
  reposts: number;
  shares: number;
  saves: number;
  views: number;
  reached: number;
  follows: number;
}

interface InsightsData {
  dateRangeLabel: string;
  contentFilter: string;
  views: string;
  netFollowers: string;
  interactions: string;
  followerPct: number;
  nonFollowerPct: number;
  graph: (number | null)[];
  graphMax?: number;
  graphTopLabel?: string;
  graphMidLabel?: string;
  graphBottomLabel?: string;
  graphStart: string;
  graphMid: string;
  graphEnd: string;
  followerGraph: (number | null)[];
  followerGraphStart: string;
  followerGraphMid: string;
  followerGraphEnd: string;
  followerGraphTopLabel?: string;
  followerGraphMidLabel?: string;
  followerGraphBottomLabel?: string;

  accountsReached: string;
  viewsByType: BarRow[];
  interactionsByType: Record<string, BarRow[]>;
  profileVisits: string;
  bioLinkTaps: string;
  addressTaps: string;
  topCountries: { name: string; pct: number }[];
  topCities: { name: string; pct: number }[];
  ageRanges: { name: string; pct: number }[];
  gender: { name: string; pct: number }[];
  audienceFollowers: string;
  audienceGrowthChange: string;
  audienceGrowthSince: string;
  audienceActiveTimes: { time: string; height: number }[];
  contentItems?: ContentItemData[];
  topContentValues?: string[];

}

const bars = (rows: [string, number, number, string][]): BarRow[] =>
  rows.map(([name, followers, nonFollowers, label]) => ({ name, followers, nonFollowers, label }));

const defaultData: InsightsData = {
  dateRangeLabel: "30 days",
  contentFilter: "All content",
  views: "4,912",
  netFollowers: "--",
  interactions: "277",
  followerPct: 18.4,
  nonFollowerPct: 81.6,
  graph: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2500, 400, 250, 240, 230, 260, 320],
  graphMax: 2500,
  graphTopLabel: "2.5K",
  graphMidLabel: "1.3K",
  graphBottomLabel: "0",
  graphStart: "Jun 28",
  graphMid: "Jul 12",
  graphEnd: "Jul 26",
  followerGraph: [0, -2, -2, 4, -7, -10, 2, -6, -6, -7, -3, -1, -1, 0, -4, -7, -10, -3, -7, -12, -8, -4, -5, -7, -5, -1, -1],
  followerGraphStart: "Jul 23",
  followerGraphMid: "Aug 6",
  followerGraphEnd: "Aug 21",
  followerGraphTopLabel: "12",
  followerGraphMidLabel: "0",
  followerGraphBottomLabel: "-12",

  accountsReached: "2,730",
  viewsByType: bars([
    ["Reels", 8, 62, "3.8K"],
    ["Posts", 8, 6, "639"],
    ["Stories", 5, 3, "443"],
    ["Live videos", 0, 0, "0"],
  ]),
  interactionsByType: {
    All: bars([
      ["Reels", 11, 53, "177"],
      ["Posts", 8, 22, "82"],
      ["Stories", 5, 2, "18"],
      ["Live videos", 0, 0, "0"],
    ]),
    Likes: bars([
      ["Reels", 10, 48, "150"],
      ["Posts", 7, 18, "64"],
      ["Stories", 0, 0, "0"],
      ["Live videos", 0, 0, "0"],
    ]),
    Comments: bars([
      ["Reels", 6, 18, "24"],
      ["Posts", 4, 8, "12"],
      ["Stories", 0, 0, "0"],
      ["Live videos", 0, 0, "0"],
    ]),
    Reposts: bars([
      ["Reels", 55, 0, "8"],
      ["Posts", 48, 0, "7"],
      ["Stories", 0, 0, "0"],
      ["Live videos", 0, 0, "0"],
    ]),
    Shares: bars([
      ["Reels", 62, 0, "42"],
      ["Posts", 33, 0, "21"],
      ["Stories", 1, 0, "1"],
      ["Live videos", 0, 0, "0"],
    ]),
    Saves: bars([
      ["Reels", 62, 0, "34"],
      ["Posts", 38, 0, "21"],
      ["Stories", 0, 0, "0"],
      ["Live videos", 0, 0, "0"],
    ]),
    Replies: bars([
      ["Reels", 12, 0, "3"],
      ["Posts", 6, 0, "1"],
      ["Stories", 0, 0, "0"],
      ["Live videos", 0, 0, "0"],
    ]),
  },
  profileVisits: "332",
  bioLinkTaps: "31",
  addressTaps: "0",
  topCountries: [
    { name: "India", pct: 43.7 },
    { name: "United States", pct: 9.2 },
    { name: "Uzbekistan", pct: 4.3 },
    { name: "Syria", pct: 4.0 },
  ],
  topCities: [
    { name: "Delhi", pct: 1.7 },
    { name: "Mumbai", pct: 1.1 },
    { name: "New York", pct: 1.0 },
    { name: "Hyderabad", pct: 0.8 },
  ],
  ageRanges: [
    { name: "18-24", pct: 35.8 },
    { name: "13-17", pct: 29.0 },
    { name: "25-34", pct: 22.1 },
    { name: "35-44", pct: 7.9 },
  ],
  gender: [
    { name: "Women", pct: 27.1 },
    { name: "Men", pct: 72.9 },
  ],
  audienceFollowers: "4,314",
  audienceGrowthChange: "-2.7%",
  audienceGrowthSince: "since Jul 22",
  audienceActiveTimes: [
    { time: "12a", height: 82 },
    { time: "3a", height: 68 },
    { time: "6a", height: 60 },
    { time: "9a", height: 50 },
    { time: "12p", height: 59 },
    { time: "3p", height: 80 },
    { time: "6p", height: 95 },
    { time: "9p", height: 98 },
  ],
};

const loadInsightsData = (): InsightsData => {
  const saved = getPersistentJson<InsightsData & { savedAt?: number }>("ig_insights_v1", defaultData);
  const backup = getInsightsBackup<InsightsData & { savedAt?: number }>();
  // The IndexedDB copy wins when it is newer (or localStorage was too full to hold the snapshot).
  const best = backup && backup.savedAt >= (saved.savedAt ?? 0) ? backup.data : saved;
  const savedGraph = getPersistentJson<SavedOverviewGraph | null>(OVERVIEW_GRAPH_KEY, null);
  return { ...defaultData, ...best, ...(savedGraph ?? {}) };
};

// Thumbnails are not editable on this screen and are refilled from the reel
// list at render time, so they are never stored — 350 media URLs would
// otherwise overflow localStorage and block every dashboard save.
const prepareInsightsForStorage = (value: InsightsData): InsightsData => ({
  ...value,
  contentItems: value.contentItems?.map((item) => ({ ...item, thumbnail: "" })),
});

/**
 * The overview graph record is merged OVER the full snapshot on load, so it
 * must be rewritten on every save. Otherwise an older graph record silently
 * restores stale graph points / Start-Mid-End dates after navigating back.
 */
const persistInsights = (value: InsightsData): boolean => {
  const graphSnapshot: SavedOverviewGraph = {
    graph: value.graph,
    graphStart: value.graphStart,
    graphMid: value.graphMid,
    graphEnd: value.graphEnd,
  };
  const savedAt = Date.now();
  const snapshot = { ...prepareInsightsForStorage(value), savedAt };
  const backedUp = setInsightsBackup(snapshot, savedAt);
  const graphOk = setPersistentJson(OVERVIEW_GRAPH_KEY, graphSnapshot);
  const fullOk = setPersistentJson("ig_insights_v1", snapshot);
  if (!fullOk && backedUp) console.warn("[Insights] localStorage full; snapshot kept in IndexedDB");
  return (graphOk || backedUp) && (fullOk || backedUp);
};

defaultData.ageRanges = [
  { name: "13-17", pct: 28.7 },
  { name: "18-24", pct: 27.2 },
  { name: "25-34", pct: 25.4 },
  { name: "35-44", pct: 9.9 },
  { name: "45-54", pct: 4.9 },
  { name: "55-64", pct: 2.5 },
  { name: "65+", pct: 2.3 },
];

defaultData.topCountries = [
  { name: "India", pct: 14.4 },
  { name: "Brazil", pct: 9.8 },
  { name: "United States", pct: 8.7 },
  { name: "Mexico", pct: 6.8 },
  { name: "Morocco", pct: 4.5 },
];


const INTERACTION_CHIPS = ["All", "Likes", "Comments", "Reposts", "Shares", "Saves", "Replies"];
const CONTENT_CHIPS = ["Latest", "Views", "Accounts reached", "Follows"];

const fmtPct = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "0.0");

const chipIcon = (name: string) => {
  switch (name) {
    case "Likes":
      return <Heart size={15} strokeWidth={2} />;
    case "Comments":
      return <MessageCircle size={15} strokeWidth={2} className="-scale-x-100" />;
    case "Reposts":
      return <RepostIcon size={15} />;
    case "Shares":
      return <InstagramShareIcon size={15} />;
    case "Saves":
      return <Bookmark size={15} strokeWidth={2} />;
    case "Replies":
      return <CornerUpLeft size={15} strokeWidth={2} />;
    default:
      return null;
  }
};

// Parses an axis label like "5K" / "1.2M" / "2500" into a number.
// Shared so the chart and the graph editor always use the SAME vertical
// scale — otherwise a drawn curve renders squashed or clipped after saving.
const parseAxisLabel = (value?: string) => {
  if (value === undefined || String(value).trim() === "") return undefined;
  const raw = String(value).trim().toUpperCase();
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  if (raw.endsWith("M")) return n * 1_000_000;
  if (raw.endsWith("K")) return n * 1_000;
  return n;
};

const LineChart = ({
  points,
  maxOverride,
  editing,
  topLabel,
  midLabel,
  bottomLabel,
  onLabelChange,
  onChartClick,
}: {
  points: (number | null)[];
  maxOverride?: number;
  editing?: boolean;
  topLabel?: string;
  midLabel?: string;
  bottomLabel?: string;
  onLabelChange?: (key: "top" | "mid" | "bottom", value: string) => void;
  onChartClick?: () => void;
}) => {
  const w = 320;
  const h = 150;
  const parseLabel = parseAxisLabel;
  const labelMax = parseLabel(topLabel);
  const max = Math.max(
    1,
    labelMax && labelMax > 0 ? labelMax : maxOverride && maxOverride > 0 ? maxOverride : Math.max(1, ...points.filter((point): point is number => point != null))
  );

  const step = points.length > 1 ? w / (points.length - 1) : w;
  let startsSegment = true;
  const d = points
    .map((p, i) => {
      if (p == null) {
        startsSegment = true;
        return "";
      }
      const command = startsSegment ? "M" : "L";
      startsSegment = false;
      return `${command}${(i * step).toFixed(1)},${(h - (Math.min(p, max) / max) * (h - 10)).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
  const shown: Record<"top" | "mid" | "bottom", string> = {
    top: topLabel ?? formatCompactMetric(max),
    mid: midLabel ?? formatCompactMetric(max / 2),
    bottom: bottomLabel ?? formatCompactMetric(0),
  };
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between h-[150px] py-[2px] w-10 shrink-0 text-right">
        {(["top", "mid", "bottom"] as const).map((key) =>
          editing ? (
            <input
              key={key}
              className="w-10 bg-secondary rounded text-right text-[10px] outline-none text-foreground px-1"
              value={shown[key]}
              onChange={(e) => onLabelChange?.(key, e.target.value)}
            />
          ) : (
            <span key={key} className="text-[10px] text-muted-foreground leading-none">
              {shown[key]}
            </span>
          )
        )}
      </div>
      <div className="relative w-full h-[150px]">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[150px]">
          {[10, (h + 10) / 2, h].map((y, i) => (
            <line key={i} x1="0" x2={w} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth="0.6" />
          ))}
          <path d={d} fill="none" stroke={PINK} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {onChartClick && (
          <button
            type="button"
            aria-label="Edit graph"
            onClick={onChartClick}
            className="absolute inset-0 z-10 touch-manipulation"
          />
        )}
      </div>
    </div>
  );
};


const AudienceLineChart = ({
  points,
  topLabel,
  midLabel,
  bottomLabel,
  editing,
  onLabelChange,
}: {
  points: (number | null)[];
  topLabel: string;
  midLabel: string;
  bottomLabel: string;
  editing?: boolean;
  onLabelChange?: (key: "top" | "mid" | "bottom", value: string) => void;
}) => {
  const width = 320;
  const height = 116;
  const top = 10;
  const bottom = 106;
  const parse = (value: string, fallback: number) => {
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) && String(value).trim() !== "" ? n : fallback;
  };
  const topValue = parse(topLabel, 12);
  const bottomValue = parse(bottomLabel, -12);
  const numericPoints = points.filter((point): point is number => point != null);
  const min = Math.min(bottomValue, ...numericPoints);
  const max = Math.max(topValue, ...numericPoints);
  const range = Math.max(1, max - min);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const y = (value: number) => top + ((max - value) / range) * (bottom - top);
  let startsSegment = true;
  const path = points.map((point, index) => {
    if (point == null) {
      startsSegment = true;
      return "";
    }
    const command = startsSegment ? "M" : "L";
    startsSegment = false;
    return `${command}${index * step},${y(point)}`;
  }).filter(Boolean).join(" ");

  return (
    <div className="flex gap-3">
      <div className="h-[116px] w-10 shrink-0 flex flex-col justify-between py-[2px] text-right text-[11px] text-muted-foreground">
        {(["top", "mid", "bottom"] as const).map((key) => {
          const value = key === "top" ? topLabel : key === "mid" ? midLabel : bottomLabel;
          return editing ? (
            <input
              key={key}
              className="w-10 bg-secondary rounded text-right text-[11px] outline-none text-foreground px-1"
              value={value}
              onChange={(e) => onLabelChange?.(key, e.target.value)}
            />
          ) : (
            <span key={key}>{value}</span>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[116px] w-full overflow-visible">
        {[top, y(0), bottom].map((lineY) => (
          <line key={lineY} x1="0" x2={width} y1={lineY} y2={lineY} stroke="hsl(var(--border))" strokeWidth="0.6" />
        ))}
        <path d={path} fill="none" stroke={PINK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

const AudienceInfoTitle = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-2">
    <h2 className="text-[16px] font-bold">{children}</h2>
    <Info size={17} strokeWidth={2} className="text-foreground" />
  </div>
);

const BarList = ({
  rows,
  editing,
  onChange,
}: {
  rows: BarRow[];
  editing: boolean;
  onChange: (rows: BarRow[]) => void;
}) => (
  <div className="space-y-3">
    {rows.map((row, i) => (
      <div key={i}>
        {editing ? (
          <input
            className="mb-1 bg-secondary rounded px-1 text-[12px] outline-none text-foreground"
            value={row.name}
            onChange={(e) => onChange(rows.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))}
          />
        ) : (
          <p className="text-[12px] text-foreground mb-1">{row.name}</p>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden flex">
            <div className="h-full ig-bar-gradient" style={{ width: `${Math.max(0, Math.min(100, row.followers))}%` }} />
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, row.nonFollowers))}%`, background: PINK_LIGHT }} />
          </div>
          {editing ? (
            <input
              className="w-16 bg-secondary rounded text-right text-[12px] font-semibold outline-none text-foreground px-1"
              value={row.label}
              onChange={(e) => {
                const next = rows.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r));
                onChange(next);
              }}
            />
          ) : (
            <span className="text-[12px] font-semibold text-foreground shrink-0 whitespace-nowrap">{row.label}</span>
          )}
        </div>
        {editing && (
          <div className="mt-2 flex gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: PINK }} />
              <DecimalInput
                className="w-14 bg-secondary rounded text-[11px] outline-none text-foreground px-1"
                value={row.followers}
                onChange={(v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, followers: v } : r)))}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: PINK_LIGHT }} />
              <DecimalInput
                className="w-14 bg-secondary rounded text-[11px] outline-none text-foreground px-1"
                value={row.nonFollowers}
                onChange={(v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, nonFollowers: v } : r)))}
              />
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
);

const Legend = () => (
  <div className="flex items-center gap-5 mb-4">
    <div className="flex items-center gap-2">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: PINK }} />
      <span className="text-[12px] text-muted-foreground">Followers</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: PINK_LIGHT }} />
      <span className="text-[12px] text-muted-foreground">Non-followers</span>
    </div>
  </div>
);

const InsightsScreen = () => {
  const navigate = useNavigate();
  const usernameVersion = useActiveUsernameVersion();
  const [data, setData] = useState<InsightsData>(loadInsightsData);
  const [tab, setTab] = useState<TabKey>("overview");
  const [metricCard, setMetricCard] = useState<"views" | "netFollowers" | "interactions">("views");
  const [interactionChip, setInteractionChip] = useState("All");
  const [contentChip, setContentChip] = useState("Views");
  const [audienceGrowthTab, setAudienceGrowthTab] = useState("Overall");
  const [audienceLocationTab, setAudienceLocationTab] = useState<"Countries" | "Cities">("Countries");
  const [audienceDay, setAudienceDay] = useState("Su");
  const [isEditing, setIsEditing] = useState(false);
  const [isOverviewGraphEditorOpen, setIsOverviewGraphEditorOpen] = useState(false);
  const [isFollowerGraphEditorOpen, setIsFollowerGraphEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const scopeRef = useRef(getPersistentScope());
  const latestDataRef = useRef(data);
  latestDataRef.current = data;

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setContentLoading(true);
    const t = setTimeout(() => setContentLoading(false), 450);
    return () => clearTimeout(t);
  }, [tab, contentChip]);


  useEffect(() => {
    void usernameVersion;
    const next = getPersistentScope();
    if (scopeRef.current === next) return;
    scopeRef.current = next;
    setData(loadInsightsData());
  }, [usernameVersion]);

  const update = <K extends keyof InsightsData>(key: K, value: InsightsData[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const saveChanges = () => {
    if (!persistInsights(latestDataRef.current)) {
      toast.error("Changes could not be saved. Please try again.");
      return;
    }
    const saved = loadInsightsData();
    setData(saved);
    latestDataRef.current = saved;
    setIsEditing(false);
    toast.success("Changes saved");
  };

  // Editor and chart must share one vertical scale. The chart prefers the
  // custom top label, then graphMax, then the data peak — mirror that here.
  const overviewAxisMax = Math.max(
    1,
    parseAxisLabel(data.graphTopLabel) ||
      (data.graphMax && data.graphMax > 0 ? data.graphMax : Math.max(1, ...data.graph.filter((point): point is number => point != null)))
  );
  // The chart's vertical axis is linear, so the editor's middle gridline is
  // simply half of the top value.
  const overviewAxisMid = overviewAxisMax / 2;


  const saveOverviewGraph = (points: { day: string; thisReel: number | null; typical: number | null }[]) => {

    try {
      const middleIndex = Math.floor((points.length - 1) / 2);
      const current = latestDataRef.current;
      const next: InsightsData = {
        ...current,
        graph: points.map((point) => point.thisReel == null ? null : Math.max(0, Math.round(point.thisReel))),

        graphStart: points[0]?.day || current.graphStart,
        graphMid: points[middleIndex]?.day || current.graphMid,
        graphEnd: points[points.length - 1]?.day || current.graphEnd,
      };
      latestDataRef.current = next;
      setData(next);
      const graphSnapshot: SavedOverviewGraph = {
        graph: next.graph,
        graphStart: next.graphStart,
        graphMid: next.graphMid,
        graphEnd: next.graphEnd,
      };
      // Save the tiny graph payload first. It remains reliable on devices
      // whose older feed/media caches have nearly exhausted browser storage.
      if (!setPersistentJson(OVERVIEW_GRAPH_KEY, graphSnapshot)) {
        throw new Error("Overview graph storage is full");
      }
      // Keep the full dashboard snapshot synchronized when space allows. The
      // dedicated graph copy above is authoritative for this curve.
      persistInsights(next);
      toast.success("Graph saved");
      return true;
    } catch (error) {
      console.warn("[Insights] Failed to save overview graph", error);
      toast.error("Graph could not be saved. Please try again.");
      return false;
    }
  };

  // Follower growth can dip below zero, so the editor scale uses the largest
  // absolute value — same as the chart's symmetric axis.
  const followerAxisMax = Math.max(
    1,
    parseAxisLabel(data.followerGraphTopLabel) ||
      Math.max(1, ...data.followerGraph.filter((point): point is number => point != null).map((v) => Math.abs(v)))
  );
  const followerAxisMid = followerAxisMax / 2;

  const saveFollowerGraph = (points: { day: string; thisReel: number | null; typical: number | null }[]) => {
    try {
      const middleIndex = Math.floor((points.length - 1) / 2);
      const current = latestDataRef.current;
      const next: InsightsData = {
        ...current,
        followerGraph: points.map((point) => point.thisReel == null ? null : Math.round(point.thisReel)),
        followerGraphStart: points[0]?.day || current.followerGraphStart,
        followerGraphMid: points[middleIndex]?.day || current.followerGraphMid,
        followerGraphEnd: points[points.length - 1]?.day || current.followerGraphEnd,
      };
      latestDataRef.current = next;
      setData(next);
      if (!persistInsights(next)) {
        throw new Error("Follower graph storage is full");
      }
      toast.success("Graph saved");
      return true;
    } catch (error) {
      console.warn("[Insights] Failed to save follower graph", error);
      toast.error("Graph could not be saved. Please try again.");
      return false;
    }
  };

  useEffect(() => {
    if (!isEditing) return;
    const t = setTimeout(() => {
      try {
        if (!persistInsights(latestDataRef.current)) {
          console.warn("[Insights] Auto-save could not persist the latest changes");
        }
      } catch (error) {
        console.warn("[Insights] Failed to auto-save changes", error);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [data, isEditing]);

  // Flush pending edits when leaving the screen; the debounced auto-save
  // above is cancelled on unmount, which used to drop the last changes.
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  useEffect(() => () => {
    if (isEditingRef.current) {
      try { persistInsights(latestDataRef.current); } catch (error) { console.warn("[Insights] Failed to flush changes", error); }
    }
  }, []);

  const toggleEdit = () => {
    setIsEditing((e) => !e);
    if (window.navigator.vibrate) window.navigator.vibrate(50);
  };

  const topContent = useMemo(() => {
    void usernameVersion;
    return getInsightTopReels("views", 6);
  }, [usernameVersion]);

  const baseContentItems = useMemo<ContentItemData[]>(() => {
    void usernameVersion;
    const reels = loadReelsData();
    if (data.contentItems && data.contentItems.length) {
      return data.contentItems.map((item, index) =>
        item.thumbnail ? item : { ...item, thumbnail: reels[index]?.thumbnail || "" }
      );
    }
    return reels.map((reel, index) => {
      const ins = reel.insights || ({} as any);
      const views = Number(ins.views) || 0;
      return {
        thumbnail: reel.thumbnail || "",
        caption: reel.caption || "Reel",
        age: index < 2 ? `${index + 1}d` : `${Math.min(9, Math.ceil((index + 1) / 3))}w`,
        likes: Number(ins.likes) || 0,
        comments: Number(ins.comments) || 0,
        reposts: Number(ins.reposts) || 0,
        shares: Number(ins.shares) || 0,
        saves: Number(ins.saves) || 0,
        views,
        reached: Number(ins.accountsReached) || Math.round(views * 0.62),
        follows: Number(ins.follows) || Math.max(0, Math.round(views / 12000)),
      };
    });
  }, [data.contentItems, usernameVersion]);

  const metricKey: "views" | "reached" | "follows" =
    contentChip === "Accounts reached" ? "reached" : contentChip === "Follows" ? "follows" : "views";

  const contentList = useMemo(() => {
    const items = baseContentItems.map((item, index) => ({ ...item, index }));
    const sorted = contentChip === "Latest" ? items : [...items].sort((a, b) => b[metricKey] - a[metricKey]);
    return sorted.slice(0, 12).map((i) => ({ ...i, metric: i[metricKey] }));
  }, [baseContentItems, contentChip, metricKey]);

  const updateContentItem = (index: number, patch: Partial<ContentItemData>) =>
    setData((prev) => ({
      ...prev,
      contentItems: baseContentItems.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));

  const metricLabel =
    contentChip === "Accounts reached" ? "Accounts reached" : contentChip === "Follows" ? "Follows" : "Views";

  if (isLoading) return <InsightDetailSkeleton />;

  const metricCards = [
    { key: "views" as const, label: "Views", value: data.views, field: "views" as const },
    { key: "netFollowers" as const, label: "Net followers", value: data.netFollowers, field: "netFollowers" as const },
    { key: "interactions" as const, label: "Interactions", value: data.interactions, field: "interactions" as const },
  ];

  const interactionRows = data.interactionsByType[interactionChip] || data.interactionsByType.All;

  return (
    <div className="min-h-screen bg-background text-foreground select-none pb-10 animate-fade-in">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background">
        <div className="flex items-center justify-between px-4 h-[52px]">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/analytics")} className="text-foreground">
              <ArrowLeft size={26} strokeWidth={2} />
            </button>
            <h1 className="text-[20px] font-bold leading-none cursor-pointer select-none" onClick={toggleEdit}>
              Insights
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {isEditing && (
              <button onClick={saveChanges} className="bg-[hsl(var(--ig-blue))] text-primary-foreground p-1.5 rounded-full">
                <Check size={18} strokeWidth={3} />
              </button>
            )}
            <Info size={24} strokeWidth={1.8} className="text-foreground" />
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b border-border">
          {([
            ["overview", "Overview"],
            ["content", "Content"],
            ["audience", "Audience"],
          ] as [TabKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "h-[46px] text-[15px] relative",
                tab === key ? "text-foreground font-semibold" : "text-muted-foreground"
              )}
            >
              {label}
              {tab === key && <span className="absolute left-1/2 -translate-x-1/2 -bottom-px w-[90px] h-[3px] bg-foreground" />}
            </button>
          ))}
        </div>
      </header>

      {/* Filter row */}
      {tab !== "audience" && <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <button className="flex items-center gap-1.5">
          {isEditing ? (
            <input
              className="bg-secondary rounded px-2 text-[17px] font-bold outline-none w-40 text-foreground"
              value={data.contentFilter}
              onChange={(e) => update("contentFilter", e.target.value)}
            />
          ) : (
            <span className="text-[17px] font-bold">{data.contentFilter}</span>
          )}
          
        </button>
        <button className="flex items-center gap-1.5 text-muted-foreground">
          {isEditing ? (
            <input
              className="bg-secondary rounded px-2 text-[14px] outline-none w-24 text-right text-foreground"
              value={data.dateRangeLabel}
              onChange={(e) => update("dateRangeLabel", e.target.value)}
            />
          ) : (
            <span className="text-[14px]">{data.dateRangeLabel}</span>
          )}
          <ChevronDown size={16} strokeWidth={2.5} />
        </button>
      </div>}

      {tab === "overview" && contentLoading && <OverviewSkeleton />}

      {tab === "overview" && !contentLoading && (
        <div>
          {/* Metric cards */}
          <div className="flex gap-3 overflow-x-auto hide-scrollbar px-4 pb-4">
            {metricCards.map((card) => {
              const len = String(card.value || "").length;
              const valueSize =
                len > 18 ? "text-[12px]"
                : len > 15 ? "text-[13px]"
                : len > 12 ? "text-[15px]"
                : len > 9 ? "text-[18px]"
                : "text-[22px]";
              return (
                <button
                  key={card.key}
                  onClick={() => setMetricCard(card.key)}
                  className={cn(
                    "shrink-0 w-[45%] min-w-[150px] max-w-[70vw] overflow-hidden text-left rounded-[14px] px-4 py-3.5 bg-secondary/60 border-[3px]",
                    metricCard === card.key ? "border-foreground" : "border-transparent"
                  )}
                >
                  <span className="block text-[13px] text-muted-foreground mb-1.5 truncate">{card.label}</span>
                  {isEditing ? (
                    <input
                      className="w-full min-w-0 bg-background/70 rounded text-[17px] font-bold outline-none text-foreground px-1"
                      value={card.value}
                      onChange={(e) => update(card.field, e.target.value)}
                    />
                  ) : (
                    <span className={cn("block font-bold leading-tight whitespace-nowrap max-w-full", valueSize)}>{card.value}</span>
                  )}
                </button>
              );
            })}
          </div>


          {/* Follower split */}
          <div className="px-4 pb-3">
            <p className="text-[13px] text-foreground">
              {isEditing ? (
                <DecimalInput
                  className="w-16 bg-secondary rounded text-[13px] font-bold outline-none text-foreground px-1"
                  value={data.followerPct}
                  onChange={(v) => setData((p) => ({ ...p, followerPct: v, nonFollowerPct: Math.round((100 - v) * 10) / 10 }))}
                />
              ) : (
                <span className="font-bold">{fmtPct(data.followerPct)}%</span>
              )}{" "}
              followers
            </p>
            <p className="text-[13px] text-foreground">
              {isEditing ? (
                <DecimalInput
                  className="w-16 bg-secondary rounded text-[13px] font-bold outline-none text-foreground px-1"
                  value={data.nonFollowerPct}
                  onChange={(v) => setData((p) => ({ ...p, nonFollowerPct: v, followerPct: Math.round((100 - v) * 10) / 10 }))}
                />
              ) : (
                <span className="font-bold">{fmtPct(data.nonFollowerPct)}%</span>
              )}{" "}
              non-followers
            </p>
          </div>

          {/* Chart */}
          <div className="px-4 pt-4">
            <LineChart
              points={data.graph}
              maxOverride={data.graphMax}
              editing={isEditing}
              topLabel={data.graphTopLabel}
              midLabel={data.graphMidLabel}
              bottomLabel={data.graphBottomLabel}
              onLabelChange={(key, value) =>
                update(
                  key === "top" ? "graphTopLabel" : key === "mid" ? "graphMidLabel" : "graphBottomLabel",
                  value
                )
              }
              onChartClick={() => setIsOverviewGraphEditorOpen(true)}
            />
            <div className="flex justify-between pl-12 pt-2 pb-5">
              {(["graphStart", "graphMid", "graphEnd"] as const).map((k) =>
                isEditing ? (
                  <input
                    key={k}
                    className="w-16 bg-secondary rounded text-[12px] text-center outline-none text-foreground"
                    value={data[k]}
                    onChange={(e) => update(k, e.target.value)}
                  />
                ) : (
                  <span key={k} className="text-[12px] text-muted-foreground">
                    {data[k]}
                  </span>
                )
              )}
            </div>
            {isEditing && (
              <div className="pb-5 space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  Top value
                  <input
                    className="w-24 bg-secondary rounded px-2 py-1 text-[12px] outline-none text-foreground"
                    value={String(data.graphMax ?? Math.max(1, ...data.graph))}
                    onChange={(e) => update("graphMax", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
                  />
                </label>
              </div>
            )}
          </div>


          <div className="h-[8px] bg-secondary/40" />

          {/* Views by content type */}
          <section className="px-4 py-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[16px] font-bold">Views by content type</h2>
              <Info size={17} strokeWidth={1.8} className="text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between pb-3">
              <span className="text-[14px]">Accounts reached</span>
              {isEditing ? (
                <input
                  className="w-24 bg-secondary rounded text-right text-[14px] font-semibold outline-none text-foreground px-1"
                  value={data.accountsReached}
                  onChange={(e) => update("accountsReached", e.target.value)}
                />
              ) : (
                <span className="text-[14px] font-semibold">{data.accountsReached}</span>
              )}
            </div>
            <div className="h-px bg-border mb-4" />
            <Legend />
            <BarList rows={data.viewsByType} editing={isEditing} onChange={(rows) => update("viewsByType", rows)} />
          </section>

          {/* Top content by views */}
          <section className="py-2">
            <div className="flex items-center justify-between px-4 mb-4">
              <h2 className="text-[16px] font-bold">Top content by views</h2>
              <button onClick={() => setTab("content")} className="text-[14px] text-[hsl(var(--ig-blue))] font-medium">
                See all
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar px-4 pb-4">
              {topContent.map((item, i) => {
                const displayValue = data.topContentValues?.[i] ?? item.value;
                return (
                <div key={i} className="relative shrink-0 w-[28%] aspect-[3/4] rounded-[8px] overflow-hidden bg-secondary">
                  {item.videoUrl ? (
                    <VideoThumbnail videoUrl={item.videoUrl} fallbackThumbnail={item.image} className="w-full h-full object-cover" />
                  ) : item.image ? (
                    <img src={item.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-secondary shimmer" />
                  )}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    <svg width="16" height="13" viewBox="0 0 120 100" className="shrink-0">
                      <path d="M15 45 C30 8, 90 8, 105 45" stroke="white" strokeWidth="10" strokeLinecap="round" fill="none" />
                      <circle cx="60" cy="62" r="26" fill="white" />
                    </svg>
                    {isEditing ? (
                      <input
                        className="w-full min-w-0 bg-black/50 rounded px-1 text-white text-[13px] font-bold outline-none"
                        value={String(displayValue)}
                        onChange={(e) => {
                          const next = topContent.map((t, idx) => data.topContentValues?.[idx] ?? String(t.value));
                          next[i] = e.target.value;
                          update("topContentValues", next);
                        }}
                      />
                    ) : (
                      <span className="text-white text-[13px] font-bold">{displayValue}</span>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </section>

          {/* Interactions by content type */}
          <section className="px-4 py-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[16px] font-bold">Interactions by content type</h2>
              <Info size={17} strokeWidth={1.8} className="text-muted-foreground" />
            </div>
            <div className="flex gap-2.5 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-5">
              {INTERACTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setInteractionChip(chip)}
                  className={cn(
                    "shrink-0 flex items-center gap-2 h-[44px] px-5 rounded-full text-[14px] border",
                    interactionChip === chip ? "bg-secondary border-transparent font-medium" : "border-border text-foreground"
                  )}
                >
                  {chipIcon(chip)}
                  {chip}
                </button>
              ))}
            </div>
            <Legend />
            <BarList
              rows={interactionRows}
              editing={isEditing}
              onChange={(rows) => update("interactionsByType", { ...data.interactionsByType, [interactionChip]: rows })}
            />
          </section>

          {/* Profile activity */}
          <section className="px-4 py-6">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-[16px] font-bold">Profile activity</h2>
              <Info size={17} strokeWidth={1.8} className="text-muted-foreground" />
            </div>
            {[
              { icon: <User size={22} strokeWidth={1.8} />, label: "Profile visits", field: "profileVisits" as const },
              { icon: <ExternalLink size={22} strokeWidth={1.8} />, label: "Bio link taps", field: "bioLinkTaps" as const },
              { icon: <Store size={22} strokeWidth={1.8} />, label: "Business address taps", field: "addressTaps" as const },
            ].map((row) => (
              <div key={row.field} className="flex items-center gap-4 py-3">
                <div className="w-[44px] h-[44px] rounded-full bg-secondary/70 flex items-center justify-center shrink-0">
                  {row.icon}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-[14px]">{row.label}</span>
                  {isEditing ? (
                    <input
                      className="w-20 bg-secondary rounded text-right text-[14px] font-semibold outline-none text-foreground px-1"
                      value={data[row.field]}
                      onChange={(e) => update(row.field, e.target.value)}
                    />
                  ) : (
                    <span className="text-[14px] font-semibold">{data[row.field]}</span>
                  )}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === "content" && (
        <div>
          <div className="flex gap-2.5 overflow-x-auto hide-scrollbar px-4 pb-4">
            {CONTENT_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setContentChip(chip)}
                className={cn(
                  "shrink-0 h-[44px] px-5 rounded-full text-[14px] border",
                  contentChip === chip ? "bg-secondary border-transparent font-medium" : "border-border text-foreground"
                )}
              >
                {chip}
              </button>
            ))}
          </div>

          {contentLoading ? (
            <ContentListSkeleton />
          ) : (
            <div>
              {contentList.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 sm:gap-3 px-3 sm:px-4 py-3">
                  <div className="w-[48px] sm:w-[52px] h-[62px] sm:h-[68px] rounded-[4px] overflow-hidden bg-secondary shrink-0">
                    {item.thumbnail && <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      {isEditing ? (
                        <input
                          className="flex-1 min-w-0 bg-secondary rounded px-1 text-[13px] sm:text-[14px] text-foreground outline-none"
                          value={item.caption}
                          onChange={(e) => updateContentItem(item.index, { caption: e.target.value })}
                        />
                      ) : (
                        <p className="text-[13px] sm:text-[14px] text-foreground truncate flex-1 min-w-0">{item.caption}</p>
                      )}
                      {isEditing ? (
                        <input
                          className="w-10 bg-secondary rounded px-1 text-[11px] sm:text-[12px] text-muted-foreground outline-none shrink-0"
                          value={item.age}
                          onChange={(e) => updateContentItem(item.index, { age: e.target.value })}
                        />
                      ) : (
                        <span className="text-[11px] sm:text-[12px] text-muted-foreground shrink-0">{item.age}</span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-2.5 sm:gap-x-3.5 gap-y-1 mt-2 text-muted-foreground">
                      {([
                        ["likes", <Heart key="l" size={14} strokeWidth={1.8} />],
                        ["comments", <MessageCircle key="c" size={14} strokeWidth={1.8} className="-scale-x-100" />],
                        ["reposts", <RepostIcon key="r" size={14} />],
                        ["shares", <InstagramShareIcon key="s" size={14} />],
                        ["saves", <Bookmark key="b" size={14} strokeWidth={1.8} />],
                      ] as [keyof ContentItemData, JSX.Element][]).map(([field, icon]) => (
                        <span key={String(field)} className="flex items-center gap-1 text-[11px] sm:text-[12px]">
                          {icon}
                          {isEditing ? (
                            <input
                              className="w-12 bg-secondary rounded px-1 text-[11px] sm:text-[12px] text-foreground outline-none"
                              value={String(item[field])}
                              onChange={(e) =>
                                updateContentItem(item.index, { [field]: Number(e.target.value.replace(/\D/g, "")) || 0 } as Partial<ContentItemData>)
                              }
                            />
                          ) : (
                            (item[field] as number)
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-1 sm:pl-2">
                    {isEditing ? (
                      <input
                        className="w-16 bg-secondary rounded px-1 text-right text-[15px] sm:text-[16px] font-bold outline-none text-foreground"
                        value={String(item[metricKey])}
                        onChange={(e) =>
                          updateContentItem(item.index, { [metricKey]: Number(e.target.value.replace(/\D/g, "")) || 0 } as Partial<ContentItemData>)
                        }
                      />
                    ) : (
                      <p className="text-[15px] sm:text-[16px] font-bold leading-none whitespace-nowrap">{formatCompactMetric(item.metric)}</p>
                    )}
                    <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1">{metricLabel}</p>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "audience" && contentLoading && <AudienceSkeleton />}

      {tab === "audience" && !contentLoading && (
        <div className="px-[27px] pb-10">
          <section className="pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold">Followers</h2>
              <button className="flex items-center gap-1 text-[15px] text-muted-foreground">
                {isEditing ? <input className="w-20 bg-secondary rounded px-1 text-right outline-none text-foreground" value={data.dateRangeLabel} onChange={(e) => update("dateRangeLabel", e.target.value)} /> : data.dateRangeLabel}
                <ChevronDown size={17} strokeWidth={2.5} />
              </button>
            </div>
            {isEditing ? <input className="mt-8 w-36 bg-secondary rounded text-[24px] font-bold outline-none px-1" value={data.audienceFollowers} onChange={(e) => update("audienceFollowers", e.target.value)} /> : <p className="mt-8 text-[25px] font-bold leading-none">{data.audienceFollowers}</p>}
            <div className="mt-2 flex gap-1 text-[12px] text-muted-foreground">
              {isEditing ? <><input className="w-14 bg-secondary rounded px-1 outline-none" value={data.audienceGrowthChange} onChange={(e) => update("audienceGrowthChange", e.target.value)} /><input className="w-24 bg-secondary rounded px-1 outline-none" value={data.audienceGrowthSince} onChange={(e) => update("audienceGrowthSince", e.target.value)} /></> : <><span className={data.audienceGrowthChange.trim().startsWith("+") ? "text-green-500" : ""}>{data.audienceGrowthChange}</span> <span>{data.audienceGrowthSince}</span></>}
            </div>
          </section>

          <section className="pt-12">
            <h2 className="text-[16px] font-bold mb-5">Follower growth over time</h2>
            <div className="flex gap-2.5 mb-12">
              {["Overall", "Follows", "Unfollows"].map((item) => <button key={item} onClick={() => setAudienceGrowthTab(item)} className={cn("h-[42px] px-5 rounded-full border text-[12px] font-semibold", audienceGrowthTab === item ? "bg-secondary border-transparent" : "border-border")}>{item}</button>)}
            </div>
            <div
              className={isEditing ? "cursor-pointer" : ""}
              onClick={(e) => {
                if (!isEditing) return;
                if (e.target instanceof HTMLInputElement) return;
                setIsFollowerGraphEditorOpen(true);
              }}
            >
              <AudienceLineChart
                points={data.followerGraph}
                topLabel={data.followerGraphTopLabel ?? "12"}
                midLabel={data.followerGraphMidLabel ?? "0"}
                bottomLabel={data.followerGraphBottomLabel ?? "-12"}
                editing={isEditing}
                onLabelChange={(key, value) =>
                  update(
                    key === "top" ? "followerGraphTopLabel" : key === "mid" ? "followerGraphMidLabel" : "followerGraphBottomLabel",
                    value
                  )
                }
              />
            </div>
            <div className="flex justify-between pl-11 pt-2 text-[12px] text-muted-foreground">
              {(["followerGraphStart", "followerGraphMid", "followerGraphEnd"] as const).map((key) => isEditing ? <input key={key} className="w-16 bg-secondary rounded text-center outline-none" value={data[key]} onChange={(e) => update(key, e.target.value)} /> : <span key={key}>{data[key]}</span>)}
            </div>
          </section>

          <section className="pt-12">
            <AudienceInfoTitle>Gender</AudienceInfoTitle>
            <div className="mt-5 space-y-1">
              {data.gender.map((row, index) => (
                <div key={row.name}>
                  <p className="text-[13px] mb-1">{row.name}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden"><div className={cn("h-full rounded-full", index === 0 ? "ig-bar-magenta" : "ig-bar-pink")} style={{ width: `${row.pct}%` }} /></div>
                    {isEditing ? <DecimalInput className="w-14 bg-secondary rounded text-right text-[12px] font-semibold outline-none" value={row.pct} onChange={(value) => update("gender", data.gender.map((item, i) => i === index ? { ...item, pct: value } : item))} /> : <span className="w-[42px] text-right text-[13px] font-semibold">{fmtPct(row.pct)}%</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pt-12">
            <AudienceInfoTitle>Age range</AudienceInfoTitle>
            <div className="flex items-center gap-8 mt-5 mb-7 text-[12px] text-muted-foreground"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full ig-bar-magenta" />Women</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full ig-bar-pink" />Men</span></div>
            <div className="space-y-1">
              {data.ageRanges.map((row, index) => {
                const womenShare = Math.max(0, Math.min(100, data.gender[0]?.pct ?? 30));
                return (
                  <div key={row.name}>
                    <p className="text-[13px] mb-1">{row.name}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden">
                        <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}>
                          <span className="ig-bar-magenta" style={{ width: `${womenShare}%` }} />
                          <span className="flex-1 ig-bar-pink" />
                        </div>
                      </div>
                      {isEditing ? <DecimalInput className="w-14 bg-secondary rounded text-right text-[12px] font-semibold outline-none" value={row.pct} onChange={(value) => update("ageRanges", data.ageRanges.map((item, i) => i === index ? { ...item, pct: value } : item))} /> : <span className="w-[42px] text-right text-[13px] font-semibold">{fmtPct(row.pct)}%</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="pt-12">
            <AudienceInfoTitle>Top locations</AudienceInfoTitle>
            <div className="flex gap-3 mt-5 mb-8">{(["Countries", "Cities"] as const).map((item) => <button key={item} onClick={() => setAudienceLocationTab(item)} className={cn("h-[42px] px-6 rounded-full border text-[12px] font-semibold", audienceLocationTab === item ? "bg-secondary border-transparent" : "border-border")}>{item}</button>)}</div>
            <div className="space-y-1">
              {(audienceLocationTab === "Countries" ? data.topCountries : data.topCities).map((row, index) => {
                const field = audienceLocationTab === "Countries" ? "topCountries" : "topCities";
                const rows = audienceLocationTab === "Countries" ? data.topCountries : data.topCities;
                return <div key={`${field}-${index}`}>{isEditing ? <input className="mb-2 w-full bg-secondary rounded px-2 py-1 text-[14px] outline-none text-foreground" value={row.name} onChange={(e) => update(field, rows.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /> : <p className="text-[13px] mb-1">{row.name}</p>}<div className="flex items-center gap-2"><div className="flex-1 h-[8px] rounded-full ig-bar-track overflow-hidden"><div className="h-full ig-bar-magenta rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }} /></div>{isEditing ? <DecimalInput className="w-14 bg-secondary rounded text-right text-[12px] font-semibold outline-none" value={row.pct} onChange={(value) => update(field, rows.map((item, i) => i === index ? { ...item, pct: value } : item))} /> : <span className="w-[42px] text-right text-[13px] font-semibold">{fmtPct(row.pct)}%</span>}</div></div>;
              })}
            </div>
          </section>

          <section className="pt-12">
            <AudienceInfoTitle>Follower active times</AudienceInfoTitle>
            <p className="mt-1 text-[12px] text-muted-foreground">Based on your current time zone (IST)</p>
            <div className="flex gap-3 mt-5 overflow-x-auto no-scrollbar -mx-[27px] px-[27px]">{["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((day) => <button key={day} onClick={() => setAudienceDay(day)} className={cn("shrink-0 h-[54px] w-[54px] rounded-full border text-[13px] font-semibold", audienceDay === day ? "bg-secondary border-transparent" : "border-border")}>{day}</button>)}</div>
            <div className="h-[235px] flex items-end gap-2 mt-7">
              {data.audienceActiveTimes.map((item, index) => <div key={item.time} className="h-full flex-1 flex flex-col justify-end items-center"><div className="w-full ig-bar-magenta rounded-[6px]" style={{ height: `${item.height}%` }} />{isEditing && <input type="number" className="mt-1 w-full bg-secondary text-center text-[9px] rounded outline-none" value={item.height} onChange={(e) => update("audienceActiveTimes", data.audienceActiveTimes.map((bar, i) => i === index ? { ...bar, height: Math.min(100, Math.max(0, Number(e.target.value))) } : bar))} />}</div>)}
            </div>

            <div className="grid grid-cols-8 gap-2 mt-3 text-center text-[12px] text-muted-foreground">{data.audienceActiveTimes.map((item) => <span key={item.time}>{item.time}</span>)}</div>

            <div className="pt-9 pb-5">
              <h3 className="text-[15px] font-bold mb-6">When followers are most active</h3>
              {["Sundays", "Fridays", "Saturdays"].map((day) => <div key={day} className="mb-5"><p className="text-[14px] font-semibold">{day}</p><p className="text-[14px] mt-1">9 PM - 11 PM</p></div>)}
            </div>
          </section>
        </div>
      )}


      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-0 right-0 flex justify-center z-[60]"
          >
            <button
              onClick={saveChanges}
              className="bg-[hsl(var(--ig-blue))] text-primary-foreground font-bold py-3 px-10 rounded-full shadow-2xl flex items-center gap-2 text-[12px]"
            >
              <Check size={18} strokeWidth={3} />
              SAVE CHANGES
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <GraphEditorModal
        key={`overview-graph-${isOverviewGraphEditorOpen ? "open" : "closed"}`}
        open={isOverviewGraphEditorOpen}
        onClose={() => setIsOverviewGraphEditorOpen(false)}
        onSave={saveOverviewGraph}
        initialData={data.graph.map((value, index) => ({
          day:
            index === 0
              ? data.graphStart
              : index === Math.floor((data.graph.length - 1) / 2)
                ? data.graphMid
                : index === data.graph.length - 1
                  ? data.graphEnd
                  : "",
          thisReel: value,
          typical: null,
        }))}
        maxViews={overviewAxisMax}
        midViews={overviewAxisMid}

      />

      <GraphEditorModal
        key={`follower-graph-${isFollowerGraphEditorOpen ? "open" : "closed"}`}
        open={isFollowerGraphEditorOpen}
        onClose={() => setIsFollowerGraphEditorOpen(false)}
        onSave={saveFollowerGraph}
        initialData={data.followerGraph.map((value, index) => ({
          day:
            index === 0
              ? data.followerGraphStart
              : index === Math.floor((data.followerGraph.length - 1) / 2)
                ? data.followerGraphMid
                : index === data.followerGraph.length - 1
                  ? data.followerGraphEnd
                  : "",
          thisReel: value,
          typical: null,
        }))}
        maxViews={followerAxisMax}
        midViews={followerAxisMid}
      />
    </div>
  );
};

export default InsightsScreen;
