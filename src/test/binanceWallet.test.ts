import { describe, expect, it } from 'vitest';
import { BINANCE_PAY_ID, eligibleTransaction, binanceSignature, RECEIPT_GRACE_MS } from '../../supabase/functions/_shared/binance-wallet-policy';
const created = '2026-11-11T02:31:00Z';
const tx = { orderId: 'order1', transactionId: 'tx1', currency: 'USDT', amount: '1', transactionTime: Date.parse(created)+1000, orderType: 'C2C', receiverInfo: { binanceId: '1213988983' }, payerInfo: { } };
describe('Binance receipt rules', () => {
  it('uses the specified Pay ID', () => { expect(BINANCE_PAY_ID).toBe('1213988983'); expect(eligibleTransaction(tx,'tx1',1,created)).toBe(true); });
  it('rejects receipts sent to the retired cross-site Pay ID', () => { expect(eligibleTransaction({...tx,receiverInfo:{binanceId:'1183631033'}},'tx1',1,created)).toBe(false); expect(eligibleTransaction({...tx,receiverInfo:{binanceId:1183631033}},'tx1',1,created)).toBe(false); });
  it('matches either provider ID', () => { expect(eligibleTransaction(tx,'order1',1,created)).toBe(true); expect(eligibleTransaction(tx,'tx1',1,created)).toBe(true); expect(eligibleTransaction(tx,'other',1,created)).toBe(false); });
  it('accepts numeric Binance recipient IDs and a different identified payer', () => { expect(eligibleTransaction({...tx,receiverInfo:{binanceId:1213988983},payerInfo:{binanceId:1234567890}},'order1',1,created)).toBe(true); expect(eligibleTransaction({...tx,receiverInfo:{binanceId:1213988983},payerInfo:{binanceId:1213988983}},'order1',1,created)).toBe(false); });
  it('requires positive USDT and 99% coverage', () => { expect(eligibleTransaction({...tx,amount:'.99'},'tx1',1,created)).toBe(true); for(const amount of ['.989','0','-1']) expect(eligibleTransaction({...tx,amount},'tx1',1,created)).toBe(false); expect(eligibleTransaction({...tx,currency:'BTC'},'tx1',1,created)).toBe(false); });
  it('rejects outgoing and older receipts', () => { expect(eligibleTransaction({...tx,payerInfo:{binanceId:BINANCE_PAY_ID}},'tx1',1,created)).toBe(false); expect(eligibleTransaction({...tx,transactionTime:Date.parse(created)-RECEIPT_GRACE_MS-1},'tx1',1,created)).toBe(false); });
  it('accepts a receipt paid shortly before the bot order was created', () => { expect(eligibleTransaction({...tx,transactionTime:Date.parse(created)-10*60*1000},'tx1',1,created)).toBe(true); });
  it('signs using HMAC SHA256 hex with a public test vector', async () => { expect(await binanceSignature('The quick brown fox jumps over the lazy dog','key')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'); });
});
