# Project architecture rules

- Persist reel edits by stable `sourceId`, using the list index only as a fallback, so cloned-media reordering cannot move edits to another reel.
- Only close media editors after permanent storage succeeds; temporary blob/base64 uploads must never be reported as saved.
- Persist section image replacements in reel overrides and the reel snapshot, updating the displayed image only after upload and override persistence succeed, so refreshes retain the replacement.
- Render reel thumbnails through `VideoThumbnail` when a video URL exists so failed image URLs can fall back to a video frame.
- Persist the Professional Dashboard overview curve in its own lightweight scoped record, then merge it over the full dashboard snapshot on load, so media-heavy caches cannot block graph saves.
- Preserve null graph points outside a user's drawn stroke so partial-width curves remain partial after saving.- Rewrite the dashboard overview-graph record on every Insights save, and flush pending edits on unmount, so the graph record merged over the snapshot never restores stale values.
- Never apply a saved reel override by list index when it carries a different `sourceId`, and never let a saved zero public metric replace a real scraped count, so stale edits cannot show 0 views on cloned reels.
- Mirror the reel list and reel edit overrides to IndexedDB, hydrate them before first render, and re-apply overrides by `sourceId` inside `loadReelsData`, so edits survive refreshes, full localStorage, and re-clones.
- Mirror the Professional Dashboard snapshot to IndexedDB and never store content-list thumbnails in it (refill from the reel list), so 350-reel dashboards can still be saved when localStorage is full.
- Bundle the login tutorial with WebM first and MP4 fallback, so it plays reliably across desktop and mobile browsers.
- Serve the downloadable 4K tutorial through Lovable Assets, so large media stays off the app bundle and downloads quickly.
- Cache finished scraper payloads in the `ig_scrape_cache` table and serve them stale-while-revalidate, so app opens and repeat clones never wait on slow providers.
- Requests with `pages: 1` use the scraper's quick mode (no slow enrichers, trimmed items); clones show the quick result first and replace it with the full list in the background.
- Store the connected account's avatar as a small data URL, because signed CDN avatar links expire and appear broken.
- Keys imported from the previous backend are flagged `legacy`; the old backend stays the source of truth for their expiry, revocation and extra device slots (rechecked periodically), because their plan details were never copied over.
