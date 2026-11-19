# Telegram Binance Pay subscriptions

Buyer flow: **Choose Instagram/TikTok → choose 1 day / 7 days / monthly / lifetime → Binance Pay or Crypto (OxaPay)**. No wallet, Add Funds or typed rupee amount is offered.

Existing plan prices apply to both methods: $1 / $5 / $10 / $25. Binance checkout displays the plain plan price in USDT, Pay ID 1213988983, copy buttons, and Submit transaction ID. Only server-side read-only credentials from this receiving account are used. Trading/Withdraw must remain off. The retired Pay ID 1183631033 belongs to another website; receipts sent there are rejected here to prevent cross-site claims.

Server lookup verifies incoming USDT, the current recipient, timestamp and plan-price coverage. A service-only transaction locks the purchase, claims both receipt aliases (including checking old wallet claims), verifies fixed product/plan terms and issues Instagram access atomically. TikTok continues through its existing separate remote issuance. Existing matching APK/key/how-to delivery and purchase recovery are reused. Failed or unmatched receipts never issue keys; protected admins can recheck or reject them, without bypassing receipt verification.

Apply migrations 0007, 0008 and 0010 before deploying the public webhook; retain existing wallet records and webhook URL. The new buyer flow does not credit or debit wallets. Binance verification reads the latest 100 transactions; older receipts may remain pending. Real paid end-to-end verification requires a genuine payment and must not be inferred from API, unit or rolled-back database tests.

## Plan-price payments
Buyers send the plain plan price in USDT (1, 5, 10 or 25). Verification compares the USDT Binance actually received with the plan price (99% tolerance); there is no INR conversion and no unique fractional amount. Each Order ID / Transaction ID can be claimed by only one purchase; the first valid claim wins.
