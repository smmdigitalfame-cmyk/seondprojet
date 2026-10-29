import { describe, expect, it } from "vitest";
import { zylaMedia, zylaPagination } from "../../supabase/functions/instagram-scraper/zylaPagination";

describe("ZylaLabs media", () => {
  it("keeps the nested nextCursor so all video pages remain reachable", () => {
    expect(zylaPagination({ data: { pagination: { hasNextPage: true, nextCursor: "next-page" } } }))
      .toEqual({ cursor: "next-page", hasMore: true });
  });
  it("stops on the provider's final page", () => {
    expect(zylaPagination({ data: { pagination: { hasNextPage: false, nextCursor: "old" } } }).hasMore).toBe(false);
  });
  it("reads reel downloadUrl and thumbnail without requiring mediaList", () => {
    expect(zylaMedia({ downloadUrl: "https://media.example/reel.mp4", thumbnailUrl: "https://media.example/cover.jpg" }, true))
      .toMatchObject({ isVideo: true, videoUrl: "https://media.example/reel.mp4", thumbnail: "https://media.example/cover.jpg" });
  });
});