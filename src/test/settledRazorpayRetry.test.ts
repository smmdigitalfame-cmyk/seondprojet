import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { legacyPlanFromAmount, legacySourcePlanMatchesAmount, purchasedExpiry } from '../../supabase/functions/_shared/legacy-plan-terms';
describe('settled Razorpay callbacks remain read-only',()=>{
  it('a valid callback retry cannot append devices, change ownership, consume links or redeliver',async()=>{
    const original={key:'TEST-SETTLED',device_fingerprints:['phone-a'],telegram_chat_id:'original-owner',expires_at:'2026-12-23T12:00:00Z'};
    const from=vi.fn().mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:original,error:null})})})});
    const fetcher=vi.fn();let handler:((req:Request)=>Promise<Response>)|undefined;
    const deno={env:{get:(name:string)=>name==='RAZORPAY_WEBHOOK_SECRET'?'test-only-secret':'test-only'},serve:(fn:typeof handler)=>{handler=fn;}};
    const rawSource=readFileSync('supabase/functions/razorpay-webhook/index.ts','utf8').replace(/^import .*;\n/gm,'');
    const js=ts.transpileModule(rawSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
    new Function('Deno','createClient','crypto','Response','fetch','planFromAmount','legacySourcePlanMatchesAmount','purchasedExpiry',js)(deno,()=>({from}),webcrypto,Response,fetcher,legacyPlanFromAmount,legacySourcePlanMatchesAmount,purchasedExpiry);
    const body=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'test-settled-payment',amount:10000,notes:{device_fp:'phone-b',telegram_chat_id:'different-owner',service_code:'MUJCLONE_KEY_2026'}}}}});
    const signing=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('test-only-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Buffer.from(await webcrypto.subtle.sign('HMAC',signing,new TextEncoder().encode(body))).toString('hex');
    if(!handler) throw new Error('Webhook not initialized');
    const response=await handler(new Request('https://example.test/callback',{method:'POST',body,headers:{'x-razorpay-signature':signature}}));
    expect(await response.json()).toEqual({ok:true,duplicate:true});
    expect(from).toHaveBeenCalledTimes(1);expect(from).toHaveBeenCalledWith('access_keys');expect(fetcher).not.toHaveBeenCalled();
    expect(original.device_fingerprints).toEqual(['phone-a']);expect(original.telegram_chat_id).toBe('original-owner');
  });
});