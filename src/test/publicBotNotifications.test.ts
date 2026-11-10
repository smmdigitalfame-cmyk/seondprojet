import { describe, expect, it, vi } from 'vitest';
import { reportBotEvent, purchaseDuration } from '../../supabase/functions/_shared/public-bot-notifications';
const totals = { users: 5, sales: 2, revenue: 11, instagram: 1, tiktok: 1 };
describe('Notification-only reporting', () => {
 it('sends to the chosen chat without invoking admin actions', async () => {
  const eq = vi.fn().mockReturnThis();
  const chain = { update:vi.fn().mockReturnThis(), select:vi.fn().mockReturnThis(), eq, maybeSingle:vi.fn().mockResolvedValue({ data:{telegram_name:'Buyer',telegram_username:'buyer'} }) };
  eq.mockReturnValue(chain);
  const db = { rpc: vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ data: [{ event_id:'user:123',claim_token:'claim',kind:'user',payload:{chat_id:'123'} }] }).mockResolvedValueOnce({ data:totals }), from:vi.fn().mockReturnValue(chain) };
  const call=vi.fn().mockResolvedValue({});
  await reportBotEvent(db,call,'8766641148','user','123');
  expect(call).toHaveBeenCalledExactlyOnceWith('sendMessage',expect.objectContaining({ chat_id:'8766641148' }));
  expect(db.rpc).toHaveBeenCalledWith('record_public_bot_event',{p_kind:'user',p_id:'123'});
 });
 it.each([['day','1 day'],['week','7 days'],['month','30 days'],['lifetime','Lifetime']])('reports the purchased %s duration', (plan, duration) => {
  expect(purchaseDuration(plan)).toBe(duration);
 });
 it.each(['instagram','tiktok'])('reads only the %s purchased key for the notification', async product => {
  const call=vi.fn().mockResolvedValue({});
  const accesses={instagram:'IG-TEST',tiktok:'TT-TEST'};
  const from=vi.fn((table:string) => {
   const chain:any={update:vi.fn().mockReturnThis(),select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis()};
   chain.maybeSingle=vi.fn().mockResolvedValue({data:{telegram_name:'Ahsan',telegram_username:'buyer'}});
   chain.single=vi.fn().mockResolvedValue({data:table==='oxapay_orders'?{product,access_key_id:'ig-key-id',external_key_code:accesses.tiktok,external_key_expires_at:null}:{key:accesses.instagram,expires_at:'2026-11-09T00:00:00Z'}});
   return chain;
  });
  const db={from,rpc:vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({data:[{event_id:'sale:order',claim_token:'claim',kind:'sale',payload:{chat_id:'123',order_id:'order',product,plan:'day',amount:1}}]}).mockResolvedValueOnce({data:totals})};
  await reportBotEvent(db,call,'8766641148','sale','order');
  expect(call).toHaveBeenCalledWith('sendMessage',expect.objectContaining({chat_id:'8766641148',protect_content:true,text:expect.stringContaining(accesses[product as keyof typeof accesses])}));
  expect(from.mock.calls.some(([table])=>table==='access_keys')).toBe(product==='instagram');
 });
 it('cannot block a purchase if reporting fails', async () => {
  const db={rpc:vi.fn().mockRejectedValue(new Error('offline'))};
  await expect(reportBotEvent(db,vi.fn(),'8766641148','sale','order')).resolves.toBeUndefined();
 });
 it('reads totals once for a batch while delivering every claimed notification', async () => {
  const chain:any={update:vi.fn().mockReturnThis(),select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{telegram_name:'Buyer'}})};
  const events=['123','456'].map(id=>({event_id:`user:${id}`,claim_token:id,kind:'user',payload:{chat_id:id}}));
  const db={from:vi.fn().mockReturnValue(chain),rpc:vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({data:events}).mockResolvedValueOnce({data:totals})};
  const call=vi.fn().mockResolvedValue({});
  await reportBotEvent(db,call,'8766641148','user','123');
  expect(db.rpc.mock.calls.filter(([name])=>name==='public_bot_totals')).toHaveLength(1);
  expect(call).toHaveBeenCalledTimes(2);
 });
});