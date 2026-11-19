import { paymentDb, botCall, deliverOrder } from './public-payments.ts';
import { PUBLIC_PLANS } from './public-payment-plans.ts';
import { PRODUCTS, parsePurchase } from './public-products.ts';
import { BOT_HOME, BOT_BOTTOM_MENU } from './public-bot-menu.ts';
import { BINANCE_PAY_ID, binanceSignature, eligibleTransaction, parseTransactionId, type PayTransaction } from './binance-wallet-policy.ts';
import { reportBotEvent } from './public-bot-notifications.ts';
const say = (chat: string, text: string, reply_markup?: unknown) => botCall('sendMessage', { chat_id: chat, text, ...(reply_markup ? { reply_markup } : {}) });
const check = (error: unknown) => { if (error) throw new Error('Subscription storage unavailable'); };
const admins = () => Array.from(new Set(['TELEGRAM_ADMIN_CHAT_ID_1','TELEGRAM_ADMIN_CHAT_ID_2','TELEGRAM_ADMIN_CHAT_ID_3'].map(n=>Deno.env.get(n)).filter((v): v is string=>Boolean(v))));
async function receipts(): Promise<PayTransaction[]> {
 const key=Deno.env.get('BINANCE_API_KEY'), secret=Deno.env.get('BINANCE_API_SECRET');
 if (!key || !secret) throw new Error('Verification unavailable');
 const query=new URLSearchParams({limit:'100',timestamp:String(Date.now()),recvWindow:'10000'}).toString();
 const response=await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${query}&signature=${await binanceSignature(query,secret)}`,{headers:{'X-MBX-APIKEY':key},signal:AbortSignal.timeout(15000)});
 const data=await response.json(); if(!response.ok || data.code!=='000000' || !Array.isArray(data.data)) throw new Error('Verification unavailable'); return data.data;
}
export async function verifyBinanceSubscription(chat: string,id: string) {
 const db=paymentDb();
 const {data:o,error}=await db.from('oxapay_orders').select('*').eq('id',id).eq('telegram_chat_id',chat).eq('payment_provider','binance').maybeSingle(); check(error); if(!o) return;
 if(o.status==='paid' && o.payment_verified_at){await deliverOrder(id); return;}
 const {data:c,error:ce}=await db.from('binance_checkouts').select('*').eq('order_id',id).single(); check(ce); if(!c || c.status==='rejected') return;
 let tx: PayTransaction | undefined;
 let matched: PayTransaction | undefined;
 try {const list=await receipts();tx=list.find(t=>eligibleTransaction(t,c.submitted_id,Number(o.amount),c.created_at));matched=tx ?? list.find(t=>t.orderId===c.submitted_id||t.transactionId===c.submitted_id);}catch { /* Never mint on provider failure. */ }
 if(tx){
  const aliases=Array.from(new Set([c.submitted_id,tx.orderId,tx.transactionId].filter((v): v is string=>typeof v==='string' && Boolean(v))));
  const {error:fe}=await db.rpc('fulfill_binance_subscription',{p_order_id:id,p_aliases:aliases,p_amount:Number(tx.amount),p_verified:true});
  if(!fe){await deliverOrder(id);await reportBotEvent(db,botCall,Deno.env.get('PUBLIC_BOT_NOTIFICATION_CHAT_ID'),'sale',id);return;}
 }
 const {data:changed,error:re}=await db.from('binance_checkouts').update({status:'review'}).eq('order_id',id).eq('status','pending').select('order_id');check(re);
 await say(chat,matched ? `⏳ Binance shows ${matched.amount} ${matched.currency ?? ''} for this transaction, but this plan costs ${Number(o.amount)} USDT. Contact @TheDanielBrooks with your receipt; do not pay again.` : '⏳ Payment verification pending. Your selected subscription is reserved; do not pay again.',{inline_keyboard:[[{text:'🔄 Check payment',callback_data:`binance:check:${id}`}],[{text:'💬 Contact owner',url:'https://t.me/TheDanielBrooks'}]]});
 if(changed?.length) for(const admin of admins()) await say(admin,`Binance subscription · Review required\n${PRODUCTS[o.product as keyof typeof PRODUCTS].title} · ${o.plan_id}\nUser: ${chat}\nOrder: ${id}\nTransaction: ${c.submitted_id}`,{inline_keyboard:[[{text:'Recheck receipt',callback_data:`binance:review:${id}`},{text:'Reject',callback_data:`binance:reject:${id}`}]]}).catch(()=>undefined);
}
export async function handleBinanceSubscription(chat:string,updateId:number,text?:string,action?:string):Promise<boolean>{
 const db=paymentDb();
 if(text==='/wallet'||text==='/addfunds'||text==='💰 Wallet'||text==='➕ Add Funds'||action?.startsWith('wallet:')){await botCall('sendMessage',{chat_id:chat,...BOT_HOME});await say(chat,'Choose your app and subscription.',BOT_BOTTOM_MENU);return true;}
 if(action?.startsWith('binance:review:')||action?.startsWith('binance:reject:')){
  if(!admins().includes(chat)) return true;
  const id=action.split(':')[2];if(!/^[a-f0-9-]{36}$/.test(id))return true;
  const {data:o}=await db.from('oxapay_orders').select('telegram_chat_id,status').eq('id',id).eq('payment_provider','binance').maybeSingle();if(!o||o.status==='paid')return true;
  if(action.startsWith('binance:review:'))await verifyBinanceSubscription(o.telegram_chat_id,id);
  else {const {error}=await db.from('binance_checkouts').update({status:'rejected'}).eq('order_id',id).in('status',['pending','review']);check(error);await say(o.telegram_chat_id,'Payment receipt could not be approved. Contact @TheDanielBrooks for help.');}return true;
 }
 if(action?.startsWith('binance:check:')){const id=action.split(':')[2];if(/^[a-f0-9-]{36}$/.test(id))await verifyBinanceSubscription(chat,id);return true;}
 if(action?.startsWith('pay:binance:')){
  const p=parsePurchase(action.replace('pay:binance:','buy:'));if(!p)return true;const plan=PUBLIC_PLANS[p.plan];
  const {data:existing,error:ee}=await db.from('oxapay_orders').select('*').eq('telegram_update_id',updateId).maybeSingle();check(ee);
  let o=existing;
  if(!o){const {data,error}=await db.from('oxapay_orders').insert({telegram_chat_id:chat,telegram_update_id:updateId,product:p.product,plan_id:p.plan,amount:plan.amount,currency:'USD',duration_days:plan.days,payment_provider:'binance'}).select('*').single();check(error);o=data;}
  if(!o||o.telegram_chat_id!==chat||o.product!==p.product||o.plan_id!==p.plan||o.payment_provider!=='binance')throw new Error('Order conflict');
  const {data:old,error:oe}=await db.from('binance_checkouts').select('*').eq('order_id',o.id).maybeSingle();check(oe);let c=old;
  if(!c){const {data,error}=await db.from('binance_checkouts').insert({order_id:o.id,payment_usdt:plan.amount}).select('*').single();check(error);c=data;}
  if(!c)throw new Error('Unable to create Binance checkout');
  if(!o.track_id){const {error}=await db.from('oxapay_orders').update({track_id:`binance:${o.id}`}).eq('id',o.id).is('track_id',null);check(error);}
  await say(chat,`💳 Binance Pay\n${PRODUCTS[p.product].title} · ${plan.title}\n\nSend: ${plan.amount} USDT\nBinance Pay ID: ${BINANCE_PAY_ID}\n\nAfter payment, tap “Submit transaction ID”. Your matching APK + access key will arrive after verification.`,{inline_keyboard:[[{text:'📋 Copy Pay ID',copy_text:{text:BINANCE_PAY_ID}},{text:'📋 Copy amount',copy_text:{text:String(plan.amount)}}],[{text:'✅ Submit transaction ID',callback_data:`binance:submit:${o.id}`}],[{text:'⬅️ Choose payment method',callback_data:`buy:${p.product}:${p.plan}`}]]});return true;
 }
 if(action?.startsWith('binance:submit:')){
  const id=action.split(':')[2];if(!/^[a-f0-9-]{36}$/.test(id))return true;
  const {data:o}=await db.from('oxapay_orders').select('id').eq('id',id).eq('telegram_chat_id',chat).eq('payment_provider','binance').maybeSingle();if(!o)return true;
  const {error}=await db.from('bot_wallet_sessions').upsert({telegram_chat_id:chat,step:'transaction',request_id:id});check(error);await say(chat,'Send the Binance Order ID / Transaction ID for this subscription payment.');return true;
 }
 if(!text||text.startsWith('/')&&text!=='/cancel')return false;
 const {data:s,error}=await db.from('bot_wallet_sessions').select('*').eq('telegram_chat_id',chat).maybeSingle();check(error);if(!s)return false;
 const {data:o}=await db.from('oxapay_orders').select('id').eq('id',s.request_id).eq('telegram_chat_id',chat).eq('payment_provider','binance').maybeSingle();
 if(text==='/cancel'||!o){await db.from('bot_wallet_sessions').delete().eq('telegram_chat_id',chat);await botCall('sendMessage',{chat_id:chat,...BOT_HOME});return true;}
 const receipt=parseTransactionId(text);if(!receipt){await say(chat,'Send a valid Binance transaction ID.');return true;}
 const {error:se}=await db.from('binance_checkouts').update({submitted_id:receipt,status:'pending'}).eq('order_id',o.id).in('status',['pending','review']);check(se);await verifyBinanceSubscription(chat,o.id);
 await db.from('bot_wallet_sessions').delete().eq('telegram_chat_id',chat).eq('request_id',o.id);return true;
}
