# LARPFY purchase integration assessment

## Inspected source

- Repository: https://github.com/s4chizshit-sketch/larpfy
- Snapshot: `d9a426bad2ae5c9e58a3c928b3453e6c133fab67`
- React/TypeScript with TanStack Start; existing email/password accounts, billing, plans and purchase history.
- Instagram, TikTok and Shopify presentations already exist. Preserve them; the current bot only supports Instagram and TikTok fulfillment. Do not silently map Shopify to either product.

## Current behavior

- `src/lib/oxapay.functions.ts` already creates OxaPay invoices using server-held merchant credentials and a database-derived order price.
- `src/routes/api/public/oxapay-webhook.ts` already checks callback HMAC and records a paid purchase in the website database.
- `src/components/app/ProSubscription.tsx` still asks buyers to send a payment screenshot on Telegram. It does not deliver an APK or access key on the website.
- The website's verified account ID is available, but no verified Telegram ownership binding exists. A typed chat ID or screenshot is not proof of ownership.
- Existing website settlement is not the bot's provider-rechecked atomic key fulfillment path. Merely adding the merchant secret will not connect the two systems.

## Intended implementation

1. Keep the existing website layout and signed-in purchase flow.
2. Add a server-validated, expiring, one-use Telegram account-link challenge, consumed only by the existing authenticated private-chat bot webhook. Never accept a browser-provided chat ID as identity.
3. Create website purchases in the existing authoritative bot database, with website owner, purchase channel and owner-scoped checkout idempotency. Do not fabricate Telegram update IDs.
4. Use the existing merchant account, exact product/plan terms, provider recheck, immutable purchase terms and atomic fulfillment. Keep existing bot checkout return/delivery unchanged.
5. Authorize each website status/receipt read against the verified buyer. Show pending/fulfillment-pending states until the existing verified fulfillment path produces the matching key. A payment return URL never proves payment.
6. Replace screenshot instructions with a copyable key, expiry and matching APK download. Host approved APK files securely or provide an authenticated server download; Telegram file IDs are not browser download URLs and bot tokens must never reach buyers.
7. Test unpaid/forged/mismatched payment rejection, cross-owner reads, linking replay, retry-safe key issuance and both product mappings. Audit the independent TikTok mint handler before claiming full TikTok enforcement.
8. Document server-only settings and validate live checkout-to-receipt after deployment. A real paid end-to-end check requires an actual purchase; do not manufacture a paid order.

## Access blocker

The GitHub connection named `ahsanus705705@gmail.com` authenticates as `just4abhiii`. The repository API reports read permission but no push permission. Re-selecting that same connection did not establish repository write access. The repository owner must grant the connected account write access (and the credential must cover this repository), or authorize a connection with access to `s4chizshit-sketch/larpfy`.

No LARPFY source, live website, merchant setting or bot webhook was changed during assessment. Current project source was not replaced with the separate website.