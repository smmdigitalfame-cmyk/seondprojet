import { useEffect, useState } from "react";
import { formatStatusTime, needsInAppStatusBar } from "@/lib/statusBarFallback";

function readSafeTop(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

function detect(): boolean {
  const html = document.documentElement;
  return needsInAppStatusBar({
    installed: html.classList.contains("ios-standalone"),
    fullscreenMode: window.matchMedia("(display-mode: fullscreen)").matches,
    safeTop: readSafeTop(),
    screenHeight: window.screen.height,
    innerHeight: window.innerHeight,
    portrait: window.innerHeight >= window.innerWidth,
  });
}

type Battery = { level: number; charging: boolean };

/** Phone-style time / network / battery bar, shown only when the phone hides its own. */
export default function InAppStatusBar() {
  const [show, setShow] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [battery, setBattery] = useState<Battery | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => {
      const on = detect();
      setShow(on);
      document.documentElement.classList.toggle("app-statusbar", on);
    };
    update();
    const t = setTimeout(update, 800);
    window.addEventListener("resize", update);
    return () => { clearTimeout(t); window.removeEventListener("resize", update); };
  }, []);

  useEffect(() => {
    if (!show) return;
    const tick = setInterval(() => setNow(new Date()), 15_000);
    const net = () => setOnline(navigator.onLine);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    let bat: any;
    const readBat = () => bat && setBattery({ level: bat.level, charging: bat.charging });
    (navigator as any).getBattery?.().then((b: any) => {
      bat = b; readBat();
      b.addEventListener("levelchange", readBat);
      b.addEventListener("chargingchange", readBat);
    }).catch(() => {});
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
      if (bat) { bat.removeEventListener("levelchange", readBat); bat.removeEventListener("chargingchange", readBat); }
    };
  }, [show]);

  if (!show) return null;
  const pct = battery ? Math.round(battery.level * 100) : null;
  return (
    <div
      aria-hidden
      className="fixed left-0 right-0 top-0 z-[2147483647] flex h-[26px] items-center justify-between px-5 text-[13px] font-semibold"
      style={{ top: 0, background: "#000", color: "#fff", pointerEvents: "none" }}
    >
      <span className="tabular-nums">{formatStatusTime(now)}</span>
      <span className="flex items-center gap-1.5">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" opacity={online ? 1 : 0.35}>
          <rect x="0" y="8" width="3" height="4" rx="0.5" /><rect x="4.3" y="5.5" width="3" height="6.5" rx="0.5" />
          <rect x="8.6" y="3" width="3" height="9" rx="0.5" /><rect x="12.9" y="0" width="3" height="12" rx="0.5" />
        </svg>
        {pct !== null && <span className="tabular-nums text-[12px]">{pct}%</span>}
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
          <rect x="0.5" y="0.5" width="18" height="10" rx="2.5" stroke="currentColor" opacity="0.6" />
          <rect x="19.5" y="3.5" width="2" height="4" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="2" y="2" width={Math.max(1, 15 * ((pct ?? 100) / 100))} height="7" rx="1.5" fill={battery?.charging ? "#34c759" : "currentColor"} />
        </svg>
      </span>
    </div>
  );
}
