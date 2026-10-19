const decode = (text: string): string => text
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)));

export function countNumber(value: unknown): number | undefined {
  if (value && typeof value === "object") return countNumber((value as { count?: unknown }).count);
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  if (typeof value !== "string") return undefined;
  const match = value.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return undefined;
  const multiplier = ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[(match[2] || "").toUpperCase()] || 1;
  return Math.round(Number(match[1]) * multiplier);
}

export function profileCounts(raw: any): { followers?: number; following?: number; postsCount?: number } {
  const user = raw?.data?.user ?? raw?.data?.profile ?? raw?.user ?? raw?.profile ?? raw?.data ?? raw;
  const first = (...values: unknown[]) => values.map(countNumber).find((value) => value !== undefined);
  return {
    followers: first(user?.edge_followed_by, user?.follower_count, user?.followers_count, user?.followers, user?.followerCount),
    following: first(user?.edge_follow, user?.following_count, user?.followings_count, user?.following, user?.followingCount),
    postsCount: first(user?.edge_owner_to_timeline_media, user?.media_count, user?.post_count, user?.postsCount, user?.posts),
  };
}

export function parseProfileHtml(html: string, username: string) {
  const meta = (name: string): string => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attributes: Record<string, string> = {};
      for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) attributes[match[1].toLowerCase()] = decode(match[3]);
      if (attributes.property === name || attributes.name === name) return attributes.content || "";
    }
    return "";
  };
  const title = meta("og:title");
  if (!title.toLowerCase().includes(`(@${username.toLowerCase()})`)) return null;
  const description = meta("og:description") || meta("description");
  const metric = (label: string) => countNumber(description.match(new RegExp(`([\\d.,]+\\s*[KMB]?)\\s+${label}\\b`, "i"))?.[1]);
  // Exact embedded counts are preferred; share-tag shorthand is rounded, not exact.
  const decoded = decode(html).replace(/\\"/g, '"');
  const embedded = (field: string) => countNumber(decoded.match(new RegExp(`"${field}"\\s*:\\s*\\{\\s*"count"\\s*:\\s*(\\d+)`))?.[1]);
  return {
    username,
    fullName: title.split(/\s*\(@/)[0] || "",
    avatarUrl: meta("og:image"),
    followers: embedded("edge_followed_by") ?? metric("Followers?"),
    following: embedded("edge_follow") ?? metric("Following"),
    postsCount: embedded("edge_owner_to_timeline_media") ?? metric("Posts?"),
  };
}