interface ReelMedia {
  sourceId?: string;
  thumbnail?: string;
  videoUrl?: string;
}

/**
 * Saved Insights rows belong to the clone they were saved from. When most of
 * their media identities are not in the current reel list (account re-cloned
 * or switched), they can never get a thumbnail back, so the caller should
 * rebuild the list from the current reels instead.
 */
export function savedContentMatchesReels(items: ReelMedia[], reels: ReelMedia[]): boolean {
  if (!reels.length) return true;
  const withId = items.filter((item) => item.sourceId);
  if (!withId.length) return true;
  const ids = new Set(reels.map((reel) => reel.sourceId).filter(Boolean));
  const matched = withId.filter((item) => ids.has(item.sourceId)).length;
  return matched * 2 >= withId.length;
}

/** Refill transient media from the current reel, without disturbing saved stats. */
export function refillContentMedia<T extends ReelMedia>(items: T[], reels: ReelMedia[]): (T & ReelMedia)[] {
  const byId = new Map(reels.filter((reel) => reel.sourceId).map((reel) => [reel.sourceId, reel]));
  return items.map((item, index) => {
    const reel = item.sourceId ? byId.get(item.sourceId) : reels[index];
    return {
      ...item,
      sourceId: item.sourceId || reel?.sourceId,
      thumbnail: reel?.thumbnail || item.thumbnail || "",
      videoUrl: reel?.videoUrl || item.videoUrl,
    };
  });
}
