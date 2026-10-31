# Project architecture rules
- Use the linked ZylaLabs connection for primary profile/posts/reels reads and preserve both nested pagination cursors in a provider-tagged continuation, so quick clones and later pages use the same source without exposing credentials.
- Treat empty or failed scraper-provider responses as temporary unavailability, not proof of a missing/private Instagram account, so upstream outages cannot mislabel valid usernames.
- Proxy Lovable Assets paths through an explicit Vercel rewrite before the SPA fallback, so relative CDN pointers remain portable without changing backend settings or duplicating media.
- Parse public Instagram profile metadata independently of attribute order and retry transient login walls; distinguish missing profile counts from explicitly reported zero and never cache failed zero-follower enrichment as a complete profile.
- Generate the app-shell worker with vite-plugin-pwa and register only through registerAppWorker; deny dev, preview and iframe registration, use network-first HTML, and never cache OAuth or API calls so installs cannot bypass fresh login checks.
- Publish Android Digital Asset Links only with user-supplied package/signing credentials and serve them as JSON through Vercel headers; website association verification does not replace APK device verification.

- The existing Vercel deployment uses the external database while the Lovable preview remains managed Cloud; configure Vercel environment variables rather than editing generated client files, so future preview changes cannot silently reverse the production connection.
- External Telegram deployments must validate `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET` and use `PAYMENT_PAGE_URL` for payment links, so admin commands cannot be forged and links remain on the intended deployment.

- Persist reel edits by stable `sourceId`, using the list index only as a fallback, so cloned-media reordering cannot move edits to another reel.
- Only close media editors after permanent storage succeeds; temporary blob/base64 uploads must never be reported as saved.
- Persist section image replacements in reel overrides and the reel snapshot, updating the displayed image only after upload and override persistence succeed, so refreshes retain the replacement.
- Render reel thumbnails through `VideoThumbnail` when a video URL exists so failed image URLs can fall back to a video frame.
- Refill Insights Content media from current reels by sourceId (index only for legacy rows), keeping transient media out of saved dashboard snapshots so expired thumbnails cannot override refreshed media.
- Persist the Professional Dashboard overview curve in its own lightweight scoped record, then merge it over the full dashboard snapshot on load, so media-heavy caches cannot block graph saves.
- Preserve null graph points outside a user's drawn stroke so partial-width curves remain partial after saving.- Rewrite the dashboard overview-graph record on every Insights save, and flush pending edits on unmount, so the graph record merged over the snapshot never restores stale values.
- Never apply a saved reel override by list index when it carries a different `sourceId`, and never let a saved zero public metric replace a real scraped count, so stale edits cannot show 0 views on cloned reels.
- Mirror the reel list and reel edit overrides to IndexedDB, hydrate them before first render, and re-apply overrides by `sourceId` inside `loadReelsData`, so edits survive refreshes, full localStorage, and re-clones.
- Mirror the Professional Dashboard snapshot to IndexedDB and never store content-list thumbnails in it (refill from the reel list), so 350-reel dashboards can still be saved when localStorage is full.
- Bundle the login tutorial with WebM first and MP4 fallback, so it plays reliably across desktop and mobile browsers.
- Serve the downloadable 4K tutorial through Lovable Assets, so large media stays off the app bundle and downloads quickly.
- Cache finished scraper payloads in the `ig_scrape_cache` table and serve them stale-while-revalidate, so app opens and repeat clones never wait on slow providers.
- Paid scraper calls happen only on a user search/clone (one request per search): `pages: 1` requests are cache-only, the Home feed never fetches, and there are no background, retry or app-open refreshes, because provider calls are billed.
- Store the connected account's avatar as a small data URL, because signed CDN avatar links expire and appear broken.
- Keys imported from the previous backend are flagged `legacy`; the old backend stays the source of truth for their expiry, revocation and extra device slots (rechecked periodically), because their plan details were never copied over.
- Detect signed media expiry (`exp`/`oe` stamps) on stored reels and in scraper cache payloads; refresh only media links by `sourceId` and never serve expired cached payloads, so cloned thumbnails do not turn into "No preview" hours later.
- Backfill ZylaLabs items' missing views/likes/comments by shortcode from Instagram's public profile JSON (latest posts only), because ZylaLabs never reports view counts.
- Fill missing cloned-reel views with a stable per-sourceId estimate (~10K, flagged `viewsEstimated`) that real scraped views or user edits replace, because some providers never report views.
