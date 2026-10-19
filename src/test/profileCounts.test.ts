import { describe, expect, it } from "vitest";
import { parseProfileHtml, profileCounts } from "../../supabase/functions/instagram-scraper/profileCounts";

describe("Instagram profile counts", () => {
  it("reads the Whop public profile counts without depending on attribute order", () => {
    const html = `<meta content="Whop (&#064;whop) &#x2022; Instagram" property="og:title"><meta content="207K Followers, 107 Following, 69 Posts - Whop" property="og:description">`;
    expect(parseProfileHtml(html, "whop")).toMatchObject({ followers: 207000, following: 107, postsCount: 69 });
  });
  it("prefers exact embedded counts over rounded share tags", () => {
    const html = `<meta property="og:title" content="Whop (@whop)"><meta property="og:description" content="207K Followers, 107 Following, 69 Posts"><script>{"edge_followed_by": { "count": 207208 }, "edge_follow": { "count": 107 }}</script>`;
    expect(parseProfileHtml(html, "whop")?.followers).toBe(207208);
  });
  it("does not turn missing following into a real zero", () => {
    expect(profileCounts({ data: { user: { follower_count: 207208 } } }).following).toBeUndefined();
  });
  it("retains an explicitly reported zero following count", () => {
    expect(profileCounts({ data: { profile: { followers_count: "207,208", following_count: 0 } } })).toMatchObject({ followers: 207208, following: 0 });
  });
  it("rejects login walls and another account's metadata", () => {
    expect(parseProfileHtml(`<meta property="og:title" content="Instagram">`, "whop")).toBeNull();
    expect(parseProfileHtml(`<meta property="og:title" content="Other (@other)">`, "whop")).toBeNull();
  });
});