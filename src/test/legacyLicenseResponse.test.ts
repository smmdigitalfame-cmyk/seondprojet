import { describe, expect, it } from 'vitest';
import { legacyLicenseResponse } from '../../supabase/functions/_shared/legacy-license-response';
describe('legacy licenses remain governed by original terms', () => {
  it('an expired gateway token does not revoke a purchased key', () => expect(legacyLicenseResponse(401,{error:'JWT expired'}).status).toBe('unknown'));
  it('a temporary error containing revoked is not actual revocation', () => expect(legacyLicenseResponse(503,{valid:false,error:'key revoked'}).status).toBe('unknown'));
  it('reports original plan expiry correctly', () => expect(legacyLicenseResponse(403,{valid:false,code:'expired'}).status).toBe('expired'));
  it('does not import missing expiry metadata as lifetime', () => expect(legacyLicenseResponse(200,{valid:true}).status).toBe('unknown'));
  it('preserves a confirmed lifetime and original device count', () => expect(legacyLicenseResponse(200,{valid:true,expires_at:null,max_devices:25})).toMatchObject({status:'valid',expiresAt:null,maxDevices:25}));
});