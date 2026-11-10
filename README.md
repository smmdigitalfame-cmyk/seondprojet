# Insights Editor

Mobile-first insights editing app with key-based access, persistent reel/dashboard edits, a PWA and a Telegram purchase bot.

**Bot:** https://t.me/Insightseditorall_bot · **Website:** https://organicsmm.online

Edited metrics are presentation data: they do not change real Instagram/TikTok views, engagement or earnings. This project is not affiliated with Instagram, Meta or TikTok.

## Deploy from GitHub

1. Import this repository into Vercel (or another static host).
2. Set the three **public** connection settings listed below. Never put bot/payment tokens in `VITE_*` settings.
3. Reuse the existing external backend, or restore its complete database and storage into your own backend first.
4. Configure the GitHub `production` environment with the credentials in [DEPLOYMENT.md](DEPLOYMENT.md).
5. Run **Actions → Deploy backend**. It securely transfers runtime settings, deploys an explicit function list, and checks that unsigned payment/bot requests are rejected.
6. Optionally approve webhook registration to move the bots to the new backend. Existing invoices and old access keys require migration planning; do not delete the old backend.

**Important:** GitHub contains source, not customer data, storage files or private credentials. A new empty database cannot be created from the current incremental migration history alone. The deployment job stops if the base database has not been restored. Vercel alone hosts the frontend; it does not run the Telegram/payment functions.

### Frontend settings

| Setting | Value source |
|---|---|
| `VITE_SUPABASE_URL` | Your external backend API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The backend's public/publishable key, never its privileged key |
| `VITE_SUPABASE_PROJECT_ID` | The same backend's project reference |

Vercel: framework **Vite**, install `bun install --frozen-lockfile`, output **dist**, build `node scripts/prepare-hosting.mjs && bun run build`. The preparation command updates only callback/asset routing in the deployment checkout. Keep the SPA fallback and asset proxy before it.

For Netlify, Cloudflare Pages or another static host, use the same install/build/output settings but configure their own SPA and asset-proxy rules. The backend remains on its supported edge-function platform.

## Local development

```sh
bun install --frozen-lockfile
bun run dev
bun run test
```

Use `.env.local` for **public frontend settings only**; keep it out of Git. Never edit generated backend client files to switch production settings. Local server: `http://localhost:8080`.

## Purchase security

- Instagram/TikTok product selection precedes plan selection.
- Plans: 1 day $1, 7 days $5, 30 days $10, lifetime $25.
- OxaPay callbacks authenticate the exact raw bytes with HMAC-SHA512.
- Server-side provider recheck requires a paid invoice with matching order ID, track, currency, amount and plan duration.
- Atomic database fulfillment, verification stamps and immutable order terms protect purchased-key issuance; public roles cannot run mint functions.
- Admin commands require authenticated Telegram webhooks and allowlisted private-chat senders. Admin issuance is separate from purchased access.
- TikTok keys are issued by a separate service; its independent payment enforcement needs review in that repository.

## Repository layout

| Path | Purpose |
|---|---|
| `src/` | App, editors and focused tests |
| `supabase/functions/` | Backend function source and shared payment helpers |
| `drizzle/migrations/` | Incremental schema history (not a complete empty-database baseline) |
| `scripts/` | Secret-safe backend deployment and frontend route preparation |
| `.github/workflows/` | Manually approved deployment automation |
| `DEPLOYMENT.md` | Settings inventory, relocation steps, safety checks and rollback |
| `EXTERNAL_DEPLOYMENT.md` | Existing production deployment history |
| `PWABUILDER_SETUP.md` | Android/PWA packaging and signing guidance |

## Before sharing the repository

Keep the repository private if it contains operational configuration. Check GitHub's tracked files: do not upload `.env`, `.env.local`, private keys, keystores, customer database exports or provider tokens. Public publishable keys may be present; privileged credentials must not be. The platform owns `.gitignore`, so review ignore rules through your repository settings/local checkout rather than assuming they protect every environment file.

## Verification limits

Focused payment and deployment tests are included. A fresh-host deployment, real paid checkout, installed-phone login and independent TikTok key-server audit are not proven by a successful workflow alone. Follow the checklist in the deployment guide before routing customers to a new host.
