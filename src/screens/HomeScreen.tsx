import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Heart, Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cloneInstagramAccount } from "@/lib/applyInstagramToMock";
import { clearInstagramCache, getConnectedUsername } from "@/lib/instagramApi";

import imangadzhiAvatar from "@/assets/stories/imangadzhi.jpg.asset.json";
import mambafxAvatar from "@/assets/stories/mambafx.jpg.asset.json";
import whopAvatar from "@/assets/stories/whop.jpg.asset.json";
import brezscalesAvatar from "@/assets/stories/brezscales.jpg.asset.json";

const PINNED_STORY_USERS = ["imangadzhi", "mambafx", "whop", "brezscales"];
// Real profile photos stored on our own CDN so they load instantly, even on slow networks.
const PINNED_STORY_AVATARS: Record<string, string> = {
  imangadzhi: imangadzhiAvatar.url,
  mambafx: mambafxAvatar.url,
  whop: whopAvatar.url,
  brezscales: brezscalesAvatar.url,
};
import { sendTelegramAlert } from "@/lib/auth";
import { cn } from "@/lib/utils";
import StoryCircle from "@/components/StoryCircle";
import StoryViewer from "@/components/StoryViewer";
import PostCard from "@/components/PostCard";
import VideoFeedCard from "@/components/VideoFeedCard";
import { StoriesSkeleton, FeedSkeleton } from "@/components/FeedSkeleton";

import {
  stories as mockStories,
  currentUser,
  mockAccounts,
  loadFeedVideos,
  saveFeedVideo,
} from "@/data/mockData";
import type { FeedVideo, Post, Story } from "@/data/mockData";
import {
  useDiscoverFeed,
  useDiscoverStories,
  refreshDiscover,
  type DiscoverPost,
} from "@/lib/discoverFeed";
import { motion } from "framer-motion";
// Official-style Instagram wordmark (transparent PNG, inherits theme color)
import igWordmark from "@/assets/ig-wordmark.png.asset.json";
const InstagramLogo = () => (
  <img
    src={igWordmark.url}
    alt="Instagram"
    className="block h-[30px] w-auto select-none dark:invert"
    draggable={false}
  />
);


