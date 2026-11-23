# Backend function rules
- Uploads, activity reports and recovery use the authoritative key server, never a stale local fallback; logout takes the same row lock as login and frees only the caller's slot.
- Payment callback retries are read-only for already-issued keys; requested resends preserve the original delivery timestamp and never renew access.
- Validate device slots with the service-only row-locking RPC; temporary primary/legacy lookup failures must not masquerade as revocation, and validation must never alter purchased terms or evict a licensed device.
- Bound optional public-stat enrichment after paid media completes, so failed public endpoints do not delay a successful clone.
- Schedule best-effort user reporting through the edge runtime's waitUntil, with an awaited fallback; keep payment checks, fulfillment and customer delivery awaited so faster menus cannot acknowledge lost purchases.
- Keep public-bot orders and keys in the external authoritative database; authenticate OxaPay callbacks on raw bytes with HMAC-SHA512, recheck provider amount/currency, and atomically fulfill before acknowledging paid events, so both apps share keys and retries cannot duplicate purchases.
- Return paid buyers to the bare bot link (no start payload) and keep /start silent shortly after a paid order, because the key + APK are delivered by the payment callback and a returned /start must not re-run the welcome.
