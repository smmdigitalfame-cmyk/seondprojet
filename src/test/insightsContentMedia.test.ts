import { describe, expect, it } from "vitest";
import { refillContentMedia } from "@/lib/insightsContentMedia";

describe("Insights content media recovery", () => {
  it("replaces an expired thumbnail and restores the video without losing edited stats", () => {
    const [item] = refillContentMedia(
      [{ sourceId: "a", thumbnail: "expired.jpg", likes: 432 }],
      [{ sourceId: "a", thumbnail: "fresh.jpg", videoUrl: "reel.mp4" }],
    );
    expect(item.thumbnail).toBe("fresh.jpg");
    expect(item.videoUrl).toBe("reel.mp4");
    expect(item.likes).toBe(432);
  });

  it("keeps the matching reel's media after the list is reordered", () => {
    const [item] = refillContentMedia(
      [{ sourceId: "a", thumbnail: "" }],
      [{ sourceId: "b", thumbnail: "b.jpg" }, { sourceId: "a", thumbnail: "a.jpg" }],
    );
    expect(item.thumbnail).toBe("a.jpg");
  });

  it("refills older saved rows that have no media identity", () => {
    const [item] = refillContentMedia(
      [{ thumbnail: "", views: 231100 }],
      [{ sourceId: "a", videoUrl: "reel.mp4" }],
    );
    expect(item.sourceId).toBe("a");
    expect(item.videoUrl).toBe("reel.mp4");
    expect(item.views).toBe(231100);
  });
});