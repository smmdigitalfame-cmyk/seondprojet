import { describe, expect, it } from "vitest";
import config from "../../vercel.json";

describe("Externally hosted media delivery", () => {
  it("forwards CDN assets before the page fallback", () => {
    const assetIndex = config.rewrites.findIndex(rule => rule.source === "/__l5e/assets-v1/:path*");
    const fallbackIndex = config.rewrites.findIndex(rule => rule.destination === "/index.html");
    expect(assetIndex).toBeGreaterThanOrEqual(0);
    expect(config.rewrites[assetIndex]).toEqual({
      source: "/__l5e/assets-v1/:path*",
      destination: "https://repo-clone-buddy-16.lovable.app/__l5e/assets-v1/:path*",
    });
    expect(fallbackIndex).toBeGreaterThan(assetIndex);
  });
});