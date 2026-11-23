import { describe, expect, it } from 'vitest';
import { sameKeySession } from '../lib/keyValidation';
describe('old checks never revoke a newer login',()=>{
  const checked={key:'TEST',deviceFingerprint:'phone-a',loginAt:'2026-11-23T10:00:00Z'};
  it('ignores a late rejection after logging back in with the same paid key',()=>expect(sameKeySession({...checked,loginAt:'2026-11-23T11:00:00Z'},checked)).toBe(false));
  it('still accepts the check for the current login',()=>expect(sameKeySession({...checked},checked)).toBe(true));
});