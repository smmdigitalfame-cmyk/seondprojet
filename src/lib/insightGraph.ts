export interface InsightGraphPoint {
  label: string;
  value: number | null;
  typical?: number | null;
}

export const niceGraphTop = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return ([1, 2, 2.5, 3, 4, 5, 6, 8, 10].find(step => step >= normalized) ?? 10) * magnitude;
};

export function scaleGraphValues(values: (number | null)[], previous: number, next: number) {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  const baseline = previous > 0 ? previous : Math.max(0, ...finite);
  return values.map(value => value == null || !Number.isFinite(value) ? null
    : Math.round(baseline > 0 ? value * Math.max(0, next) / baseline : Math.max(0, next)));
}

export function fitGraphToTotal(values: (number | null)[], total: number) {
  const peak = Math.max(0, ...values.filter((value): value is number => value != null && Number.isFinite(value)));
  return scaleGraphValues(values, peak, total);
}

// Continuous interpolation, never across an intentionally undrawn gap.
export function sampleGraph(points: InsightGraphPoint[], ratio: number) {
  if (!points.length) return null;
  const position = Math.max(0, Math.min(1, ratio)) * (points.length - 1);
  const left = Math.floor(position);
  const right = Math.ceil(position);
  const a = points[left];
  const b = points[right];
  if (a?.value == null || b?.value == null) return null;
  const fraction = position - left;
  return { value: a.value + (b.value - a.value) * fraction, position };
}

export function graphReadout(value: number, percentage = false) {
  if (percentage) return `${Number(value.toFixed(1))}%`;
  const abs = Math.abs(value);
  for (const [unit, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (abs >= unit) return `${Number((value / unit).toFixed(1))}${suffix}`;
  }
  return Math.round(value).toLocaleString('en-US');
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function graphPositionLabel(points: InsightGraphPoint[], ratio: number) {
  const labels = points.map((point, index) => ({ label: point.label, index })).filter(point => point.label);
  if (!labels.length) return '';
  const position = ratio * Math.max(0, points.length - 1);
  const left = [...labels].reverse().find(point => point.index <= position) ?? labels[0];
  const right = labels.find(point => point.index >= position) ?? labels[labels.length - 1];
  if (!left || !right) return '';
  const fraction = right.index === left.index ? 0 : (position - left.index) / (right.index - left.index);
  const seconds = (label: string) => /^\d+:\d{2}$/.test(label) ? Number(label.split(':')[0]) * 60 + Number(label.split(':')[1]) : null;
  const a = seconds(left.label), b = seconds(right.label);
  if (a != null && b != null) {
    const time = Math.round(a + (b - a) * fraction);
    return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
  }
  if (/^\d+h$/.test(left.label) && /^\d+h$/.test(right.label)) {
    return `${Number((parseFloat(left.label) + (parseFloat(right.label) - parseFloat(left.label)) * fraction).toFixed(1))}h`;
  }
  const date = (label: string) => {
    const parts = label.trim().split(/\s+/);
    const month = months.findIndex(m => m.toLowerCase() === (parts.find(p => /^[a-z]/i.test(p)) ?? '').slice(0, 3).toLowerCase());
    const day = Number(parts.find(p => /^\d+$/.test(p)));
    return month >= 0 && day > 0 ? Date.UTC(2024, month, day) : null;
  };
  const start = date(left.label), end = date(right.label);
  if (start != null && end != null) {
    const finish = end < start ? Date.UTC(2025, new Date(end).getUTCMonth(), new Date(end).getUTCDate()) : end;
    const selected = new Date(start + (finish - start) * fraction);
    return `${months[selected.getUTCMonth()]} ${selected.getUTCDate()}`;
  }
  return fraction < 0.5 ? left.label : right.label;
}