/**
 * Instagram media links are signed and stop working after a few hours.
 * Read the expiry stamp from a link (also when it is wrapped in our image proxy)
 * so expired thumbnails/videos can be refreshed instead of showing "No preview".
 */
export function mediaUrlExpiresAt(url?: string | null): number | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    let parsed = new URL(url);
    if (parsed.pathname.includes("ig-image-proxy")) {
      const inner = parsed.searchParams.get("url");
      if (!inner) return null;
      parsed = new URL(inner);
    }
    // socialhubapi: exp=<milliseconds>
    const exp = parsed.searchParams.get("exp");
    if (exp && /^\d{12,14}$/.test(exp)) return Number(exp);
    // Instagram CDN: oe=<hex seconds>
    const oe = parsed.searchParams.get("oe");
    if (oe && /^[0-9a-f]{8}$/i.test(oe)) return parseInt(oe, 16) * 1000;
  } catch {
    return null;
  }
  return null;
}

/** True when the link carries an expiry stamp that has passed (or will within `marginMs`). */
export function isMediaUrlExpired(url?: string | null, now = Date.now(), marginMs = 10 * 60_000): boolean {
  const at = mediaUrlExpiresAt(url);
  return at !== null && at - marginMs <= now;
}
