import { describe, it, expect } from "vitest";
import { needsInAppStatusBar, formatStatusTime } from "@/lib/statusBarFallback";

const base = { installed: true, fullscreenMode: false, safeTop: 0, screenHeight: 915, innerHeight: 915, portrait: true };
describe("in-app status bar", () => {
  it("shows when the installed app covers the whole screen", () => expect(needsInAppStatusBar(base)).toBe(true));
  it("shows in fullscreen display mode", () => expect(needsInAppStatusBar({ ...base, innerHeight: 800, fullscreenMode: true })).toBe(true));
  it("hides when the phone status bar is visible", () => expect(needsInAppStatusBar({ ...base, innerHeight: 867 })).toBe(false));
  it("hides when content is drawn under a visible bar", () => expect(needsInAppStatusBar({ ...base, safeTop: 24 })).toBe(false));
  it("never shows in a normal browser tab", () => expect(needsInAppStatusBar({ ...base, installed: false })).toBe(false));
  it("formats phone time", () => expect(formatStatusTime(new Date(2026, 0, 1, 16, 5))).toBe("4:05"));
});
