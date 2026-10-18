---
name: Payment key auto-delivery rule
description: On Razorpay payment.captured both user (telegram chat_id) and all admin chat_ids must receive the access key in a tap-to-copy <code> format. If notes are missing, resolve buyer by recently saved payment phone/email and support /claim fallback.
type: feature
---
Rule: when `razorpay-webhook` processes `payment.captured`:
1. Generate key + insert into `access_keys` with `telegram_chat_id` resolved from BOTH `payment.notes` and `order.notes` (Razorpay Payment Buttons store notes on the order, not the payment). If Razorpay drops notes, match `payment.contact` / `payment.email` against recent `payment_user_links` saved from the payment page.
2. Send the key to the buyer's telegram chat in a `<code>` block (tap-to-copy) with expiry + plan.
3. Send the same key to EVERY admin in `TELEGRAM_ADMIN_CHAT_ID_1`, `TELEGRAM_ADMIN_CHAT_ID_2`, and comma-split `TELEGRAM_CHAT_ID` — key on its own line at the top, with `userSent` status, payment phone/email, `/claim <payment_id>` user fallback, and `/deliver <payment_id> <chat_id>` admin fallback when user delivery failed.
4. Log everything to `webhook_logs` including the raw event payload for debugging.
5. Telegram users can send `/claim <payment_id>` to link an unlinked paid key to their chat and receive it once. Never block on admin delivery failure; user delivery is the priority.