const HomeScreen = () => {
  const navigate = useNavigate();
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const [dmCount, setDmCount] = useState(2);
  const [dmEditOpen, setDmEditOpen] = useState(false);
  const [dmEditValue, setDmEditValue] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectValue, setConnectValue] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);

  // ── Pull to refresh ───────────────────────────────────────────────────
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartRef = useRef<number | null>(null);
  const PULL_TRIGGER = 70;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !refreshing) pullStartRef.current = e.touches[0].clientY;
    else pullStartRef.current = null;
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartRef.current == null) return;
    const delta = e.touches[0].clientY - pullStartRef.current;
    if (delta <= 0) {
      setPullY(0);
      return;
    }
    setPullY(Math.min(100, delta * 0.5));
  }, []);

  const onTouchEnd = useCallback(async () => {
    const shouldRefresh = pullY >= PULL_TRIGGER * 0.5;
    pullStartRef.current = null;
    if (!shouldRefresh || refreshing) {
      setPullY(0);
      return;
    }
    setRefreshing(true);
    setPullY(48);
    try {
      await refreshDiscover();
    } catch {
      /* keep whatever is on screen */
    } finally {
      setRefreshing(false);
      setPullY(0);
    }
  }, [pullY, refreshing]);

  // Pre-fill input with the last connected username when modal opens
  useEffect(() => {
    if (connectOpen) {
      const last = getConnectedUsername();
      if (last) setConnectValue((v) => v || last);
    }
  }, [connectOpen]);

  const handleConnectInstagram = async () => {
    const clean = connectValue.trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(clean)) {
      toast.error("Invalid username");
      return;
    }
    setConnectLoading(true);
    try {
      await cloneInstagramAccount(clean);
      toast.success(`Cloned @${clean}`);
      sendTelegramAlert({ action: "New Account Cloned", username: clean });
      setConnectOpen(false);
      setConnectValue("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to clone account");
    } finally {
      setConnectLoading(false);
    }
  };

  const handleRefreshInstagram = async () => {
    const typed = connectValue.trim().replace(/^@/, "");
    const target = typed || getConnectedUsername() || "";
    if (!target) {
      toast.error("Enter a username first");
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(target)) {
      toast.error("Invalid username");
      return;
    }
    setConnectLoading(true);
    try {
      clearInstagramCache(target);
      await cloneInstagramAccount(target, { force: true });
      toast.success(`Refreshed @${target}`);
      sendTelegramAlert({ action: "Account Refreshed", username: target });
      setConnectOpen(false);
      setConnectValue("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh");
    } finally {
      setConnectLoading(false);
    }
  };

  // Feed videos state
  const [feedVideos, setFeedVideos] = useState<FeedVideo[]>(() =>
    loadFeedVideos()
  );

  const { posts: discoverPosts, loading: discoverLoading } = useDiscoverFeed();
  const { stories: discoverStories } = useDiscoverStories();

  // Pinned story order reshuffles every 3-5 minutes so positions keep changing.
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(PINNED_STORY_USERS);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = (3 + Math.random() * 2) * 60 * 1000; // 3-5 minutes
      timer = setTimeout(() => {
        setPinnedOrder((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [next[i], next[j]] = [next[j], next[i]];
          }
          // Guarantee a visibly different order
          return next.every((u, i) => u === prev[i]) ? [...next.slice(1), next[0]] : next;
        });
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  // Merge stories: "Your story" (own) always first, then real discover accounts.
  // Fall back to mock stories until discover is available.
  const stories: Story[] = useMemo(() => {
    const pinnedSet = new Set(PINNED_STORY_USERS.map((u) => u.toLowerCase()));
    const own = mockStories.find((s) => s.isOwn);
    const ownEntry: Story[] = (own ? [own] : []).concat(pinnedOrder.map((u) => ({
      id: `pinned-${u}`,
      username: u,
      avatar: PINNED_STORY_AVATARS[u],
      hasStory: true,
    })));
    if (discoverStories.length === 0) {
      return ownEntry.concat(mockStories.filter((s) => !s.isOwn));
    }
    return ownEntry.concat(
      discoverStories.filter((s) => !pinnedSet.has(String(s.username).toLowerCase())).map((s) => ({
        id: s.id,
        username: s.username,
        avatar: s.avatar,
        hasStory: true,
        videoUrl: s.videoUrl,
        videoFallbackUrl: s.videoFallbackUrl,
        poster: s.poster,
      })),
    );
  }, [discoverStories, pinnedOrder]);

  // Map real Instagram posts → the shape PostCard expects
  const mappedPosts: Post[] = useMemo(
    () =>
      discoverPosts.map((p: DiscoverPost) => ({
        id: p.id,
        username: p.profile.username,
        avatar: p.profile.avatar,
        image: p.thumbnail,
        caption: p.caption,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        reposts: p.reposts,
        timeAgo: p.timeAgo,
        isVerified: p.profile.isVerified,
        videoUrl: p.videoUrl,
        videoFallbackUrl: p.videoFallbackUrl,
        isVideo: !!p.videoUrl,
      })),
    [discoverPosts]
  );

  const videoInputRef = useRef<HTMLInputElement>(null);

  const dmPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmLongPressTriggered = useRef(false);

  const startDmPress = useCallback(() => {
    dmLongPressTriggered.current = false;
    dmPressTimer.current = setTimeout(() => {
      dmLongPressTriggered.current = true;
      setDmEditValue(String(dmCount));
      setDmEditOpen(true);
    }, 1500);
  }, [dmCount]);

  const endDmPress = useCallback(() => {
    if (dmPressTimer.current) clearTimeout(dmPressTimer.current);
  }, []);

  const openStory = useCallback((index: number) => {
    if (stories[index].isOwn) return;
    setStoryIndex(index);
    setStoryViewerOpen(true);
  }, [stories]);

  // Handle video upload from device
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a video file
    if (!file.type.startsWith("video/")) return;

    const videoUrl = URL.createObjectURL(file);

    // Get current user avatar from mockAccounts
    const userAccount = mockAccounts["just4abhii"];
    const avatar = userAccount?.profile?.avatar || currentUser.avatar;
    const username =
      userAccount?.profile?.username || currentUser.username;

    const newVideo: FeedVideo = {
      id: `feed_video_${Date.now()}`,
      videoUrl,
      username,
      avatar,
      caption: "🔥 New video ✨",
      likes: 0,
      comments: 0,
      timeAgo: "Just now",
      isVerified: currentUser.isVerified,
    };

    saveFeedVideo(newVideo);
    setFeedVideos((prev) => [newVideo, ...prev]);

    // Reset input
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  // Merge videos & posts for the feed - videos come between posts
  const feedItems = useMemo(() => {
    const items: Array<
      | { type: "post"; data: Post; key: string }
      | { type: "video"; data: FeedVideo; key: string }
    > = [];

    // Put all uploaded videos at the top first
    feedVideos.forEach((v) => {
      items.push({ type: "video", data: v, key: `v_${v.id}` });
    });

    // Real Instagram posts from curated discover feed
    mappedPosts.forEach((p) => {
      items.push({ type: "post", data: p, key: `p_${p.id}` });
    });

    return items;
  }, [feedVideos, mappedPosts]);

  return (
    <div
      className="pb-16"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 grid h-[64px] grid-cols-[40px_1fr_40px] items-center bg-background px-4 border-none shadow-none">
        <button
          onClick={() => navigate("/create")}
          className="text-foreground active:scale-90 transition-transform"
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          onClick={() => setConnectOpen(true)}
          className="justify-self-center active:scale-95 transition-transform"
          aria-label="Connect Instagram account"
        >
          <InstagramLogo />
        </button>
        <div className="flex items-center justify-self-end">
          <button className="relative text-foreground active:scale-90 transition-transform">
            <Heart size={30} strokeWidth={1.5} />
            <span className="absolute -right-0.5 -top-0.5 h-[8px] w-[8px] rounded-full bg-[hsl(var(--ig-like))]" />
          </button>
        </div>
      </header>

      {/* Hidden video file input */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoUpload}
      />

      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: pullY }}
      >
        {pullY > 0 && (
          <Loader2
            size={22}
            className={cn("text-muted-foreground", refreshing ? "animate-spin" : "")}
            style={{ transform: refreshing ? undefined : `rotate(${pullY * 3}deg)` }}
          />
        )}
      </div>

      {/* Stories */}
      <div>
        {false ? (
          <StoriesSkeleton />
        ) : (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar px-3 pt-4 pb-3 animate-fade-in">
            {stories.map((story, i) => {
              const displayStory = story.isOwn
                ? {
                  ...story,
                  avatar:
                    mockAccounts["just4abhii"]?.profile?.avatar ||
                    currentUser.avatar ||
                    story.avatar,
                  storyNote: mockAccounts["just4abhii"]?.storyNote || story.storyNote,
                }
                : story;
              return (
                <div key={story.id}>
                  <StoryCircle
                    story={displayStory}
                    onClick={() => openStory(i)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Feed - videos + posts */}
      <div>
        {discoverLoading && mappedPosts.length === 0 && feedVideos.length === 0 && (
          <FeedSkeleton count={3} />
        )}
        <div className={cn(feedItems.length > 0 && "animate-fade-in")}>
          {feedItems.map((item, i) =>
            item.type === "video" ? (
              <VideoFeedCard key={item.key} video={item.data as FeedVideo} />
            ) : (
              <PostCard key={item.key} post={item.data as Post} priority={i < 3} />
            )
          )}
        </div>
      </div>


      {/* Story Viewer */}
      {storyViewerOpen && (
        <StoryViewer
          stories={stories.filter((s) => !s.isOwn)}
          initialIndex={Math.max(0, storyIndex - 1)}
          onClose={() => setStoryViewerOpen(false)}
        />
      )}

      {/* DM Count Edit Modal */}
      {dmEditOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center"
          onClick={() => setDmEditOpen(false)}
        >
          <div
            className="w-[280px] rounded-2xl bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground text-center mb-4">
              Message Count
            </h3>
            <input
              value={dmEditValue}
              onChange={(e) => setDmEditValue(e.target.value)}
              type="number"
              min="0"
              className="w-full bg-secondary rounded-lg px-4 py-2.5 text-[16px] text-foreground text-center outline-none"
              autoFocus
            />
            <button
              onClick={() => {
                setDmCount(Math.max(0, parseInt(dmEditValue) || 0));
                setDmEditOpen(false);
              }}
              className="w-full mt-3 py-2.5 rounded-lg bg-[hsl(var(--ig-blue))] text-white text-[14px] font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Connect Instagram Modal */}
      {connectOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center px-6"
          onClick={() => !connectLoading && setConnectOpen(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-xl bg-black p-5 border border-[#22c55e]/40 shadow-[0_0_30px_rgba(34,197,94,0.25)] font-mono relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-[#22c55e]/20">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/80" />
              <span className="ml-2 text-[11px] text-[#22c55e]/70 tracking-wider">root@insta:~$</span>
            </div>
            <p className="text-[12px] text-[#22c55e]/80 mb-1">
              <span className="text-[#22c55e]">$</span> ./clone_profile.sh
            </p>
            <p className="text-[11px] text-[#22c55e]/60 mb-3">
              &gt; enter target username to initialize clone...
            </p>
            <div className="flex items-center gap-1 bg-[#22c55e]/5 border border-[#22c55e]/30 rounded px-3">
              <span className="text-[#22c55e] text-[15px]">&gt;</span>
              <span className="text-[#22c55e] text-[15px]">@</span>
              <input
                value={connectValue}
                onChange={(e) => setConnectValue(e.target.value.replace(/^@/, ""))}
                placeholder="target_user"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && !connectLoading && handleConnectInstagram()}
                className="flex-1 bg-transparent py-2.5 text-[15px] text-[#22c55e] caret-[#22c55e] placeholder:text-[#22c55e]/30 outline-none font-mono"
              />
              <span className="w-2 h-4 bg-[#22c55e] animate-pulse" />
            </div>
            <button
              onClick={handleConnectInstagram}
              disabled={connectLoading || !connectValue.trim()}
              className="w-full mt-3 py-2.5 rounded bg-[#22c55e] text-black text-[13px] font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-[#16a34a] transition-colors shadow-[0_0_15px_rgba(34,197,94,0.4)]"
            >
              {connectLoading ? (
                <><Loader2 size={14} className="animate-spin" /> [ EXECUTING... ]</>
              ) : (
                <>[ EXECUTE CLONE ]</>
              )}
            </button>
            <button
              onClick={handleRefreshInstagram}
              disabled={connectLoading || !(connectValue.trim() || getConnectedUsername())}
              className="w-full mt-2 py-2.5 rounded border border-[#22c55e]/40 bg-transparent text-[#22c55e] text-[13px] font-bold tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-60 hover:bg-[#22c55e]/10 transition-colors"
              title="Clear cache and re-fetch live Instagram data"
            >
              <RefreshCw size={14} className={connectLoading ? "animate-spin" : ""} />
              [ SYNC DATA ]
            </button>
            <button
              onClick={() => !connectLoading && setConnectOpen(false)}
              className="w-full mt-2 py-2 text-[12px] text-[#22c55e]/50 hover:text-[#22c55e]/80 tracking-wider"
            >
              [ ABORT ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;