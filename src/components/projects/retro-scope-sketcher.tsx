"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { PenLine, Ruler, RotateCcw, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui";
import type { RetroScopeMeasurement, RetroScopePoint, RetroScopeSketch, RetroScopeStroke } from "@/lib/domain/retro-scope";

const WIDTH = 1000;
const HEIGHT = 700;
type Tool = "draw" | "measure" | "label";
type PendingText = { kind: "measurement"; measurement: Omit<RetroScopeMeasurement, "id" | "label">; point: RetroScopePoint } | { kind: "label"; point: RetroScopePoint };

function id(kind: string) { return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function distance(a: RetroScopePoint, b: RetroScopePoint) { return Math.hypot(a.x - b.x, a.y - b.y); }

/**
 * A deliberately small, touch-first floor-plan sketcher. Coordinates are stored
 * in an SVG viewBox, so one drawing stays sharp and editable on both an iPhone
 * and the exported A4 scope PDF.
 */
export function RetroScopeSketcher({ value, onChange, disabled }: { value: RetroScopeSketch | null; onChange: (value: RetroScopeSketch | null) => void; disabled: boolean }) {
  const sketch = value ?? { strokes: [], measurements: [], labels: [] };
  const [tool, setTool] = useState<Tool>("draw");
  const [stroke, setStroke] = useState<RetroScopeStroke | null>(null);
  const [measurement, setMeasurement] = useState<{ start: RetroScopePoint; end: RetroScopePoint } | null>(null);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const update = (next: RetroScopeSketch) => onChange(next.strokes.length || next.measurements.length || next.labels.length ? next : null);
  const pointFor = (event: PointerEvent<SVGSVGElement>): RetroScopePoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(WIDTH, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * WIDTH)),
      y: Math.min(HEIGHT, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * HEIGHT)),
    };
  };
  const undo = () => {
    if (sketch.labels.length) return update({ ...sketch, labels: sketch.labels.slice(0, -1) });
    if (sketch.measurements.length) return update({ ...sketch, measurements: sketch.measurements.slice(0, -1) });
    if (sketch.strokes.length) update({ ...sketch, strokes: sketch.strokes.slice(0, -1) });
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (disabled || pendingText) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFor(event);
    if (tool === "draw") setStroke({ id: id("stroke"), points: [point] });
    if (tool === "measure") setMeasurement({ start: point, end: point });
    if (tool === "label") setPendingText({ kind: "label", point });
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const point = pointFor(event);
    if (stroke) setStroke((current) => current ? { ...current, points: [...current.points, point] } : current);
    if (measurement) setMeasurement((current) => current ? { ...current, end: point } : current);
  };
  const finish = () => {
    if (stroke) {
      if (stroke.points.length > 1) update({ ...sketch, strokes: [...sketch.strokes, stroke] });
      setStroke(null);
    }
    if (measurement) {
      if (distance(measurement.start, measurement.end) > 12) setPendingText({ kind: "measurement", measurement, point: { x: (measurement.start.x + measurement.end.x) / 2, y: (measurement.start.y + measurement.end.y) / 2 } });
      setMeasurement(null);
    }
  };
  const commitText = (text: string) => {
    const clean = text.trim().slice(0, 100);
    if (pendingText && clean) {
      if (pendingText.kind === "label") update({ ...sketch, labels: [...sketch.labels, { id: id("label"), point: pendingText.point, text: clean }] });
      else update({ ...sketch, measurements: [...sketch.measurements, { id: id("measurement"), ...pendingText.measurement, label: clean }] });
    }
    setPendingText(null);
  };
  const previewMeasurements = measurement ? [...sketch.measurements, { id: "draft", ...measurement, label: "" }] : sketch.measurements;
  const previewStrokes = stroke ? [...sketch.strokes, stroke] : sketch.strokes;

  return <section className="rounded-xl border border-border-subtle p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-bold">Site sketch</h3><p className="mt-1 text-sm text-muted-foreground">Draw a quick floor plan, then add measurements and labels. It is saved as part of this Retrofit scope.</p></div>
      {!disabled ? <div className="flex flex-wrap gap-2" aria-label="Sketch tools">
        <ToolButton active={tool === "draw"} onClick={() => setTool("draw")} label="Draw"><PenLine className="size-4" />Draw</ToolButton>
        <ToolButton active={tool === "measure"} onClick={() => setTool("measure")} label="Measure"><Ruler className="size-4" />Measure</ToolButton>
        <ToolButton active={tool === "label"} onClick={() => setTool("label")} label="Label"><Type className="size-4" />Label</ToolButton>
        <Button type="button" size="sm" variant="secondary" disabled={!sketch.strokes.length && !sketch.measurements.length && !sketch.labels.length} onClick={undo}><RotateCcw className="size-4" />Undo</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!sketch.strokes.length && !sketch.measurements.length && !sketch.labels.length} onClick={() => { if (window.confirm("Clear this site sketch?")) onChange(null); }} className="text-[var(--tone-rose-fg)]"><Trash2 className="size-4" />Clear</Button>
      </div> : null}
    </div>
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border-strong bg-surface-muted">
      <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`block aspect-[10/7] w-full ${disabled ? "" : "cursor-crosshair"}`} style={{ touchAction: disabled ? "auto" : "none" }} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} role="img" aria-label="Editable site sketch">
        <defs><pattern id="retro-scope-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" /></pattern></defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#retro-scope-grid)" className="text-muted-foreground" />
        {previewStrokes.map((item) => <polyline key={item.id} points={item.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" className="text-foreground" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />)}
        {previewMeasurements.map((item) => <g key={item.id} className="text-primary"><line x1={item.start.x} y1={item.start.y} x2={item.end.x} y2={item.end.y} stroke="currentColor" strokeWidth="5" /><circle cx={item.start.x} cy={item.start.y} r="7" fill="currentColor" /><circle cx={item.end.x} cy={item.end.y} r="7" fill="currentColor" />{item.label ? <SketchText point={{ x: (item.start.x + item.end.x) / 2, y: (item.start.y + item.end.y) / 2 }} text={item.label} /> : null}</g>)}
        {sketch.labels.map((item) => <SketchText key={item.id} point={item.point} text={item.text} />)}
      </svg>
      {pendingText ? <label className="absolute z-10 w-44 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(pendingText.point.x / WIDTH) * 100}%`, top: `${(pendingText.point.y / HEIGHT) * 100}%` }}><span className="sr-only">{pendingText.kind === "measurement" ? "Measurement" : "Label"}</span><input autoFocus className="h-11 w-full rounded-lg border border-primary bg-surface px-3 text-sm shadow-lg outline-none" placeholder={pendingText.kind === "measurement" ? "e.g. 4.2 m" : "Room or note"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitText(event.currentTarget.value); } if (event.key === "Escape") setPendingText(null); }} onBlur={(event) => commitText(event.currentTarget.value)} /></label> : null}
      {!disabled && !pendingText ? <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-surface/90 px-2 py-1 text-[11px] font-semibold text-muted-foreground">{tool === "draw" ? "Drag to draw" : tool === "measure" ? "Drag a line, then enter its measurement" : "Tap to place a label"}</p> : null}
    </div>
    {!sketch.strokes.length && !sketch.measurements.length && !sketch.labels.length && !stroke && !measurement ? <p className="mt-3 text-sm text-muted-foreground">No sketch added yet.</p> : null}
  </section>;
}

function ToolButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return <Button type="button" size="sm" variant={active ? "primary" : "secondary"} onClick={onClick} aria-pressed={active} aria-label={label}>{children}</Button>;
}

function SketchText({ point, text }: { point: RetroScopePoint; text: string }) {
  const width = Math.max(90, Math.min(220, text.length * 11 + 24));
  return <g transform={`translate(${point.x - width / 2} ${point.y - 28})`} className="text-foreground"><rect width={width} height="36" rx="7" fill="currentColor" opacity="0.92" /><text x="12" y="23" fill="var(--surface)" fontSize="19" fontWeight="700">{text}</text></g>;
}
