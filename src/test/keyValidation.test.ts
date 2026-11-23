import { describe, expect, it } from 'vitest';
import { shouldEndKeySession } from '../lib/keyValidation';
describe('paid session validation', () => {
  it('keeps paid access during a service outage even with a misleading code', () => {
    expect(shouldEndKeySession(503, { valid: false, code: 'invalid_key' })).toBe(false);
  });
  it('does not call a device-limit failure a revocation', () => {
    expect(shouldEndKeySession(403, { valid: false, code: 'device_limit' })).toBe(false);
  });
  it('ends access at a confirmed plan expiry', () => {
    expect(shouldEndKeySession(403, { valid: false, code: 'expired' })).toBe(true);
  });
  it('still ends access after an explicit admin revocation', () => {
    expect(shouldEndKeySession(403, { valid: false, code: 'deactivated' })).toBe(true);
  });
  it('never logs out on a valid response', () => {
    expect(shouldEndKeySession(200, { valid: true, code: 'expired' })).toBe(false);
  });
});