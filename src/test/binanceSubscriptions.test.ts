import { describe,it,expect } from 'vitest';
import { PUBLIC_PLANS } from '../../supabase/functions/_shared/public-payment-plans';
import { parsePurchase } from '../../supabase/functions/_shared/public-products';
import { eligibleTransaction } from '../../supabase/functions/_shared/binance-wallet-policy';
describe('Direct Binance subscriptions',()=>{
 it.each([['day',1,1],['week',5,7],['month',10,30],['lifetime',25,null]])('preserves %s terms',(id,price,days)=>{
  const plan=PUBLIC_PLANS[id as keyof typeof PUBLIC_PLANS];expect(plan.amount).toBe(price);expect(plan.days).toBe(days);
 });
 it.each(['instagram','tiktok'])('binds checkout to %s product',product=>{expect(parsePurchase(`buy:${product}:week`)).toEqual({product,plan:'week'});});
 const tx=(amount:string)=>({orderId:'receipt',amount,currency:'USDT',transactionTime:2000,orderType:'C2C',receiverInfo:{binanceId:'1213988983'}});
 const at=new Date(1000).toISOString();
 it.each([[1,'1'],[5,'5'],[10,'10'],[25,'25']])('accepts a plain %s USDT payment for its plan',(price,amount)=>{expect(eligibleTransaction(tx(amount),'receipt',price,at)).toBe(true);});
 it('rejects a payment below the plan price',()=>{expect(eligibleTransaction(tx('1'),'receipt',5,at)).toBe(false);expect(eligibleTransaction(tx('9'),'receipt',10,at)).toBe(false);});
});
