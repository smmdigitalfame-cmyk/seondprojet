import { describe, expect, it } from "vitest";
import { applySavedOverridesToReels, mergeAndSaveOverride } from "@/lib/reelsDataStore";

const reel = (sourceId: string, views: number, thumbnail = "https://scontent.cdninstagram.com/new.jpg") =>
  ({ sourceId, thumbnail, caption: "orig", insights: { views, likes: 0, comments: 0, viewsOverTime: [] } }) as any;

describe("saved reel edits survive a re-clone", () => {
  it("restores edited engagement axis percentages by reel identity", async () => {
    await mergeAndSaveOverride("engagement-axis", 0, { engagementYTop: 30, engagementYCenter: 15 }, "engagement-a");
    const restored = applySavedOverridesToReels([reel("other", 5), reel("engagement-a", 10)], "engagement-axis");
    expect(restored[1].engagementYTop).toBe(30);
    expect(restored[1].engagementYCenter).toBe(15);
    expect(restored[0].engagementYTop).toBeUndefined();
  });
  it("re-applies edits by sourceId after the list order changes", async () => {
    await mergeAndSaveOverride("persist", 0, { caption: "edited A", likes: 777, thumbnail: "https://scontent.cdninstagram.com/old.jpg" }, "a");
    await mergeAndSaveOverride("persist", 1, { caption: "edited B", thumbnail: "https://res.cloudinary.com/x/b.jpg" }, "b");
    const recloned = [reel("new", 5), reel("b", 10), reel("a", 900000)];
    const out = applySavedOverridesToReels(recloned, "persist");
    expect(out[0].caption).toBe("orig");
    expect(out[2].caption).toBe("edited A");
    expect(out[2].insights.likes).toBe(777);
    expect(out[2].insights.views).toBe(900000);
    // stale scraped URL never replaces fresh media; user uploads do
    expect(out[2].thumbnail).toBe("https://scontent.cdninstagram.com/new.jpg");
    expect(out[1].thumbnail).toBe("https://res.cloudinary.com/x/b.jpg");
  });
});
