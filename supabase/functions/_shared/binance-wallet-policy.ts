export const BINANCE_PAY_ID = '1213988983';
export function parseTransactionId(text: string) {
  const value = text.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
export type PayTransaction = { orderId?: string; transactionId?: string; currency?: string; amount?: string; transactionTime?: number; orderType?: string; payerInfo?: { binanceId?: string | number }; receiverInfo?: { binanceId?: string | number } };
// Plans are priced in USD and paid in USDT: the received USDT amount is compared
// directly with the plan price (99% tolerance), with no INR conversion.
// Buyers often pay first and open the bot order afterwards; one-claim-per-receipt
// is the ownership guard, so receipts up to this long before the order are accepted.
export const RECEIPT_GRACE_MS = 24 * 60 * 60 * 1000;
export function eligibleTransaction(tx: PayTransaction, id: string, planUsd: number, createdAt: string) {
  const amount = Number(tx.amount);
  return (tx.orderId === id || tx.transactionId === id) && tx.currency === 'USDT' &&
    Number.isFinite(amount) && amount > 0 && amount >= planUsd * 0.99 &&
    String(tx.receiverInfo?.binanceId ?? '') === BINANCE_PAY_ID && String(tx.payerInfo?.binanceId ?? '') !== BINANCE_PAY_ID &&
    tx.orderType === 'C2C' && Number.isFinite(tx.transactionTime) &&
    Number(tx.transactionTime) >= Date.parse(createdAt) - RECEIPT_GRACE_MS;
}
export async function binanceSignature(query: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(query)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
