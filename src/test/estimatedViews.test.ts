import { describe, it, expect } from "vitest";
import { estimateViews, fillEstimatedViews } from "@/lib/estimatedViews";

describe("estimated views", () => {
  it("estimates around 10K and stays stable per reel", () => {
    const v = estimateViews("abc123");
    expect(v).toBeGreaterThanOrEqual(8000);
    expect(v).toBeLessThan(13000);
    expect(estimateViews("abc123")).toBe(v);
  });
  it("fills reels with 0 views", () => {
    const r = fillEstimatedViews<{ sourceId: string; viewsEstimated?: boolean; insights: any }>({ sourceId: "x", insights: { views: 0, likes: 0 } }, 0);
    expect(r.insights.views).toBeGreaterThanOrEqual(8000);
    expect(r.viewsEstimated).toBe(true);
  });
  it("keeps real or edited views", () => {
    const r = fillEstimatedViews({ sourceId: "x", insights: { views: 405023 } }, 0);
    expect(r.insights.views).toBe(405023);
  });
});
