import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { graphPositionLabel, graphReadout, niceGraphTop, sampleGraph, type InsightGraphPoint } from '@/lib/insightGraph';

interface Props {
  points: InsightGraphPoint[];
  label: string;
  height?: number;
  top?: number;
  middle?: number;
  bottom?: number;
  axisLabels?: [string, string, string];
  percentage?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onAxisChange?: (index: number, value: string) => void;
  showDates?: boolean;
}

export default function InsightScrubChart({ points, label, height = 150, top, middle, bottom = 0,
  axisLabels, percentage = false, editing, onEdit, onAxisChange, showDates = true }: Props) {
  const [selection, setSelection] = useState<number | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef(0);
  const dragging = useRef(false);
  const reducedMotion = useReducedMotion();
  const numeric = points.flatMap(point => [point.value, point.typical]).filter((v): v is number => v != null && Number.isFinite(v));
  const peak = Math.max(0, ...numeric);
  const max = Math.max(top != null && top >= peak ? top : niceGraphTop(peak), bottom + 1);
  const min = Math.min(bottom, ...numeric);
  const mid = middle != null && middle > min && middle < max ? middle : (max + min) / 2;
  const width = 320, plotTop = 8, plotBottom = height - 5;
  const x = (ratio: number) => ratio * width;
  const y = (value: number) => value <= mid
    ? plotBottom - (value - min) / (mid - min) * (plotBottom - plotTop) / 2
    : (plotBottom + plotTop) / 2 - (value - mid) / (max - mid) * (plotBottom - plotTop) / 2;
  const path = (key: 'value' | 'typical') => {
    let start = true;
    return points.map((point, index) => {
      const value = point[key];
      if (value == null || !Number.isFinite(value)) { start = true; return ''; }
      const command = start ? 'M' : 'L';
      start = false;
      return `${command}${x(index / Math.max(1, points.length - 1)).toFixed(2)},${y(value).toFixed(2)}`;
    }).join(' ');
  };
  const selected = selection == null ? null : sampleGraph(points, selection);
  const readout = selected ? graphReadout(selected.value, percentage) : '';
  const date = selection == null ? '' : graphPositionLabel(points, selection);
  const labels = [graphReadout(max, percentage), graphReadout(mid, percentage), graphReadout(min, percentage)];
  const displayedLabels = axisLabels?.map((value, index) => top != null && max > top ? labels[index] : value) ?? labels;
  const dates = useMemo(() => points.filter(point => point.label), [points]);
  useEffect(() => {
    setSelection(null);
  }, [points]);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);
  const select = (clientX: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    pending.current = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width)));
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => { setSelection(pending.current); frame.current = null; });
  };
  const clear = () => {
    dragging.current = false;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setSelection(null);
  };
  return (
    <div className="insight-scrub-chart relative min-w-0" data-chart={label}>
      {editing && onEdit && <Button variant="ghost" size="icon" className="absolute -top-9 right-0 h-8 w-8" aria-label={`Customize ${label}`} title="Edit graph" onClick={onEdit}><Pencil size={15} /></Button>}
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
        <div className="flex min-w-0 flex-col justify-between text-right text-[10px] leading-none text-muted-foreground py-1" style={{ height }}>
          {displayedLabels.map((value, index) => editing && onAxisChange
            ? <input key={index} aria-label={`${label} axis ${index}`} className="w-full min-w-0 rounded bg-secondary px-1 text-right text-foreground outline-none" value={value} onChange={event => onAxisChange(index, event.target.value)} />
            : <span key={index}>{value}</span>)}
        </div>
        <div data-no-longpress role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max}
          aria-valuenow={selected?.value ?? undefined} aria-valuetext={selected ? `${readout}, ${date}` : undefined}
          className="insight-scrub-plot relative min-w-0 select-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ height }}
          onPointerDown={event => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); select(event.clientX, event.currentTarget); }}
          onPointerMove={event => { if (dragging.current || event.pointerType === 'mouse') select(event.clientX, event.currentTarget); }}
          onPointerUp={clear} onPointerCancel={clear} onLostPointerCapture={clear} onPointerLeave={() => { if (!dragging.current) clear(); }}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'Escape') { clear(); return; }
            setSelection(previous => event.key === 'Home' ? 0 : event.key === 'End' ? 1 : Math.max(0, Math.min(1, (previous ?? 0) + (event.key === 'ArrowRight' ? 1 : -1) / Math.max(1, points.length - 1))));
          }}>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible" aria-hidden="true">
            {[plotTop, (plotTop + plotBottom) / 2, plotBottom].map(line => <line key={line} x1={0} x2={width} y1={line} y2={line} className="insight-graph-grid" vectorEffect="non-scaling-stroke" />)}
            {points.some(point => point.typical != null) && <motion.path d={path('typical')} animate={{ d: path('typical') }} transition={{ duration: reducedMotion ? 0 : 0.22 }} fill="none" className="insight-graph-typical" strokeWidth={2} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />}
            <motion.path d={path('value')} animate={{ d: path('value') }} transition={{ duration: reducedMotion ? 0 : 0.22 }} fill="none" className="insight-graph-line" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {selected && selection != null && <>
              <line x1={x(selection)} x2={x(selection)} y1={-7} y2={plotBottom} className="insight-graph-cursor" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <circle cx={x(selection)} cy={y(selected.value)} r={3} className="insight-graph-dot" />
            </>}
          </svg>
          {selected && selection != null && <div role="status" className="insight-graph-readout pointer-events-none absolute -top-10 whitespace-nowrap rounded-md px-2 py-1 text-center text-[10px] leading-[13px] tabular-nums" style={{ left: `clamp(24px, ${selection * 100}%, calc(100% - 24px))`, transform: 'translateX(-50%)' }}>
            <span className="block font-semibold">{readout}</span><span className="block text-[9px] text-muted-foreground">{date}</span>
          </div>}
        </div>
      </div>
      {showDates && <div className="ml-12 mt-2 flex min-w-0 justify-between gap-2 text-[10px] text-muted-foreground">{dates.map((point, index) => <span className="min-w-0 break-words" key={`${index}-${point.label}`}>{point.label}</span>)}</div>}
    </div>
  );
}