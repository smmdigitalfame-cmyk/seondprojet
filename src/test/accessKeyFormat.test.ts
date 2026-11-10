import { describe, it, expect } from 'vitest';
import { isInstagramAccessKey } from '../../supabase/functions/_shared/access-key-format';

describe('Issuer-compatible Instagram keys', () => {
  it('accepts zero and one used by paid hexadecimal issuance', () => {
    expect(isInstagramAccessKey('A010-B001-C101')).toBe(true);
  });
  it('still rejects malformed keys', () => {
    expect(isInstagramAccessKey('A010-B001-C10')).toBe(false);
    expect(isInstagramAccessKey('A010-B001-C10!')).toBe(false);
  });
});