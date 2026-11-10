# Backend function rules
- Schedule best-effort user reporting through the edge runtime's waitUntil, with an awaited fallback; keep payment checks, fulfillment and customer delivery awaited so faster menus cannot acknowledge lost purchases.
- Keep public-bot orders and keys in the external authoritative database; authenticate OxaPay callbacks on raw bytes with HMAC-SHA512, recheck provider amount/currency, and atomically fulfill before acknowledging paid events, so both apps share keys and retries cannot duplicate purchases.
- Return paid buyers to the bare bot link (no start payload) and keep /start silent shortly after a paid order, because the key + APK are delivered by the payment callback and a returned /start must not re-run the welcome.
