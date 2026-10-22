# External deployment

Production: https://seondprojet.vercel.app
External project display name: seconig
Existing GitHub repository and Vercel project are unchanged. The Lovable preview is still attached to its managed Cloud project; production is configured separately through Vercel settings.

## Applied setup

- Eight application tables, service-only grants/RLS, indexes, and expiry function were created in the external project.
- The existing legacy-tracking migration was applied after the base schema.
- 52 existing access keys and scraper cache records were copied without changing the source database.
- All 68 existing storage objects were copied into `reel-media`; copied database media references point to the external storage.
- Eleven existing runtime functions were deployed to the external project. Administrative diagnostic and unauthenticated one-shot webhook setup functions were deliberately not deployed.
- Required Telegram and scraper secrets were transferred server-to-server. Management tokens are not runtime secrets in the external project or browser.
- Vercel's three public connection environment variables were updated for production, preview and development, and the existing production project was redeployed.

## External Telegram deployment adjustments

The externally deployed `telegram-webhook` includes two deployment-only adjustments to the repository version:

1. Before parsing a request, reject it with 401 unless its `x-telegram-bot-api-secret-token` header matches the server-only `TELEGRAM_WEBHOOK_SECRET`.
2. Construct payment links using server-only `PAYMENT_PAGE_URL`, set to the existing production app's `/pay` page.

Telegram's webhook registration includes the same server-only secret. Keep these adjustments on subsequent external function deployments; do not redeploy the unauthenticated repository webhook unchanged. No UI or application features were changed.

## Verification performed

- Live Vercel access-key login requested the external project.
- A signed admin webhook `/gen` request created a one-day, two-device key; duration and device count were read back from the external database.
- The real Telegram bot's webhook URL was registered and read back successfully. Admin command tests used authenticated synthetic webhook updates, not messages sent from a human Telegram client.
- Unsigned admin webhook requests were rejected, and public direct access to access keys was denied.
- Live clone of cristiano displayed profile data and media counts.
- A reel caption was edited using the live UI, saved, then read back through its editor after reopening the app.
- Signed `/revoke` requests deactivated QA keys; the live logged-in app returned to login on its visibility/key check.
- A short-expiry QA key logged in, then automatically returned to login at expiry; subsequent validation rejected it.
- A permanent image upload was stored in the external bucket and read back successfully.
- QA keys and the QA image were deleted only from the target. Real keys, old tables and old storage remain intact.

## Existing limitations retained

- Legacy keys still consult the original legacy validation service by design; their original expiry/device rules were never available locally.
- Existing scraper-provider billing/quota limits and expired Instagram CDN URLs were not changed. Some thumbnails may remain unavailable.
- Existing editor persistence includes browser-local storage/IndexedDB; the verified caption save is persistence across reopening in the same browser, not a newly added cross-device sync feature.
- No human-client Telegram inbound message test was performed; webhook registration and authenticated command handlers were verified separately.