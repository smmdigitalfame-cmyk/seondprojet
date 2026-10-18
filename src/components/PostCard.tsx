import { useState, useRef, useCallback, useEffect } from "react";
import { Heart, MessageCircle, Bookmark, MoreHorizontal } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import InstagramShareIcon from "@/components/icons/InstagramShareIcon";
import { useNavigate } from "react-router-dom";
import type { Post } from "@/data/mockData";
import { formatMetric } from "@/lib/formatMetric";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import CommentsSheet from "@/components/CommentsSheet";
import ShareSheet from "@/components/ShareSheet";
import { trackEvent } from "@/lib/analytics";
import RecordingSafeVideo from "@/components/RecordingSafeVideo";
import { startPlayback, stopPlayback } from "@/lib/videoPlayback";

interface PostCardProps {
  post: Post;
  /** First few cards decode eagerly; the rest load lazily to keep scroll smooth. */
  priority?: boolean;
}

const PostCard = ({ post, priority = false }: PostCardProps) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(post.isLiked ?? false);
  const [saved, setSaved] = useState(post.isBookmarked ?? false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [repostCount, setRepostCount] = useState(
    post.reposts ?? 0
  );
  const [shareCount, setShareCount] = useState(
    post.shares ?? 0
  );
  const [username, setUsername] = useState(post.username);
  const [caption, setCaption] = useState(post.caption);
  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const media = mediaRef.current;
    const video = videoRef.current;
    if (!post.videoUrl || !media || !video) return;
    let cancel: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        cancel?.();
        cancel = startPlayback(video, { muted: true });
      }
      else {
        cancel?.();
        cancel = undefined;
        stopPlayback(video);
      }
    }, { rootMargin: "200px 0px", threshold: 0.35 });
    observer.observe(media);
    return () => {
      cancel?.();
      observer.disconnect();
    };
  }, [post.videoUrl]);

  // Long-press edit state
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Long press handlers
  const startPress = useCallback((field: string, currentValue: string) => {
    longPressTriggered.current = false;
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setEditField(field);
      setEditValue(currentValue);
    }, 2000);
  }, []);

  const endPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  const saveEdit = () => {
    if (!editField) return;
    if (editField === "likes") {
      setLikeCount(Math.max(0, parseInt(editValue) || 0));
    } else if (editField === "comments") {
      setCommentCount(Math.max(0, parseInt(editValue) || 0));
    } else if (editField === "reposts") {
      setRepostCount(Math.max(0, parseInt(editValue) || 0));
    } else if (editField === "shares") {
      setShareCount(Math.max(0, parseInt(editValue) || 0));
    } else if (editField === "username") {
      setUsername(editValue || post.username);
    } else if (editField === "caption") {
      setCaption(editValue);
    }
    setEditField(null);
  };

  const handleDoubleTap = () => {
    if (!liked) {
      setLiked(true);
      setLikeCount((c) => c + 1);
      setLikeAnimating(true);
      setTimeout(() => setLikeAnimating(false), 350);
      trackEvent("like", { post_id: post.id, method: "double_tap" });
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 900);
  };

  const toggleLike = () => {
    if (longPressTriggered.current) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    if (newLiked) {
      setLikeAnimating(true);
      setTimeout(() => setLikeAnimating(false), 350);
    }
    trackEvent(newLiked ? "like" : "unlike", { post_id: post.id });
  };

  const toggleSave = () => {
    setSaved((v) => !v);
    trackEvent(saved ? "unsave" : "save", { post_id: post.id });
  };

  const isLongCaption = caption.length > 80;

  const formatCount = (n: number) => formatMetric(n);

  return (
    <>
      <article>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2.5">
            <div className="story-ring">
              <div className="rounded-full bg-background p-[1.5px]">
                <img src={post.avatar} alt={username} className="h-[32px] w-[32px] rounded-full object-cover" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (longPressTriggered.current) return;
                    navigate('/profile');
                  }}
                  onPointerDown={() => startPress("username", username)}
                  onPointerUp={endPress}
                  onPointerLeave={endPress}
                  className="text-[13px] font-semibold text-foreground"
                >
                  {username}
                </button>
                {post.isVerified && (
                  <VerifiedBadge size={14} className="text-[hsl(var(--ig-blue))]" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">Suggested for you</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-foreground p-1 active:opacity-50 transition-opacity">
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>

        {/* Image with shimmer loading */}
        <div ref={mediaRef} className="relative select-none" onDoubleClick={handleDoubleTap}>
          {!imgLoaded && <div className="w-full aspect-square shimmer" />}
          {post.videoUrl ? (
            <RecordingSafeVideo
              ref={videoRef}
              src={post.videoUrl}
              fallbackSrc={post.videoFallbackUrl}
              poster={post.image}
              className={cn("w-full aspect-square object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0")}
              muted
              loop
              playsInline
              preload={priority ? "auto" : "metadata"}
              onLoadedData={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          ) : (
            <img
              src={post.image}
              alt="Post"
              className={cn("w-full aspect-square object-cover transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0")}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "low"}
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          )}
          <AnimatePresence>
            {showHeart && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <Heart size={90} className="fill-white text-white drop-shadow-2xl" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-3 pt-3 pb-1">
          <motion.button
            whileTap={{ scale: 0.7 }}
            onClick={toggleLike}
            onPointerDown={() => startPress("likes", String(likeCount))}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            className={cn("flex items-center gap-1.5", likeAnimating && "ig-like-bounce")}
          >
            <Heart
              size={24}
              className={cn(
                "transition-colors duration-200",
                liked ? "fill-[hsl(var(--ig-like))] text-[hsl(var(--ig-like))]" : "text-foreground"
              )}
            />
            <span className="text-[13px] font-medium text-foreground">
              {formatCount(likeCount)}
            </span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={() => {
              if (longPressTriggered.current) return;
              setShowComments(true);
            }}
            onPointerDown={() => startPress("comments", String(commentCount))}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            className="flex items-center gap-1.5"
          >
            <MessageCircle size={24} className="text-foreground" style={{ transform: 'scaleX(-1)' }} />
            <span className="text-[13px] font-medium text-foreground">{commentCount > 0 ? formatCount(commentCount) : ''}</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={() => startPress("reposts", String(repostCount))}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            className="flex items-center gap-1.5"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
            <span className="text-[13px] font-medium text-foreground">{repostCount > 0 ? formatCount(repostCount) : ''}</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={() => {
              if (longPressTriggered.current) return;
              setShowShare(true);
            }}
            onPointerDown={() => startPress("shares", String(shareCount))}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            className="flex items-center gap-1.5"
          >
            <InstagramShareIcon size={22} className="text-foreground" />
            <span className="text-[13px] font-medium text-foreground">{shareCount > 0 ? formatCount(shareCount) : ''}</span>
          </motion.button>
        </div>

        {/* Caption - long press to edit */}
        <div className="px-3 pb-3 pt-1">
          <p
            className="mt-0.5 text-[13px] text-foreground leading-[18px]"
            onPointerDown={() => startPress("caption", caption)}
            onPointerUp={endPress}
            onPointerLeave={endPress}
          >
            <span className="font-semibold">{username}</span>{" "}
            {isLongCaption && !expanded ? (
              <>
                {caption.slice(0, 80)}...{" "}
                <button onClick={() => setExpanded(true)} className="text-muted-foreground">more</button>
              </>
            ) : (
              caption
            )}
          </p>
          {commentCount > 0 && (
            <button onClick={() => setShowComments(true)} className="mt-1 text-[13px] text-muted-foreground">
              View all {formatCount(commentCount)} comments
            </button>
          )}
          <p className="mt-0.5 text-[10px] text-muted-foreground">{post.timeAgo}</p>
        </div>
      </article>

      <CommentsSheet isOpen={showComments} onClose={() => setShowComments(false)} postUsername={username} />
      <ShareSheet isOpen={showShare} onClose={() => setShowShare(false)} />

      {/* Edit Modal (long-press) */}
      {editField && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center"
          onClick={() => setEditField(null)}
        >
          <div
            className="w-[280px] rounded-2xl bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground text-center mb-4 capitalize">
              Edit {editField}
            </h3>
            {editField === "caption" ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={3}
                className="w-full bg-secondary rounded-lg px-4 py-2.5 text-[14px] text-foreground outline-none resize-none"
                autoFocus
              />
            ) : editField === "username" ? (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                type="text"
                className="w-full bg-secondary rounded-lg px-4 py-2.5 text-[14px] text-foreground text-center outline-none"
                autoFocus
              />
            ) : (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                type="number"
                min="0"
                className="w-full bg-secondary rounded-lg px-4 py-2.5 text-[16px] text-foreground text-center outline-none"
                autoFocus
              />
            )}
            <button
              onClick={saveEdit}
              className="w-full mt-3 py-2.5 rounded-lg bg-[hsl(var(--ig-blue))] text-white text-[14px] font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PostCard;