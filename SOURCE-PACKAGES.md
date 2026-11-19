# Separate Instagram and TikTok source handoffs

Drive `vps-backups/deployment-packages/latest-code` contains two private ZIPs:
`Instagram-complete-source.zip` and `TikTok-complete-source.zip`.
Each includes `START-HERE.md`, a SHA-256 file manifest, source and deployment instructions.
These are source packages, not database or secret exports. Never make this folder public.

Instagram contains this editor's source, administrator bot, central Instagram/TikTok
sales bot, payment verification, key delivery, scraper, migrations and protected
deployment workflows. The central sales bot remains in Instagram; deploying TikTok
must not register that bot a second time.

TikTok contains the separate `smmdigitalfame-cmyk/finalproject` source, its own
key issuer, Telegram administration handlers, migrations and integration guide.
It is not the unrelated TikTok Video Lister project. VPS compiled files are kept
by the existing VPS backups; they are not substituted for editable source here.

## AI deployment instruction

Read `START-HERE.md`, the manifest and deployment guides before changing anything.
Inspect ZIP paths before extraction. Use separate app directories and domains.
Preserve existing customer data, key expiry/revocation, payments and websites.
Request all credentials privately. Keep browser settings public-only; bot/payment
credentials stay server-side. Do not move any Telegram webhook until authorized.
Do not manufacture payments or issue buyer keys before verified payment.
Test actual licensed login, saved edits, receipt replay protection and the intended
product's APK/key delivery. Report anything not verified.

## Refresh

The VPS package-only job polls the Instagram repository's `drive-source-backup`
branch and the TikTok repository's `main` branch every five minutes and
uploads changed packages plus a daily snapshot. It does not deploy or restart apps.
This project's GitHub workflow transfers the current checkout on a main-branch push
to the same private package staging directory on the VPS, then refreshes Drive.
GitHub-to-VPS automation requires repository secrets `VPS_USER` and `VPS_PASSWORD`
and variable `VPS_HOST_KEY` containing the verified SSH host key line.
The Instagram backup branch preserves the current editor without triggering the
old repository's production deployments. Future main-branch updates in this
connected project transfer directly through the backup workflow when its secure
repository settings are configured; the old production main branch is unchanged.
Updates not committed/synced to these sources are not automatically captured.
On a new server, provision rclone's `gdrive` remote privately; a ZIP does not include it.

Existing VPS backup jobs are retained. New source snapshots have separate 14-day
retention under `deployment-packages/history`; `latest-code` is never purged.
The current migrations do not bootstrap a complete new Instagram database:
restore the authoritative private schema/data/storage first, or retain that backend.