import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Pencil } from "lucide-react";

interface GraphPoint {
  day: string;
  thisReel: number | null;
  typical: number | null;
}

interface GraphEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: GraphPoint[]) => void | boolean | Promise<void | boolean>;
  initialData?: GraphPoint[];
  maxViews: number;
  midViews?: number;
  inline?: boolean;
  onDatesChange?: (dates: [string, string, string]) => void;
  controlledDates?: [string, string, string];
}


// Internal point: x is 0-1 (time fraction), y is value
interface DrawPoint {
  x: number;
  y: number;
}

const CANVAS_W = 320;
const CANVAS_H = 200;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 30;
const DRAW_W = CANVAS_W - PAD_L - PAD_R;
const DRAW_H = CANVAS_H - PAD_T - PAD_B;

const getNiceTicks = (maxVal: number): number[] => {
  if (maxVal <= 0) return [0, 100];
  const rawStep = maxVal / 2;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  let step = mag;
  for (const ns of niceSteps) {
    if (ns * mag >= rawStep) { step = ns * mag; break; }
  }
  const ticks = [0];
  let t = step;
  while (t <= maxVal * 1.3 && ticks.length < 4) {
    ticks.push(t);
    t += step;
  }
  return ticks;
};

const fmtTick = (v: number) => {
  if (v === 0) return "0";
  if (v >= 1000) {
    const k = v / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(Math.round(v));
};

const GraphEditorModal = ({ open, onClose, onSave, initialData, maxViews, midViews, inline = false, onDatesChange, controlledDates }: GraphEditorModalProps) => {
  const [internalDates, setInternalDates] = useState<[string, string, string]>(() => {
    if (initialData && initialData.length >= 3) {
      const lastIndex = initialData.length - 1;
      const middleIndex = Math.floor(lastIndex / 2);
      return [
        initialData[0].day || "23 Jan",
        initialData[middleIndex].day || "4 Feb",
        initialData[lastIndex].day || "14 Feb",
      ];
    }
    return ["23 Jan", "4 Feb", "14 Feb"];
  });
  
  // Use controlled dates if provided, otherwise internal
  const dates = controlledDates || internalDates;
  const setDates = (nd: [string, string, string]) => {
    setInternalDates(nd);
    onDatesChange?.(nd);
  };

  // The editor canvas mirrors EXACTLY the outer chart's axis: bottom = 0,
  // middle gridline = midViews, top gridline = maxViews. The same piecewise
  // mapping the chart uses is applied here, so the shape the user draws is the
  // shape that renders — and re-opening the editor shows the identical curve
  // (no drift / rescaling on repeated saves).
  const topVal = Math.max(1, maxViews || 1);
  const midVal = Math.min(Math.max(0, midViews ?? topVal / 2), topVal);

  // value -> normalized 0..1 canvas position
  const valueToNorm = (v: number) => {
    const c = Math.max(0, Math.min(topVal, v));
    const u = c <= midVal ? (midVal === 0 ? 0 : c / midVal) : 1 + (c - midVal) / (topVal - midVal || 1);
    return Math.max(0, Math.min(1, u / 2));
  };
  // normalized 0..1 canvas position -> value
  const normToValue = (y: number) => {
    const u = Math.max(0, Math.min(1, y)) * 2;
    return u <= 1 ? u * midVal : midVal + (u - 1) * (topVal - midVal || 1);
  };

  const initPoints = (key: "thisReel" | "typical"): DrawPoint[] => {
    if (!initialData || initialData.length < 2) return [];
    return initialData
      .map((d, i) => {
        const raw = d[key];
        if (raw == null || !Number.isFinite(raw)) return null;
        return {
          x: i / (initialData.length - 1),
          y: valueToNorm(raw),
        };
      })
      .filter((p): p is DrawPoint => p !== null);
  };


  const [reelPoints, setReelPoints] = useState<DrawPoint[]>(() => initPoints("thisReel"));
  const [typicalPoints, setTypicalPoints] = useState<DrawPoint[]>(() => initPoints("typical"));
  const [activeGraph, setActiveGraph] = useState<"reel" | "typical">("reel");
  // Open in preview mode; the user explicitly enables freehand drawing.
  const [drawingMode, setDrawingMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const isDrawingFreehand = useRef(false);
  const freehandPoints = useRef<DrawPoint[]>([]);
  // Mobile browsers fire touchstart AND a synthetic mousedown for the same
  // tap. Without suppression, the second event either double-taps (deleting
  // the just-added point) or drops the drag. Ignore mouse events briefly
  // after any touch event.
  const lastTouchAt = useRef<number>(0);
  const isSyntheticMouse = (e: React.TouchEvent | React.MouseEvent) => {
    if ("touches" in e) return false;
    return Date.now() - lastTouchAt.current < 600;
  };

  // Fixed normalized canvas: 0..1, with labels showing % of max
  const drawMaxY = 1;
  const yTicks = [0, 0.5, 1];

  const valToY = (v: number) => PAD_T + DRAW_H - (v / drawMaxY) * DRAW_H;
  const yToVal = (py: number) => Math.max(0, Math.min(1, ((PAD_T + DRAW_H - py) / DRAW_H) * drawMaxY));
  const fracToX = (f: number) => PAD_L + f * DRAW_W;
  const xToFrac = (px: number) => Math.max(0, Math.min(1, (px - PAD_L) / DRAW_W));

  const getSvgCoords = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (CANVAS_W / rect.width),
      y: (clientY - rect.top) * (CANVAS_H / rect.height),
    };
  }, []);

  const setActivePoints = activeGraph === "reel" ? setReelPoints : setTypicalPoints;

  const handlePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawingMode) return; // Don't allow interactions when draw is off
    if ("touches" in e) lastTouchAt.current = Date.now();
    else if (isSyntheticMouse(e)) return;
    e.preventDefault();
    const pt = getSvgCoords(e);
    if (!pt) return;

    // Draw mode always starts a fresh freehand stroke, even when the finger
    // lands near an existing point. This lets the whole curve be reshaped in
    // one continuous gesture instead of accidentally dragging one old point.
    isDrawingFreehand.current = true;
    freehandPoints.current = [{ x: xToFrac(pt.x), y: yToVal(pt.y) }];
  }, [drawingMode, getSvgCoords, setActivePoints]);

  // Evenly sample a freehand stroke down to a manageable number of points
  const simplifyFreehand = (raw: DrawPoint[], numPoints: number): DrawPoint[] => {
    if (raw.length <= numPoints) return raw;
    const out: DrawPoint[] = [];
    for (let i = 0; i < numPoints; i++) {
      out.push(raw[Math.round((i / (numPoints - 1)) * (raw.length - 1))]);
    }
    return out;
  };

  const handlePointerMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawingMode) return;
    if (!isDrawingFreehand.current) return;
    if ("touches" in e) lastTouchAt.current = Date.now();
    else if (isSyntheticMouse(e)) return;
    e.preventDefault();
    const pt = getSvgCoords(e);
    if (!pt) return;
    const frac = xToFrac(pt.x);
    const val = yToVal(pt.y);
    // Freehand: collect and live-preview the drawn stroke
    freehandPoints.current.push({ x: frac, y: Math.max(0, Math.min(1, val)) });
    if (freehandPoints.current.length > 2) {
      const sorted = [...freehandPoints.current].sort((a, b) => a.x - b.x);
      setActivePoints(simplifyFreehand(sorted, 25));
    }
  }, [drawingMode, getSvgCoords, setActivePoints]);

  const handlePointerUp = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    if (e && !("touches" in e) && isSyntheticMouse(e)) return;
    if (isDrawingFreehand.current) {
      const raw = freehandPoints.current;
      if (raw.length > 2) {
        const sorted = [...raw].sort((a, b) => a.x - b.x);
        setActivePoints(simplifyFreehand(sorted, 25));
      } else if (raw.length >= 1) {
        // Simple tap: add a single point
        const p = raw[0];
        setActivePoints(prev => [...prev, p].sort((a, b) => a.x - b.x));
      }
    }
    isDrawingFreehand.current = false;
    freehandPoints.current = [];
  }, [setActivePoints]);

  const handleSave = async () => {
    // Interpolate only inside the part of the chart the user actually drew.
    // Keeping the untouched edges null means a half-width finger stroke stays
    // half-width after Save instead of being stretched across the full chart.
    const interpolate = (points: DrawPoint[], numOut: number): (number | null)[] => {
      if (points.length === 0) return Array(numOut).fill(null);
      const sorted = [...points].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = sorted[sorted.length - 1].x;
      const eps = 1e-6;
      const result: (number | null)[] = [];
      for (let i = 0; i < numOut; i++) {
        const frac = i / (numOut - 1);
        if (frac < minX - eps || frac > maxX + eps) { result.push(null); continue; }
        if (frac <= sorted[0].x) { result.push(sorted[0].y); continue; }
        if (frac >= sorted[sorted.length - 1].x) { result.push(sorted[sorted.length - 1].y); continue; }
        let lo = 0;
        for (let j = 0; j < sorted.length - 1; j++) {
          if (sorted[j].x <= frac && sorted[j + 1].x >= frac) { lo = j; break; }
        }
        const t = (frac - sorted[lo].x) / (sorted[lo + 1].x - sorted[lo].x);
        result.push(sorted[lo].y + t * (sorted[lo + 1].y - sorted[lo].y));
      }
      return result;
    };

    // Convert canvas positions back into real values using the SAME axis
    // mapping the outer chart uses, so saved data renders identically.
    // Preserve detail of user-drawn shape (mountains/curves): use a high
    // resolution (~25 points). Fewer points caused multi-peak shapes to
    // smooth out into a simple bell after Save.
    const NUM_OUT = 25;
    const reelVals = interpolate(reelPoints, NUM_OUT).map(v => v == null ? null : Math.round(normToValue(v)));
    const typicalVals = interpolate(typicalPoints, NUM_OUT).map(v => v == null ? null : Math.round(normToValue(v)));

    const midIdx = Math.floor((NUM_OUT - 1) / 2);
    const data: GraphPoint[] = [];
    for (let i = 0; i < NUM_OUT; i++) {
      let day = "";
      if (i === 0) day = dates[0];
      else if (i === midIdx) day = dates[1];
      else if (i === NUM_OUT - 1) day = dates[2];
      data.push({ day, thisReel: reelVals[i], typical: typicalVals[i] });
    }
    setIsSaving(true);
    try {
      const saved = await onSave(data);
      if (saved !== false) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const renderLine = (points: DrawPoint[], color: string, dashed: boolean, isActive: boolean) => {
    if (points.length === 0) return null;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const pathD = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${fracToX(p.x)} ${valToY(p.y)}`).join(" ");

    return (
      <g opacity={isActive ? 1 : 0.35}>
        {/* Glow effect for active line */}
        {isActive && (
          <path d={pathD} fill="none" stroke={color} strokeWidth={8} strokeDasharray={dashed ? "6 4" : ""} opacity={0.15} strokeLinecap="round" strokeLinejoin="round" />
        )}
        <path d={pathD} fill="none" stroke={color} strokeWidth={isActive ? 2.5 : 1.5} strokeDasharray={dashed ? "6 4" : ""} strokeLinecap="round" strokeLinejoin="round" />
        {isActive && sorted.map((p, i) => (
          <g key={i}>
            {/* Outer ring */}
            <circle cx={fracToX(p.x)} cy={valToY(p.y)} r={7} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
            {/* Inner dot */}
            <circle cx={fracToX(p.x)} cy={valToY(p.y)} r={4} fill={color} stroke="hsl(var(--background))" strokeWidth={1.5} />
            {/* Invisible larger hit area */}
            <circle cx={fracToX(p.x)} cy={valToY(p.y)} r={16} fill="transparent" className="cursor-grab active:cursor-grabbing" />
          </g>
        ))}
        {!isActive && sorted.map((p, i) => (
          <circle key={i} cx={fracToX(p.x)} cy={valToY(p.y)} r={3} fill={color} opacity={0.5} />
        ))}
      </g>
    );
  };

  if (!open) return null;

  const content = (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between ${inline ? 'pt-3 pb-2' : 'px-4 pt-4 pb-2'}`}>
        <div className="flex items-center gap-2">
          <Pencil size={14} className="text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">Edit Graph</span>
          {drawingMode && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
              Draw
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Draw</span>
            <button
              onClick={() => setDrawingMode(!drawingMode)}
              className={`w-8 h-[18px] rounded-full transition-colors relative ${drawingMode ? 'bg-foreground' : 'bg-secondary'}`}
            >
              <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-transform ${drawingMode ? 'bg-background translate-x-[16px]' : 'bg-muted-foreground translate-x-[2px]'}`} />
            </button>
          </div>
          <button onClick={onClose} className="text-muted-foreground"><X size={16} /></button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mb-2">
        {drawingMode ? "Draw the curve freely with one continuous swipe" : "Turn on Draw, then swipe across the graph to customize it"}
      </p>

      {/* Date inputs */}
      <div className="flex gap-1.5 mb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1">
            <input
              value={dates[i]}
              onChange={(e) => {
                const nd = [...dates] as [string, string, string];
                nd[i] = e.target.value;
                setDates(nd);
              }}
              className="w-full bg-secondary rounded-lg px-2 py-1 text-[11px] text-foreground outline-none text-center"
              placeholder="23 Jan"
            />
          </div>
        ))}
      </div>

      {/* Graph type selector */}
      <div className="flex gap-1.5 mb-2">
        <button
          onClick={() => setActiveGraph("reel")}
          className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-all flex items-center justify-center gap-1 ${
            activeGraph === "reel"
              ? "border-[#E040FB] bg-[#E040FB]/10 text-[#E040FB]"
              : "border-border bg-secondary/50 text-muted-foreground"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#E040FB]" />
          This reel
        </button>
        <button
          onClick={() => setActiveGraph("typical")}
          className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-all flex items-center justify-center gap-1 ${
            activeGraph === "typical"
              ? "border-[#9CA3AF] bg-[#9CA3AF]/10 text-[#9CA3AF]"
              : "border-border bg-secondary/50 text-muted-foreground"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]" />
          Typical
        </button>
      </div>

      {/* Drawing Canvas */}
      <div className="rounded-xl overflow-hidden border border-border bg-secondary/20 mb-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full touch-none select-none"
          style={{ minHeight: inline ? 150 : 180 }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          {/* Grid */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD_L} y1={valToY(tick)} x2={CANVAS_W - PAD_R} y2={valToY(tick)} stroke="hsl(var(--border))" strokeOpacity={0.3} strokeWidth={0.5} />
              <text x={PAD_L - 5} y={valToY(tick) + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))" opacity={0.7}>
                {fmtTick(Math.round(normToValue(tick)))}
              </text>
            </g>
          ))}

          {/* Border */}
          <rect x={PAD_L} y={PAD_T} width={DRAW_W} height={DRAW_H} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth={0.5} />

          {/* X-axis labels */}
          {[0, 0.5, 1].map((f, di) => (
            <text key={f} x={fracToX(f)} y={CANVAS_H - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))" opacity={0.7}>
              {dates[di]}
            </text>
          ))}

          {/* Render inactive graph first, active on top */}
          {activeGraph === "reel" ? (
            <>
              {renderLine(typicalPoints, "#9CA3AF", true, false)}
              {renderLine(reelPoints, "#E040FB", false, true)}
            </>
          ) : (
            <>
              {renderLine(reelPoints, "#E040FB", false, false)}
              {renderLine(typicalPoints, "#9CA3AF", true, true)}
            </>
          )}
        </svg>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setActivePoints([])}
          className="px-3 py-2 rounded-lg border border-border text-foreground text-[13px] font-semibold"
        >
          Clear
        </button>
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="flex-1 py-2 rounded-lg bg-[hsl(var(--ig-blue))] text-white text-[13px] font-semibold"
      >
        {isSaving ? "Saving…" : "Done"}
      </button>
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="mt-3 pt-3 border-t border-border/30">
        {content}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-[420px] bg-background rounded-t-2xl pb-[max(2rem,env(safe-area-inset-bottom))] px-4 animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>,
    document.body
  );
};

export default GraphEditorModal;
