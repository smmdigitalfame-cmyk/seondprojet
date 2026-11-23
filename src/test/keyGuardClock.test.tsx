import { act, render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../lib/abortTimeoutPolyfill';
const mocks = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock('../lib/auth', () => ({ clearAuthSession: mocks.clear, getAuthSession: () => ({ key: 'TEST-CLOCK', deviceFingerprint: 'test-phone' }), getDeviceFingerprint: () => 'test-phone' }));
import KeyGuard from '../components/KeyGuard';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.clear.mockClear(); });
describe('server-authoritative plan expiry', () => {
  it('does not revoke server-valid access just because the phone clock is ahead', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ valid: true, expires_at: '2000-01-01T00:00:00Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await act(async () => { render(<KeyGuard><span>account</span></KeyGuard>); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});