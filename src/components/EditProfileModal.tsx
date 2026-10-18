import { useState, useRef, useEffect } from "react";
import { X, Camera, Moon, Sun, Link2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cloneInstagramAccount } from "@/lib/applyInstagramToMock";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    username: string;
    fullName: string;
    bio: string;
    website?: string;
    avatar: string;
    posts: number;
    followers: number;
    following: number;
    isVerified?: boolean;
  };
  storyNote?: string;
  category?: string;
  postsDisplay?: string;
  followersDisplay?: string;
  followingDisplay?: string;
  dashboardViews?: string;
  onSave: (data: {
    fullName: string;
    username: string;
    bio: string;
    website: string;
    posts: number;
    followers: number;
    following: number;
    storyNote: string;
    category: string;
    showCategory: boolean;
    isVerified: boolean;
    avatar?: string;
    postsDisplay?: string;
    followersDisplay?: string;
    followingDisplay?: string;
    dashboardViews?: string;
  }) => void;
  showHighlights?: boolean;
  onToggleHighlights?: (val: boolean) => void;
}

const EditProfileModal = ({ isOpen, onClose, profile, storyNote: initialStoryNote, category: initialCategory, postsDisplay: initialPostsDisplay, followersDisplay: initialFollowersDisplay, followingDisplay: initialFollowingDisplay, dashboardViews: initialDashboardViews, onSave, showHighlights, onToggleHighlights }: EditProfileModalProps) => {
  const [fullName, setFullName] = useState(profile.fullName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [website, setWebsite] = useState(profile.website || "");
  const [posts, setPosts] = useState(initialPostsDisplay || String(profile.posts));
  const [followers, setFollowers] = useState(initialFollowersDisplay || String(profile.followers));
  const [following, setFollowing] = useState(initialFollowingDisplay || String(profile.following));
  const [storyNote, setStoryNote] = useState(initialStoryNote || "");
  const [category, setCategory] = useState(initialCategory || "");
  // Agar category pehle se set hai to ON, warna OFF (user explicitly enable kare)
  const [showCategory, setShowCategory] = useState(!!initialCategory);
  const [isVerified, setIsVerified] = useState(!!profile.isVerified);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar);
  const [dashboardViews, setDashboardViews] = useState(initialDashboardViews || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connecting, setConnecting] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    if (isOpen) {
      setIsDark(document.documentElement.classList.contains("dark"));
    }
  }, [isOpen]);

  const handleToggleTheme = () => {
    const html = document.documentElement;
    const next = !html.classList.contains("dark");
    html.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  };

  // Reset all fields when modal opens or profile changes
  useEffect(() => {
    if (isOpen) {
      setFullName(profile.fullName);
      setUsername(profile.username);
      setBio(profile.bio);
      setWebsite(profile.website || "");
      setPosts(initialPostsDisplay || String(profile.posts));
      setFollowers(initialFollowersDisplay || String(profile.followers));
      setFollowing(initialFollowingDisplay || String(profile.following));
      setStoryNote(initialStoryNote || "");
      setCategory(initialCategory || "");
      setShowCategory(!!initialCategory);
      setIsVerified(!!profile.isVerified);
      setAvatarPreview(profile.avatar);
      setDashboardViews(initialDashboardViews || "");
    }
  }, [isOpen]);

  const handlePhotoChange = () => {
    fileInputRef.current?.click();
  };

  const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

  const handleConnect = async () => {
    const clean = username.trim().replace(/^@/, "");
    if (!USERNAME_RE.test(clean)) {
      toast.error("Invalid username");
      return;
    }
    setConnecting(true);
    try {
      toast.loading(`Cloning @${clean}...`, { id: "edit-connect" });
      await cloneInstagramAccount(clean);
      toast.success(`Connected @${clean}`, { id: "edit-connect" });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to connect", { id: "edit-connect" });
    } finally {
      setConnecting(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  const parseNum = (v: string) => {
    const trimmed = v.trim().toLowerCase();
    // Handle K, M, B suffixes (e.g. "10K" = 10000, "1.5M" = 1500000)
    const suffixMatch = trimmed.match(/^([0-9]*\.?[0-9]+)\s*(k|m|b)$/i);
    if (suffixMatch) {
      const num = parseFloat(suffixMatch[1]);
      const suffix = suffixMatch[2].toLowerCase();
      if (suffix === 'k') return Math.round(num * 1000);
      if (suffix === 'm') return Math.round(num * 1000000);
      if (suffix === 'b') return Math.round(num * 1000000000);
    }
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  };

  const formatDisplay = (n: number) => {
    if (n >= 1000000000) return `${(n / 1000000000).toFixed(1).replace(/\.0$/, '')}B`;
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  };

  const handleDone = () => {
    onSave({
      fullName,
      username,
      bio,
      website,
      posts: parseNum(posts),
      followers: parseNum(followers),
      following: parseNum(following),
      storyNote,
      category,
      showCategory,
      isVerified,
      avatar: avatarPreview,
      postsDisplay: posts,
      followersDisplay: followers,
      followingDisplay: following,
      dashboardViews,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-background max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <button onClick={onClose} className="text-foreground"><X size={24} /></button>
          <h3 className="text-base font-bold text-foreground">Edit profile</h3>
          <button onClick={handleDone} className="text-sm font-bold text-[hsl(var(--ig-blue))]">
            Done
          </button>
        </div>

        <div className="px-4 py-5 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative" onClick={handlePhotoChange}>
              <img src={avatarPreview} alt="" className="h-20 w-20 rounded-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 cursor-pointer">
                <Camera size={24} className="text-white" />
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
            <button onClick={handlePhotoChange} className="text-sm font-semibold text-[hsl(var(--ig-blue))]">Change photo</button>
          </div>

          {/* Stats - Big bold like Instagram */}
          <div className="flex justify-around text-center py-3 bg-secondary/40 rounded-xl">
            <div className="flex flex-col items-center">
              <input
                value={posts}
                onChange={(e) => setPosts(e.target.value)}
                className="text-[22px] font-extrabold text-foreground bg-transparent text-center w-[80px] outline-none border-b-2 border-transparent focus:border-[hsl(var(--ig-blue))]"
              />
              <span className="text-[12px] text-muted-foreground mt-0.5">posts</span>
            </div>
            <div className="flex flex-col items-center">
              <input
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
                className="text-[22px] font-extrabold text-foreground bg-transparent text-center w-[120px] outline-none border-b-2 border-transparent focus:border-[hsl(var(--ig-blue))]"
              />
              <span className="text-[12px] text-muted-foreground mt-0.5">followers</span>
              {parseNum(followers) > 0 && (
                <span className="text-[10px] text-muted-foreground">({formatDisplay(parseNum(followers))})</span>
              )}
            </div>
            <div className="flex flex-col items-center">
              <input
                value={following}
                onChange={(e) => setFollowing(e.target.value)}
                className="text-[22px] font-extrabold text-foreground bg-transparent text-center w-[80px] outline-none border-b-2 border-transparent focus:border-[hsl(var(--ig-blue))]"
              />
              <span className="text-[12px] text-muted-foreground mt-0.5">following</span>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Username</label>
              <div className="flex items-center gap-2">
                <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-10 flex-1" />
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting || !username.trim()}
                  className="h-10 px-3 rounded-md bg-[hsl(var(--ig-blue))] text-primary-foreground text-xs font-bold flex items-center gap-1 disabled:opacity-50 shrink-0"
                >
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {connecting ? "..." : "Connect"}
                </button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Verified Badge ✓</label>
                <button
                  onClick={() => setIsVerified(!isVerified)}
                  className={`w-[40px] h-[22px] rounded-full transition-colors ${isVerified ? 'bg-[hsl(var(--ig-blue))]' : 'bg-muted'}`}
                >
                  <div className={`w-[18px] h-[18px] rounded-full bg-white shadow transition-transform mx-[2px] ${isVerified ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bio</label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Website</label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourwebsite.com" className="h-10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Professional dashboard — views (last 30 days)</label>
              <Input value={dashboardViews} onChange={(e) => setDashboardViews(e.target.value)} placeholder="e.g. 98.5M" className="h-10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Story Note</label>
              <Input value={storyNote} onChange={(e) => setStoryNote(e.target.value)} placeholder="e.g. Don't test my patience 💀" className="h-10" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Category (e.g. Public Figure, Dancer)</label>
                <button
                  onClick={() => {
                    const newShow = !showCategory;
                    setShowCategory(newShow);
                    if (!newShow) setCategory("");
                  }}
                  className={`w-[40px] h-[22px] rounded-full transition-colors ${showCategory ? 'bg-[hsl(var(--ig-blue))]' : 'bg-muted'}`}
                >
                  <div className={`w-[18px] h-[18px] rounded-full bg-white shadow transition-transform mx-[2px] ${showCategory ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
              {showCategory && (
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Public Figure" className="h-10" />
              )}
            </div>
            {/* Highlights Toggle */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Show Highlights</label>
                <button
                  onClick={() => onToggleHighlights?.(!showHighlights)}
                  className={`w-[40px] h-[22px] rounded-full transition-colors ${showHighlights ? 'bg-[hsl(var(--ig-blue))]' : 'bg-muted'}`}
                >
                  <div className={`w-[18px] h-[18px] rounded-full bg-white shadow transition-transform mx-[2px] ${showHighlights ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Toggle off to hide highlights from profile</p>
            </div>

            {/* Theme Toggle */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-2">
                  {isDark ? <Moon size={16} className="text-foreground" /> : <Sun size={16} className="text-foreground" />}
                  <label className="text-sm font-medium text-foreground">Dark mode</label>
                </div>
                <button
                  onClick={handleToggleTheme}
                  aria-label="Toggle dark mode"
                  className={`w-[40px] h-[22px] rounded-full transition-colors ${isDark ? 'bg-[hsl(var(--ig-blue))]' : 'bg-muted'}`}
                >
                  <div className={`w-[18px] h-[18px] rounded-full bg-white shadow transition-transform mx-[2px] ${isDark ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Switch between light and dark theme</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;
