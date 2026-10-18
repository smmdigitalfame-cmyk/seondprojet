import { Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { currentUser } from "@/data/mockData";
import { useRef, useCallback, useState } from "react";
import { useActiveUsernameVersion } from "@/hooks/useActiveUsernameVersion";

// Reels icon — vector traced from the uploaded reference PNG
const ReelsIcon = ({ size = 26 }: { size?: number; active?: boolean }) => (
  <svg width={size} height={size} viewBox="285 165 230 230" aria-hidden="true">
    <g transform="translate(0,540) scale(0.1,-0.1)" fill="currentColor" stroke="currentColor" strokeWidth="60" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3475 3719 c-178 -26 -343 -175 -390 -354 -21 -82 -22 -1012 -1 -1090 42 -159 164 -286 326 -341 84 -29 1079 -29 1183 0 159 43 290 179 326 337 6 27 11 246 11 550 0 480 -1 510 -20 572 -53 173 -204 300 -385 327 -85 12 -965 11 -1050 -1z m1080 -114 c113 -30 200 -107 250 -223 19 -44 20 -73 23 -527 4 -595 -1 -631 -116 -736 -104 -96 -88 -94 -707 -94 -623 0 -611 -2 -718 103 -114 110 -119 144 -115 732 3 451 4 467 25 518 42 104 134 188 242 223 79 25 1021 28 1116 4z" />
      <path d="M3705 3266 c-91 -42 -95 -61 -95 -459 0 -393 1 -397 90 -445 81 -43 101 -35 427 156 294 173 318 192 333 255 23 106 -3 131 -345 338 -250 150 -274 163 -325 166 -33 2 -67 -2 -85 -11z m375 -254 c256 -156 275 -169 278 -198 4 -40 9 -37 -292 -213 -291 -170 -291 -170 -329 -141 -27 21 -27 21 -27 351 0 454 -25 440 370 201z" />
    </g>
  </svg>
);

// Instagram Messenger/DM icon — vector traced from the uploaded reference PNG
const MessengerIcon = ({ size = 26 }: { size?: number; active?: boolean }) => (
  <svg width={size} height={size} viewBox="285 165 230 230" aria-hidden="true">
    <g transform="translate(0,540) scale(0.1,-0.1)" fill="currentColor" stroke="currentColor" strokeWidth="60" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3260 3611 c-138 -42 -213 -187 -155 -301 9 -19 130 -146 269 -281 l251 -246 94 -383 c61 -246 102 -393 116 -413 60 -90 208 -105 289 -29 34 33 39 40 330 511 128 207 289 464 356 571 179 284 174 273 174 350 0 106 -53 179 -155 215 -46 16 -1517 22 -1569 6z m1555 -118 c35 -19 57 -50 62 -90 4 -35 -7 -57 -157 -298 -89 -143 -268 -431 -397 -640 -294 -476 -273 -447 -330 -443 -36 2 -50 9 -64 28 -15 21 -195 729 -187 735 2 1 166 91 366 200 377 205 404 225 384 270 -24 51 -34 47 -429 -169 l-377 -205 -225 218 c-124 121 -234 228 -244 239 -42 47 -14 136 50 157 43 15 1521 12 1548 -2z" />
    </g>
  </svg>
);

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isReelsPage = location.pathname === "/reels";
  const isReelDetail = location.pathname.startsWith("/reel/");
  useActiveUsernameVersion(); // re-render when the profile photo changes
  const [avatarFailed, setAvatarFailed] = useState<string | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const msgLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgLongPressTriggered = useRef(false);
  const [msgCount, setMsgCount] = useState(() => {
    const saved = localStorage.getItem("msg-badge-count");
    return saved !== null ? Number(saved) : 0;
  });

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    const isDark = html.classList.contains("dark");
    html.classList.toggle("dark", !isDark);
    localStorage.setItem("theme", isDark ? "light" : "dark");
  }, []);

  // Hide bottom nav on reel detail page
  if (isReelDetail) return null;

  const tabs = [
    { path: "/", key: "home" },
    { path: "/reels", key: "reels" },
    { path: "/create", key: "create" },
    { path: "/search", key: "search" },
    { path: "/profile", key: "profile" },
  ];

  return (
    <nav className={cn(
      "fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-200",
      isReelsPage
        ? "border-t border-white/10 bg-black/90"
        : "bg-background/95"
    )}>
      <div className="mx-auto flex max-w-lg items-center justify-around py-1">
        {tabs.map(({ path, key }) => {
          const isActive = location.pathname === path;
          const color = isActive
            ? isReelsPage ? "text-white" : "text-foreground"
            : isReelsPage ? "text-white/60" : "text-foreground";

          return (
            <motion.button
              key={path}
              whileTap={{ scale: 0.82 }}
              onClick={() => {
                if (key === "search" && longPressTriggered.current) return;
                if (key === "create" && msgLongPressTriggered.current) return;
                navigate(path);
              }}
              onPointerDown={key === "search" ? () => {
                longPressTriggered.current = false;
                longPressRef.current = setTimeout(() => {
                  longPressTriggered.current = true;
                  toggleTheme();
                }, 2000);
              } : key === "create" ? () => {
                msgLongPressTriggered.current = false;
                msgLongPressRef.current = setTimeout(() => {
                  msgLongPressTriggered.current = true;
                  const newCount = prompt("Enter message count:", String(msgCount));
                  if (newCount !== null && !isNaN(Number(newCount))) {
                    setMsgCount(Number(newCount));
                    localStorage.setItem("msg-badge-count", newCount);
                  }
                }, 2000);
              } : undefined}
              onPointerUp={key === "search" ? () => { if (longPressRef.current) clearTimeout(longPressRef.current); } : key === "create" ? () => { if (msgLongPressRef.current) clearTimeout(msgLongPressRef.current); } : undefined}
              onPointerLeave={key === "search" ? () => { if (longPressRef.current) clearTimeout(longPressRef.current); } : key === "create" ? () => { if (msgLongPressRef.current) clearTimeout(msgLongPressRef.current); } : undefined}
              className={cn("flex items-center justify-center p-2 transition-colors duration-150", color)}
              aria-label={key}
            >
              {key === "home" && (
                isActive ? (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M5 21a2 2 0 01-2-2v-7.59a2 2 0 01.65-1.48L11.3 3.7a1 1 0 011.4 0l7.65 6.23a2 2 0 01.65 1.48V19a2 2 0 01-2 2h-4a1 1 0 01-1-1v-4.5a2 2 0 00-4 0V20a1 1 0 01-1 1H5z" />
                  </svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 21a1 1 0 01-1-1V11.4L12 4.5L20 11.4V20a1 1 0 01-1 1h-4v-6.5a2 2 0 00-2-2h-2a2 2 0 00-2 2V21H5z" fill="hsl(var(--background))" />
                  </svg>
                )
              )}
              {key === "reels" && (
                <ReelsIcon size={26} active={isActive} />
              )}
              {key === "create" && (
                <div className="relative">
                  <MessengerIcon size={26} active={isActive} />
                  {msgCount > 0 && <span className="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(var(--ig-like))] px-1 text-[11px] font-bold text-white">{msgCount}</span>}
                </div>
              )}
              {key === "search" && (
                <Search size={26} strokeWidth={isActive ? 2.2 : 1.8} />
              )}
              {key === "profile" && (
                <div className="relative">
                  <div className={cn(
                    "h-[26px] w-[26px] rounded-full overflow-hidden transition-all duration-200",
                    isActive
                      ? isReelsPage ? "ring-[1.5px] ring-white" : "ring-[1.5px] ring-foreground"
                      : ""
                  )}>
                    {currentUser.avatar && avatarFailed !== currentUser.avatar ? (
                      <img
                        src={currentUser.avatar}
                        alt="Profile"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={() => setAvatarFailed(currentUser.avatar)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[11px] font-semibold text-muted-foreground">
                        {(currentUser.username || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="absolute -right-0.5 bottom-0 h-[8px] w-[8px] rounded-full bg-[hsl(var(--ig-like))] border border-background" />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;