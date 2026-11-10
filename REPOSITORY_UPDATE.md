# Old repository update review

Target: `smmdigitalfame-cmyk/seondprojet`, branch `main`.

## Included
- Accept valid Instagram access keys containing 0/1; distinguish expired previous purchases from revoked access.
- Authenticated Telegram webhooks, verified OxaPay order checks and atomic product-specific fulfillment.
- Instagram/TikTok menus, matching tutorials/APK delivery, recovery, notifications and admin text broadcast.
- Cache-only Home feed; retain the existing public showcase instead of disclosing other buyers' searches.
- Apply the same six-call / sixty-item ZylaLabs search budget to direct external credentials and connector credentials; capped searches do not advertise paid continuation.
- Existing small-screen header corrections and Instagram maskable install icon.
- Deployment scripts, payment upgrade history and protected manual deployment workflows.
- Explicit Vercel install/build/output defaults; payment callback routing is derived from the deployment's public backend URL.

## Preserved
- Existing generated connection/client files, environment files, package manifest/locks, APK signing association and existing customer data.
- Unchanged editors, saved media and dashboard persistence.
- No customer keys, provider credentials, source archives or workspace metadata are added.

## Release boundaries
Source tests do not apply database upgrades or deploy edge functions. The existing backend deployment must retain its authoritative database and matching Telegram webhook secrets. The deployment workflow requires protected settings and an initialized database; it deliberately does not seed a new empty target.

GitHub publication does not prove a Vercel deployment, a new paid purchase, installed-phone behavior, a 10K-user broadcast or the separate TikTok issuer. Those checks remain separate.