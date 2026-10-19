import { describe, expect, it } from "vitest";
import config from "../../vercel.json";

describe("Externally hosted media delivery", () => {
  it("forwards CDN assets before the page fallback", () => {
    expect(config.rewrites[0]).toEqual({
      source: "/__l5e/assets-v1/:path*",
      destination: "https://repo-clone-buddy-16.lovable.app/__l5e/assets-v1/:path*",
    });
    expect(config.rewrites[1].destination).toBe("/index.html");
  });
});