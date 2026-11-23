export type ScreenState = {
  installed: boolean;
  fullscreenMode: boolean;
  safeTop: number;
  screenHeight: number;
  innerHeight: number;
  portrait: boolean;
};

/**
 * True when an installed app is drawn over the whole screen with no phone
 * status bar (immersive APK). Then the app shows its own time/battery bar.
 */
export function needsInAppStatusBar(s: ScreenState): boolean {
  if (!s.installed) return false;
  if (s.fullscreenMode) return true;
  if (!s.portrait || s.safeTop > 0) return false;
  return s.screenHeight - s.innerHeight < 12;
}

export function formatStatusTime(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}`;
}
