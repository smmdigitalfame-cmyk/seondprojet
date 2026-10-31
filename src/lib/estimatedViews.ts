// Some providers never report reel views. Rather than showing "0" on every
// cloned reel, fill a stable estimate around 10K that users can edit later.

const hash = (seed: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Stable estimate between 8,000 and 12,999, never below ~8x the likes. */
export const estimateViews = (seed: string, likes = 0): number => {
  const base = 8000 + (hash(seed || "reel") % 5000);
  const fromLikes = likes > 0 ? Math.round(likes * 8) : 0;
  return Math.max(base, fromLikes);
};

/** Fill missing views (0) with an estimate; real or edited counts are kept. */
export const fillEstimatedViews = <T extends { sourceId?: string; viewsEstimated?: boolean; insights: any }>(
  reel: T,
  index: number,
): T => {
  const ins = reel.insights || {};
  if (Number(ins.views) > 0) return reel;
  const views = estimateViews(reel.sourceId || `idx-${index}`, Number(ins.likes) || 0);
  return {
    ...reel,
    viewsEstimated: true,
    insights: {
      ...ins,
      views,
      accountsReached: Number(ins.accountsReached) > 0 ? ins.accountsReached : views,
    },
  };
};
