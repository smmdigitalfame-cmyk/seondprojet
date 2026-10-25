import { describe, expect, it } from "vitest";
import { isMediaUrlExpired, mediaUrlExpiresAt } from "@/lib/mediaExpiry";
import { savedContentMatchesReels } from "@/lib/insightsContentMedia";

const NOW = Date.UTC(2026, 9, 25, 16, 0, 0);

describe("signed media link expiry", () => {
  it("reads the socialhub exp stamp in milliseconds", () => {
    expect(mediaUrlExpiresAt("https://cdn.socialhubapi.com/media/a.jpg?v=2&exp=1792951200000&sig=x")).toBe(1792951200000);
  });

  it("reads the Instagram oe stamp inside the image proxy link", () => {
    const raw = "https://scontent.cdninstagram.com/v/a.jpg?oe=6AD7E5DB";
    const proxied = `https://x.supabase.co/functions/v1/ig-image-proxy?url=${encodeURIComponent(raw)}`;
    expect(mediaUrlExpiresAt(proxied)).toBe(0x6ad7e5db * 1000);
    expect(isMediaUrlExpired(proxied, NOW)).toBe(true);
  });

  it("treats a link expiring within 10 minutes as expired, and a later one as fine", () => {
    expect(isMediaUrlExpired(`https://cdn.socialhubapi.com/m.jpg?exp=${NOW + 5 * 60_000}`, NOW)).toBe(true);
    expect(isMediaUrlExpired(`https://cdn.socialhubapi.com/m.jpg?exp=${NOW + 60 * 60_000}`, NOW)).toBe(false);
  });

  it("never marks uploaded/permanent links as expired", () => {
    expect(isMediaUrlExpired("https://abc.supabase.co/storage/v1/object/public/reel-media/a.jpg", NOW)).toBe(false);
    expect(isMediaUrlExpired("data:image/jpeg;base64,xx", NOW)).toBe(false);
  });
});

describe("saved Insights rows vs current reels", () => {
  it("rebuilds when most saved rows belong to another clone", () => {
    expect(savedContentMatchesReels([{ sourceId: "old1" }, { sourceId: "old2" }, { sourceId: "a" }], [{ sourceId: "a" }, { sourceId: "b" }])).toBe(false);
  });

  it("keeps saved rows when they match the current reels", () => {
    expect(savedContentMatchesReels([{ sourceId: "a" }, { sourceId: "b" }], [{ sourceId: "b" }, { sourceId: "a" }])).toBe(true);
  });
});
