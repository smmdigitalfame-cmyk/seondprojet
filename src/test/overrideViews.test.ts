import { describe, it, expect, beforeEach } from "vitest";
import { applyOverrideToReel, getOverrideSync, mergeAndSaveOverride } from "@/lib/reelsDataStore";

const reel = (sourceId: string, views: number) => ({ sourceId, thumbnail: "t", caption: "", insights: { views, likes: 10, comments: 1 } } as any);

describe("reel overrides keep real views", () => {
  beforeEach(() => localStorage.clear());
  it("stale zero override does not hide real views", () => {
    expect(applyOverrideToReel(reel("a", 900000), { views: 0 }).insights.views).toBe(900000);
    expect(applyOverrideToReel(reel("a", 900000), { views: 1200000 }).insights.views).toBe(1200000);
  });
  it("another reel's override is not applied by index", async () => {
    await mergeAndSaveOverride("acc", 0, { caption: "B", views: 0 }, "b");
    expect(getOverrideSync("acc", 0, "a")).toBeNull();
    await mergeAndSaveOverride("acc", 0, { caption: "A" }, "a");
    expect(getOverrideSync("acc", 0, "a")?.caption).toBe("A");
    expect(getOverrideSync("acc", 5, "b")?.caption).toBe("B");
  });
});
