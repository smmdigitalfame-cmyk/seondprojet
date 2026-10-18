import { useState, useRef, useCallback } from "react";
import * as React from "react";
import { X, Pencil } from "lucide-react";

interface RetentionPoint {
    t: string;
    pct: number | null;
}

interface RetentionEditorModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (thisReel: RetentionPoint[], typical: RetentionPoint[]) => void | boolean | Promise<void | boolean>;
    initialData: RetentionPoint[];
    initialTypical: RetentionPoint[];
    inline?: boolean;
    threeLineScale?: boolean;
    yCenter?: number;
    yTop?: number;
}

const CW = 320, CH = 200;
const PL = 42, PR = 12, PT = 14, PB = 30;
const DW = CW - PL - PR;
const DH = CH - PT - PB;

const RetentionEditorModal = ({
    open, onClose, onSave, initialData, initialTypical, inline = false, threeLineScale = false, yCenter = 50, yTop = 100
}: RetentionEditorModalProps) => {
    const toDrawPoints = (data: RetentionPoint[]) =>
        data
            .map((p, i) => ({ x: i / Math.max(1, data.length - 1), y: p.pct }))
            .filter((p): p is { x: number; y: number } => typeof p.y === "number" && Number.isFinite(p.y));

    const [points, setPoints] = useState(() => toDrawPoints(initialData));
    // Start ready to draw so one tap on any insights graph activates editing.
    const [drawingMode, setDrawingMode] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [startTime, setStartTime] = useState(initialData[0]?.t || "0:00");
    const [endTime, setEndTime] = useState(initialData[initialData.length - 1]?.t || "0:19");

    const svgRef = useRef<SVGSVGElement>(null);
    const draggingIdx = useRef<number | null>(null);
    const lastTap = useRef<number>(0);
    const isDrawingFreehand = useRef(false);
    const freehandPoints = useRef<{ x: number; y: number }[]>([]);
    const lastTouchAt = useRef(0);

    const isSyntheticMouse = (e: React.TouchEvent | React.MouseEvent) =>
        !("touches" in e) && Date.now() - lastTouchAt.current < 600;

    // Mirror the parent chart's axis exactly. Retention chart is a plain
    // linear 0-100% axis; the engagement ("when people liked") chart uses a
    // piecewise axis where the middle gridline = yCenter and top = yTop.
    // Using the same mapping here means the drawn curve renders identically
    // after saving, and re-opening the editor shows the same curve.
    const topPct = Math.max(1, yTop);
    const midPct = Math.min(Math.max(0, yCenter), topPct);
    const valueToScale = (v: number) => {
        if (!threeLineScale) return Math.max(0, Math.min(100, v)) / 100;
        const c = Math.max(0, Math.min(topPct, v));
        const u = c <= midPct ? (midPct === 0 ? 0 : c / midPct) : 1 + (c - midPct) / (topPct - midPct || 1);
        return Math.max(0, Math.min(1, u / 2));
    };
    const scaleToValue = (scale: number) => {
        const s = Math.max(0, Math.min(1, scale));
        if (!threeLineScale) return s * 100;
        const u = s * 2;
        return u <= 1 ? u * midPct : midPct + (u - 1) * (topPct - midPct || 1);
    };
    const maxVal = threeLineScale ? topPct : 100;
    const valToY = (v: number) => PT + DH - valueToScale(v) * DH;
    const yToVal = (py: number) => scaleToValue((PT + DH - py) / DH);

    const fracToX = (f: number) => PL + f * DW;
    const xToFrac = (px: number) => Math.max(0, Math.min(1, (px - PL) / DW));

    const getSvgCoords = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
        const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
        return {
            x: (cx - rect.left) * (CW / rect.width),
            y: (cy - rect.top) * (CH / rect.height),
        };
    }, []);

    const findNearest = (px: number, py: number): number | null => {
        let nearest = -1, minD = 22;
        points.forEach((p, i) => {
            const dx = fracToX(p.x) - px;
            const dy = valToY(p.y) - py;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minD) { minD = d; nearest = i; }
        });
        return nearest >= 0 ? nearest : null;
    };

    // Simplify freehand points by sampling evenly
    const simplifyFreehand = (raw: { x: number; y: number }[], numPoints: number) => {
        if (raw.length <= numPoints) return raw;
        const result: { x: number; y: number }[] = [];
        for (let i = 0; i < numPoints; i++) {
            const idx = Math.round((i / (numPoints - 1)) * (raw.length - 1));
            result.push(raw[idx]);
        }
        return result;
    };

    const handlePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!drawingMode) return;
        if ("touches" in e) lastTouchAt.current = Date.now();
        else if (isSyntheticMouse(e)) return;
        e.preventDefault();
        const pt = getSvgCoords(e);
        if (!pt) return;

        const now = Date.now();
        const isDoubleTap = now - lastTap.current < 350;
        lastTap.current = now;

        const nearIdx = findNearest(pt.x, pt.y);

        if (isDoubleTap && nearIdx !== null && points.length > 2) {
            setPoints(prev => prev.filter((_, i) => i !== nearIdx));
            return;
        }

        if (nearIdx !== null) {
            draggingIdx.current = nearIdx;
            return;
        }

        // Start freehand drawing
        isDrawingFreehand.current = true;
        freehandPoints.current = [{ x: xToFrac(pt.x), y: yToVal(pt.y) }];
    }, [drawingMode, getSvgCoords, points]);

    const handlePointerMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!drawingMode) return;
        if ("touches" in e) lastTouchAt.current = Date.now();
        else if (isSyntheticMouse(e)) return;
        e.preventDefault();
        const pt = getSvgCoords(e);
        if (!pt) return;

        if (draggingIdx.current !== null) {
            setPoints(prev => {
                const dragIndex = draggingIdx.current;
                if (dragIndex === null || !prev[dragIndex]) return prev;
                const next = [...prev];
                next[dragIndex] = {
                    x: xToFrac(pt.x),
                    y: Math.max(0, Math.min(maxVal, yToVal(pt.y))),
                };
                return next;
            });
            return;
        }

        // Freehand drawing - collect points as user draws
        if (isDrawingFreehand.current) {
            const frac = xToFrac(pt.x);
            const val = yToVal(pt.y);
            freehandPoints.current.push({ x: frac, y: Math.max(0, Math.min(maxVal, val)) });

            // Live preview: simplify and update points
            const simplified = simplifyFreehand(
                [...freehandPoints.current].sort((a, b) => a.x - b.x),
                15
            );
            setPoints(simplified);
        }
    }, [drawingMode, getSvgCoords]);

    const handlePointerUp = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
        if (e && !("touches" in e) && isSyntheticMouse(e)) return;
        if (isDrawingFreehand.current && freehandPoints.current.length > 2) {
            // Finalize freehand: sort by x, simplify to reasonable number of points
            const sorted = [...freehandPoints.current].sort((a, b) => a.x - b.x);
            const simplified = simplifyFreehand(sorted, 12);
            setPoints(simplified);
        }
        draggingIdx.current = null;
        isDrawingFreehand.current = false;
        freehandPoints.current = [];
    }, []);

    const handleSave = async () => {
        const sorted = [...points].sort((a, b) => a.x - b.x);
        if (sorted.length < 2 || isSaving) return;
        // Fixed resolution so a partial stroke keeps its real width; points
        // outside the drawn range stay null (rendered as a gap, not extended).
        const numOut = 25;
        const step = 1 / (numOut - 1);
        const minX = sorted[0].x, maxX = sorted[sorted.length - 1].x;
        const result: RetentionPoint[] = [];
        for (let i = 0; i < numOut; i++) {
            const frac = i / (numOut - 1);
            let val: number | null = 0;
            if (frac < minX - step / 2 || frac > maxX + step / 2) val = null;
            else if (frac <= minX) val = sorted[0].y;
            else if (frac >= maxX) val = sorted[sorted.length - 1].y;
            else {
                let lo = 0;
                for (let j = 0; j < sorted.length - 1; j++) {
                    if (sorted[j].x <= frac && sorted[j + 1].x >= frac) { lo = j; break; }
                }
                const t = (frac - sorted[lo].x) / (sorted[lo + 1].x - sorted[lo].x);
                val = sorted[lo].y + t * (sorted[lo + 1].y - sorted[lo].y);
            }
            result.push({ t: i === 0 ? startTime : i === numOut - 1 ? endTime : "", pct: val === null ? null : Math.round(val) });
        }
        setIsSaving(true);
        try {
            const saved = await onSave(result, initialTypical);
            if (saved !== false) onClose();
        } finally {
            setIsSaving(false);
        }
    };

    const sorted = [...points].sort((a, b) => a.x - b.x);
    const pathD = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${fracToX(p.x).toFixed(1)} ${valToY(p.y).toFixed(1)}`).join(" ");



    if (!open) return null;

    const content = (
        <>
            {/* Header */}
            <div className={`flex items-center justify-between ${inline ? "pt-3 pb-2" : "px-4 pt-4 pb-2"}`}>
                <div className="flex items-center gap-2">
                    <Pencil size={14} className="text-muted-foreground" />
                    <span className="text-[13px] font-semibold text-foreground">Edit Graph</span>
                    {drawingMode && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">Draw</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Draw</span>
                        <button
                            onClick={() => setDrawingMode(!drawingMode)}
                            className={`w-8 h-[18px] rounded-full transition-colors relative ${drawingMode ? "bg-foreground" : "bg-secondary"}`}
                        >
                            <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-transform ${drawingMode ? "bg-background translate-x-[16px]" : "bg-muted-foreground translate-x-[2px]"}`} />
                        </button>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground"><X size={16} /></button>
                </div>
            </div>

            <p className="text-[10px] text-muted-foreground mb-2">
                {drawingMode ? "Draw a curve freely • Tap points to adjust • Double-tap to remove" : "Auto-generated from retention • Turn on Draw to edit manually"}
            </p>

            {/* Time label inputs */}
            <div className="flex gap-1.5 mb-2">
                <input
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1 bg-secondary rounded-lg px-2 py-1 text-[11px] text-foreground outline-none text-center"
                    placeholder="0:00"
                />
                <input
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1 bg-secondary rounded-lg px-2 py-1 text-[11px] text-foreground outline-none text-center"
                    placeholder="0:19"
                />
            </div>

            {/* SVG Canvas */}
            <div className="rounded-xl overflow-hidden border border-border bg-secondary/20 mb-2">
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${CW} ${CH}`}
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
                    {/* Grid lines - 3 ticks so labels never overlap */}
                    {[0, 0.5, 1].map(frac => scaleToValue(frac)).map((tick, ti) => (
                        <g key={ti}>
                            <line x1={PL} y1={valToY(tick)} x2={CW - PR} y2={valToY(tick)}
                                stroke="hsl(var(--border))" strokeOpacity={0.3} strokeWidth={0.5} />
                            <text x={PL - 5} y={valToY(tick) + 3} textAnchor="end"
                                fontSize={9} fill="hsl(var(--muted-foreground))" opacity={0.7}>
                                {tick === 0 ? "0" : `${Math.round(tick)}%`}
                            </text>
                        </g>
                    ))}

                    {/* Border */}
                    <rect x={PL} y={PT} width={DW} height={DH} fill="none"
                        stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth={0.5} />

                    {/* X axis labels */}
                    <text x={fracToX(0)} y={CH - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))" opacity={0.7}>{startTime}</text>
                    <text x={fracToX(1)} y={CH - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))" opacity={0.7}>{endTime}</text>

                    {/* Glow for This reel */}
                    {drawingMode && (
                        <path d={pathD} fill="none" stroke="#E040FB" strokeWidth={8} opacity={0.12} strokeLinecap="round" strokeLinejoin="round" />
                    )}

                    {/* This reel line */}
                    <path d={pathD} fill="none" stroke="#E040FB" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

                    {/* Draggable dots */}
                    {sorted.map((p, i) => (
                        <g key={i}>
                            {drawingMode && <circle cx={fracToX(p.x)} cy={valToY(p.y)} r={7} fill="none" stroke="#E040FB" strokeWidth={1.5} opacity={0.4} />}
                            <circle cx={fracToX(p.x)} cy={valToY(p.y)} r={drawingMode ? 4 : 3} fill="#E040FB" stroke="hsl(var(--background))" strokeWidth={1.5} />
                            {drawingMode && <circle cx={fracToX(p.x)} cy={valToY(p.y)} r={16} fill="transparent" className="cursor-grab active:cursor-grabbing" />}
                        </g>
                    ))}
                </svg>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border text-foreground text-[13px] font-semibold">
                    Cancel
                </button>
                <button onClick={handleSave} disabled={isSaving || points.length < 2} className="flex-1 py-2 rounded-lg bg-[hsl(var(--ig-blue))] text-white text-[13px] font-semibold disabled:opacity-60">
                    {isSaving ? "Saving…" : "Save Changes"}
                </button>
            </div>
        </>
    );

    if (inline) {
        return (
            <div className="mt-3 pt-3 border-t border-border/30">{content}</div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-end justify-center" onClick={onClose}>
            <div
                className="w-full max-w-[420px] bg-background rounded-t-2xl pb-8 px-4 animate-in slide-in-from-bottom"
                onClick={(e) => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );
};

export default RetentionEditorModal;
