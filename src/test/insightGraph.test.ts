import { describe, expect, it } from 'vitest';
import { fitGraphToTotal, graphPositionLabel, graphReadout, niceGraphTop, sampleGraph, scaleGraphValues } from '@/lib/insightGraph';

describe('saved analytics graph data', () => {
  it('fits legacy reel curves to the saved view total rather than stale graph counts', () => {
    expect(fitGraphToTotal([null, 0, 8000, 16000, null], 35312)).toEqual([null, 0, 17656, 35312, null]);
  });
  it('resizes a saved curve when views change, preserving undrawn gaps', () => {
    expect(scaleGraphValues([null, 0, 500, 1000, null], 1000, 35312)).toEqual([null, 0, 17656, 35312, null]);
  });
  it('scrubs continuously from the saved data without mutating it', () => {
    const points = [{ label: 'Oct 7', value: 0 }, { label: 'Oct 28', value: 35312 }];
    expect(sampleGraph(points, 0.25)?.value).toBe(8828);
    expect(sampleGraph(points, 1)?.value).toBe(35312);
    expect(points[1].value).toBe(35312);
  });
  it('does not fabricate numbers across partial strokes', () => {
    expect(sampleGraph([{ label: '', value: null }, { label: '', value: 100 }], 0.5)).toBeNull();
  });
  it('automatically fits large totals and zero without clipping or NaN', () => {
    expect(niceGraphTop(35312)).toBe(40000);
    expect(niceGraphTop(2500)).toBe(2500);
    expect(niceGraphTop(0)).toBe(1);
    expect(scaleGraphValues([0, 100, null], 100, 0)).toEqual([0, 0, null]);
  });
  it('shows the selected count and percentage in reference format', () => {
    expect(graphReadout(34800)).toBe('34.8K');
    expect(graphReadout(2.3, true)).toBe('2.3%');
  });
  it('interpolates elapsed time and dates for finger position', () => {
    expect(graphPositionLabel([{ label: '0:00', value: 100 }, { label: '0:30', value: 0 }], 0.25)).toBe('0:08');
    expect(graphPositionLabel([{ label: '7 Oct', value: 0 }, { label: '28 Oct', value: 35312 }], 1)).toBe('Oct 28');
  });
});