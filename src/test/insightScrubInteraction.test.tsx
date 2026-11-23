import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import InsightScrubChart from '@/components/InsightScrubChart';

describe('saved graph inspection', () => {
  it('reads saved view values without altering them, and reads new values after an edit', () => {
    const points = [{ label: 'Oct 7', value: 0 }, { label: 'Oct 28', value: 35312 }];
    const { rerender } = render(<InsightScrubChart label="views" points={points} />);
    const chart = screen.getByRole('slider');
    fireEvent.keyDown(chart, { key: 'End' });
    expect(chart.getAttribute('aria-valuenow')).toBe('35312');
    expect(points[1].value).toBe(35312);
    rerender(<InsightScrubChart label="views" points={[{ label: 'Oct 7', value: 0 }, { label: 'Oct 28', value: 100000 }]} />);
    fireEvent.keyDown(chart, { key: 'End' });
    expect(chart.getAttribute('aria-valuenow')).toBe('100000');
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(chart.getAttribute('aria-valuenow')).toBeNull();
  });

  it('inspects negative growth and saved retention percentages without converting them to views', () => {
    const { rerender } = render(<InsightScrubChart label="growth" bottom={-12} points={[{ label: '', value: 4 }, { label: '', value: -7 }]} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('-7');
    rerender(<InsightScrubChart label="retention" percentage points={[{ label: '0:00', value: 100 }, { label: '0:30', value: 2.3 }]} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(2.3);
  });
});