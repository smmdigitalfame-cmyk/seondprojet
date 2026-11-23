import { afterEach, describe, expect, it, vi } from 'vitest';
import '../lib/abortTimeoutPolyfill';
vi.mock('../lib/auth', () => ({ getAuthSession: () => ({ key: 'TEST-CLONE', deviceFingerprint: 'test-device' }), getDeviceFingerprint: () => 'test-device', clearAuthSession: vi.fn() }));
import { fetchInstagramData } from '../lib/instagramApi';
afterEach(() => { vi.unstubAllGlobals(); });
describe('single paid clone request', () => {
  it('reuses search result for immediate clone instead of fetching twice', async () => {
    const data = { profile: { username: 'test_reuse' }, reels: [], posts: [] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await fetchInstagramData('test_reuse','all',{ pages: 2 });
    expect((await fetchInstagramData('test_reuse','all',{ pages: 30 })).profile?.username).toBe('test_reuse');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not reuse a result with expired signed media', async () => {
    const data = { profile: { username: 'test_expired_reuse' }, reels: [{ thumbnail: 'https://example.test/media?exp=1600000000000', videoUrl: '' }], posts: [] };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await fetchInstagramData('test_expired_reuse','all',{ pages: 2 });
    await fetchInstagramData('test_expired_reuse','all',{ pages: 30 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});