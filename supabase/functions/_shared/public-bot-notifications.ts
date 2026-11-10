export type BotTotals = { users: number; sales: number; revenue: number; instagram: number; tiktok: number };
export type BuyerDetails = { name?: string | null; username?: string | null; key?: string | null; expires_at?: string | null };
type Notification = { kind: 'user' | 'sale'; payload: { chat_id: string; product?: string; plan?: string; amount?: number } };
export function purchaseDuration(plan?: string) {
  return ({ day: '1 day', week: '7 days', month: '30 days', lifetime: 'Lifetime' } as Record<string, string>)[plan ?? ''] ?? 'Unknown';
}
export function notificationText(event: Notification, totals: BotTotals, buyer: BuyerDetails = {}) {
  const heading = event.kind === 'sale'
    ? `💰 Verified sale\n${event.payload.product === 'tiktok' ? 'TikTok' : 'Instagram'} · ${purchaseDuration(event.payload.plan)} · $${Number(event.payload.amount).toFixed(2)} USD`
    : '👤 New bot user';
  const identity = `\nName: ${buyer.name || 'Not available'}\nUsername: ${buyer.username ? '@' + buyer.username : 'Not set'}\nUser ID: ${event.payload.chat_id}`;
  const access = event.kind === 'sale' ? `\n🔑 Key: ${buyer.key || 'Fulfillment pending'}\n📅 Expiry (UTC): ${buyer.key ? (buyer.expires_at || 'Never (Lifetime)') : 'Pending'}` : '';
  return `${heading}${identity}${access}\n\n👥 Total users: ${totals.users}\n🛍 Verified sales: ${totals.sales}\n💵 Total revenue: $${Number(totals.revenue).toFixed(2)} USD\nInstagram: ${totals.instagram} | TikTok: ${totals.tiktok}`;
}
// Dependencies are injected so reporting cannot grant admin privileges.
export async function reportBotEvent(db: any, call: (method: string, body: Record<string, unknown>) => Promise<unknown>, recipient: string | undefined, kind: 'user' | 'sale', id: string, identity?: BuyerDetails) {
  if (!recipient) return;
  try {
    const { error } = await db.rpc('record_public_bot_event', { p_kind: kind, p_id: id });
    if (error) throw new Error('Event save failed');
    if (kind === 'user' && identity) {
      const { error: identityError } = await db.from('public_bot_users').update({ telegram_name: identity.name ?? null, telegram_username: identity.username ?? null }).eq('telegram_chat_id', id);
      if (identityError) throw new Error('Buyer identity save failed');
    }
    const { data: events, error: claimError } = await db.rpc('claim_public_bot_notifications');
    if (claimError) throw new Error('Notification claim failed');
    // One totals snapshot for the claimed batch, rather than one aggregate per event.
    const totalsResult = events?.length ? await db.rpc('public_bot_totals') : null;
    for (const event of events ?? []) {
      try {
        const { data: totals, error: totalsError } = totalsResult ?? { data: null, error: null };
        if (totalsError || !totals) throw new Error('Totals unavailable');
        const { data: user, error: userError } = await db.from('public_bot_users').select('telegram_name,telegram_username').eq('telegram_chat_id', event.payload.chat_id).maybeSingle();
        if (userError) throw new Error('Buyer unavailable');
        const buyer: BuyerDetails = { name: user?.telegram_name, username: user?.telegram_username };
        if (event.kind === 'sale') {
          const { data: order, error: orderError } = await db.from('oxapay_orders').select('product,access_key_id,external_key_code,external_key_expires_at').eq('id', event.payload.order_id).eq('status', 'paid').single();
          if (orderError || !order) throw new Error('Paid order unavailable');
          if (order.product === 'tiktok') {
            buyer.key = order.external_key_code;
            buyer.expires_at = order.external_key_expires_at;
          } else {
            const { data: access, error: accessError } = await db.from('access_keys').select('key,expires_at').eq('id', order.access_key_id).single();
            if (accessError) throw new Error('Access unavailable');
            buyer.key = access?.key;
            buyer.expires_at = access?.expires_at;
          }
          if (!buyer.key) throw new Error('Fulfillment pending');
        }
        await call('sendMessage', { chat_id: recipient, text: notificationText(event, totals, buyer), protect_content: true });
        const { error: saved } = await db.from('public_bot_notifications').update({ delivered_at: new Date().toISOString() }).eq('event_id', event.event_id).eq('claim_token', event.claim_token);
        if (saved) throw new Error('Notification status unavailable');
      } catch {
        await db.from('public_bot_notifications').update({ claimed_at: null, claim_token: null }).eq('event_id', event.event_id).eq('claim_token', event.claim_token);
        console.error('Public bot notification pending');
      }
    }
  } catch { console.error('Public bot reporting unavailable'); }
}