import { describe, expect, it, vi } from 'vitest';
import '../lib/abortTimeoutPolyfill';
import { checkPrimaryDevice, proxyPrimaryKeyRequest } from '../../supabase/functions/_shared/key-authority';
describe('one authoritative license check for upload, reporting and recovery', () => {
  it('a failed primary lookup is unavailable, not revocation or a local fallback', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    const license = await checkPrimaryDevice('TEST','phone-a',request);
    expect(license).toMatchObject({ ok: false, status: 503, code: 'verification_unavailable' });
    expect((await proxyPrimaryKeyRequest('logout-device','{}',false,request))?.status).toBe(503);
  });
  it('a revoked primary key cannot be rescued by a stale local row', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ valid: false, code: 'deactivated' }),{ status: 403 }));
    expect(await checkPrimaryDevice('TEST','phone-a',request)).toMatchObject({ ok: false, code: 'deactivated', status: 403 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('never accepts a malformed successful response as a valid key', async () => {
    expect(await checkPrimaryDevice('TEST','phone-a',vi.fn().mockResolvedValue(new Response('{}')))).toMatchObject({ ok: false, status: 503 });
  });
  it('keeps the confirmed paid expiry in the successful result', async () => {
    const expiry='2026-12-23T12:00:00Z';
    expect(await checkPrimaryDevice('TEST','phone-a',vi.fn().mockResolvedValue(new Response(JSON.stringify({valid:true,expires_at:expiry}))))).toMatchObject({ ok:true,expiresAt:Date.parse(expiry) });
  });
  it('recovery forwards a primary denial unchanged instead of returning a local key', async () => {
    const result=await proxyPrimaryKeyRequest('tg-get-key','{}',false,vi.fn().mockResolvedValue(new Response('{"found":false}',{status:401})));
    expect(result?.status).toBe(401);
    expect(await result?.json()).toEqual({found:false});
  });
});