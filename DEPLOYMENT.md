# GitHub deployment guide

## What deploys where

The app is a Vite static website. Vercel/Netlify/Pages serve `dist`; Telegram, payment verification, key checks, scraping and storage use the external backend. Entering Telegram/OxaPay credentials only in Vercel will **not** deploy backend functions. GitHub Actions deploys those separately.

The existing Vercel app and Lovable preview use different backends. Preserve that separation. The generated browser client reads build-time public environment values; do not commit an edited client to change targets.

## Recommended: relocate the website, retain the backend

1. Import the connected GitHub repository into the new host.
2. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` for the existing external backend.
3. On Vercel select Vite, output `dist`, install `bun install --frozen-lockfile`, build `node scripts/prepare-hosting.mjs && bun run build`.
4. Keep `/__l5e/assets-v1/*` proxied to the existing asset origin before the SPA fallback. Optional `ASSET_PROXY_ORIGIN` changes that origin during route preparation, but it does not copy assets.
5. Verify key login, expiry, revoke, image save and refresh. Changing just the frontend host does not require moving Telegram webhooks or reissuing access keys.

Vercel's repository integration handles later frontend deployments. Optional **Actions → Deploy Vercel** also supports a manually approved deploy with the settings below.

## Backend automation setup

GitHub → repository Settings → Environments → create **production**. Add required reviewers and restrict deployment branches. Add secrets/variables to this environment, not source files. These values are not transferred from Lovable to GitHub automatically.

### Required encrypted secrets

| Secret | Purpose |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Management access to your own external backend; deployment only |
| `PUBLIC_TELEGRAM_BOT_TOKEN` | Public sales bot token from BotFather |
| `PUBLIC_TELEGRAM_WEBHOOK_SECRET` | Same secret stored in the webhook handler and sent when registering Telegram |
| `OXAPAY_MERCHANT_API_KEY` | Merchant API key from OxaPay |

### Required variable

`SUPABASE_PROJECT_REF`: the initialized external backend target. It is not a password. It must match the frontend settings when moving the whole deployment.

### Optional encrypted runtime secrets

- `TELEGRAM_BOT_TOKEN`: separate administrator bot; never reuse the public bot token.
- `TELEGRAM_WEBHOOK_SECRET`: existing admin bot webhook secret. If omitted, the code and deployment script derive the same secret from the admin bot token.
- `BOT_INTERNAL_SECRET`: existing shared secret also configured on the independent TikTok key service.
- `ZYLALABS_API_KEY`: direct provider credential for external hosting.
- `RAPIDAPI_LOOTER_KEY`, `RAPIDAPI_KEY`: optional scraper fallback credentials.
- `UDC_ZYLALABS_INSTAGRAM_MEDIA_API_KEY`, `LOVABLE_API_KEY`: only when keeping an already-linked, authorized Lovable connector connection. Do not substitute a direct provider key for a connector key; direct external deployments can use `ZYLALABS_API_KEY` instead.
- `RAZORPAY_WEBHOOK_SECRET`: if retaining the older Razorpay payment flow.

### Optional variables

| Variable | Meaning |
|---|---|
| `PUBLIC_BOT_NOTIFICATION_CHAT_ID` | Notification-only recipient; current requirement is `8766641148` |
| `TELEGRAM_ADMIN_CHAT_ID_1`, `_2`, `_3` | Existing allowlisted admin chats; do not grant notification recipients admin rights |
| `PAYMENT_PAGE_URL` | Your website's `/pay` URL for the legacy/admin bot |
| `OXAPAY_CALLBACK_URL` | Explicit authoritative callback override; otherwise invoices use the backend the function runs on |
| `TIKTOK_KEY_ENDPOINT` | HTTPS endpoint of the independent TikTok issuer; existing endpoint remains default |
| `RAPIDAPI_LOOTER_HOST`, `RAPIDAPI_HOST` | Matching scraper provider hosts |

Backend platform-provided `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are available to functions automatically. Never transfer a privileged key to Vercel `VITE_*` values. Do not request/export a managed Cloud privileged key; use your own external backend for this workflow.

### Run the backend workflow

Actions → **Deploy backend** → Run workflow:

- **Apply payment upgrades**: runs committed security upgrades numbered 0005 onward only on an initialized database. Each upgrade is recorded and checksum-checked. It does not replay the old base/incremental setup or seed customers.
- **Register webhooks**: explicit opt-in because Telegram allows only one webhook per bot; this moves incoming messages from the old deployment. Functions deploy first, secrets are stored server-side, registration is read back, and unsigned requests are tested.

The script deploys an explicit runtime list, not every folder. Public diagnostics, `telegram-test`, `setup-webhook-oneshot` and admin inspection endpoints are excluded. Management credentials are never sent as runtime secrets. Missing settings are rejected before deployment; logs do not print credentials or provider response bodies.

The workflow is manual and production-approved to avoid silently redirecting a working bot on every push. Once settings are entered, deployment steps run automatically after approval.

## Optional Vercel deployment from Actions

Add encrypted `VERCEL_TOKEN`, plus variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, and optionally `ASSET_PROXY_ORIGIN` to `production`. Also set these public connection values in the Vercel project's production environment. Run **Deploy Vercel**. This does not create a Vercel account/project or configure domains for you.

## Moving to a new empty backend

**Not a one-click clean install yet:** current migration history starts by altering an existing `access_keys` table. A complete base schema was provisioned separately. Automation deliberately fails if required existing tables/functions are absent.

1. Export a complete private backup from the authoritative external database: application schema, permissions, RLS, functions and data. Keep it outside GitHub.
2. Restore it into the new external backend, including payment orders, access keys and their verification stamps. Never fabricate paid flags to migrate customers.
3. Copy storage objects and bucket configuration (`reel-media`), and update stored media references where necessary. GitHub does not contain customer uploads. Telegram document file IDs belong to the original bot; changing bots requires uploading matching APKs and updating their file IDs.
4. Configure auth/redirect URLs and provider subscriptions. Preserve legacy-key validation dependencies and the independent TikTok service.
5. Run the backend deployment workflow, then deploy the frontend against the same target.
6. Keep old callback endpoints operational for invoices created before the move. New invoices use the new callback. Existing invoice IDs must remain resolvable in their authoritative database.
7. Only move Telegram registration once the checks below pass. Never delete the old database/storage during relocation.

## Required release checks

- Unsigned Telegram/admin/payment requests return 401.
- A real unpaid invoice's Check payment action does not generate a key.
- A real successful purchase delivers exactly one matching product key/APK; callback replay does not mint another key.
- Login, expiry, revoke and device limits work in the new frontend and installed APK.
- A reel edit and uploaded image survive reopen/refresh; media and asset proxy URLs load.
- Provider calls happen only on user search; no app-open/background paid refresh.
- Check tutorial links, Telegram APK file IDs and bot return link.
- Review independent TikTok issuer's payment authorization in its own repository.
- Check auth signup/sign-in settings on the target; source/config defaults do not establish hosted settings.

## Rollback

Keep the previous Vercel deployment and backend available. Redeploy the previous known-good frontend, and restore the prior webhook URL **with its matching secret** only after confirming that backend remains healthy. Do not reverse schema upgrades by deleting customer/payment records. Applied migration checksums must remain unchanged; corrective changes belong in new migrations.

## Scope and limitations

The repository automation has focused tests and safety guards, but a brand-new target restoration and GitHub-hosted workflow run still need verification. The agent cannot inspect Git sync status or configure GitHub environment secrets through Git sync. Confirm the latest README/workflows appear in the connected repository; never paste private tokens into issues, README files or chat.