import { describe, expect, it, vi } from 'vitest';
import { boundedEnrichment } from '../../supabase/functions/_shared/bounded-enrichment';
describe('clone optional stats latency', () => {
  it('uses real stats when ready', async () => {
    expect(await boundedEnrichment(Promise.resolve(42), 0)).toBe(42);
  });
  it('does not hold completed media longer than 1500ms for stats', async () => {
    vi.useFakeTimers();
    try {
      const result = boundedEnrichment(new Promise<number>(() => {}), 0);
      await vi.advanceTimersByTimeAsync(1500);
      expect(await result).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('a failed optional public reader still permits a successful clone', async () => {
    expect(await boundedEnrichment(Promise.reject(new Error('login wall')), 0)).toBe(0);
  });
});