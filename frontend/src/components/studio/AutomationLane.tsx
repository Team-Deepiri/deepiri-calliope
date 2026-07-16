import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GripVertical, Trash2 } from "lucide-react";
import type { AutomationPoint, AutomationTrack } from "../../types/audio";

const CURVE_OPTIONS: { value: AutomationPoint["curve"]; label: string }[] = [
  { value: "linear", label: "Lin" },
  { value: "exponential", label: "Exp" },
  { value: "logarithmic", label: "Log" },
  { value: "s_curve", label: "S-Curve" },
  { value: "step", label: "Step" },
  { value: "smooth", label: "Smooth" },
];

type Props = {
  track: AutomationTrack;
  onChange: (points: AutomationPoint[]) => void;
  durationMs?: number;
  height?: number;
};

export function AutomationLane({ track, onChange, durationMs = 4000, height = 180 }: Props) {
  const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const padding = { left: 50, right: 20, top: 20, bottom: 30 };
  const innerW = 600 - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const xFromMs = (t: number) => padding.left + (t / durationMs) * innerW;
  const yFromVal = (v: number) => padding.top + (1 - (v - track.min_value) / (track.max_value - track.min_value)) * innerH;
  const msFromX = (x: number) => ((x - padding.left) / innerW) * durationMs;
  const valFromY = (y: number) => track.max_value - ((y - padding.top) / innerH) * (track.max_value - track.min_value);

  const sorted = [...track.points].sort((a, b) => a.time_ms - b.time_ms);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || contextMenu) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const timeMs = Math.max(0, Math.min(durationMs, msFromX(x)));
      const value = Math.max(track.min_value, Math.min(track.max_value, valFromY(y)));
      onChange([...track.points, { time_ms: timeMs, value, curve: "linear" }]);
    },
    [track, onChange, durationMs, contextMenu, innerW, innerH],
  );

  const handlePointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.stopPropagation();
      setContextMenu(null);
      const origPoints = [...track.points];
      const startX = e.clientX;
      const startY = e.clientY;
      const origPoint = origPoints[index];

      const onMove = (ev: PointerEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const origX = xFromMs(origPoint.time_ms);
        const origY = yFromVal(origPoint.value);
        const newTime = Math.max(0, Math.min(durationMs, msFromX(origX + dx)));
        const newVal = Math.max(track.min_value, Math.min(track.max_value, valFromY(origY + dy)));
        const updated = origPoints.map((p, i) => (i === index ? { ...p, time_ms: newTime, value: newVal } : p));
        onChange(updated);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [track, onChange, durationMs],
  );

  const handleContextMenu = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ index, x: e.clientX, y: e.clientY });
  }, []);

  const handleDelete = useCallback(() => {
    if (contextMenu === null) return;
    const updated = track.points.filter((_, i) => i !== contextMenu.index);
    onChange(updated);
    setContextMenu(null);
  }, [contextMenu, track.points, onChange]);

  const handleCurveChange = useCallback(
    (curve: AutomationPoint["curve"]) => {
      if (contextMenu === null) return;
      const updated = track.points.map((p, i) => (i === contextMenu.index ? { ...p, curve } : p));
      onChange(updated);
      setContextMenu(null);
    },
    [contextMenu, track.points, onChange],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const gridLinesX = 8;
  const gridLinesY = 6;

  const buildPath = () => {
    if (sorted.length === 0) return "";
    let d = `M ${xFromMs(sorted[0].time_ms)} ${yFromVal(sorted[0].value)}`;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const x1 = xFromMs(prev.time_ms);
      const y1 = yFromVal(prev.value);
      const x2 = xFromMs(curr.time_ms);
      const y2 = yFromVal(curr.value);
      if (curr.curve === "step") {
        d += ` L ${x2} ${y1} L ${x2} ${y2}`;
      } else if (curr.curve === "s_curve") {
        const cpx = x1 + (x2 - x1) * 0.5;
        const cpy = y1;
        d += ` C ${cpx} ${cpy}, ${cpx} ${y2}, ${x2} ${y2}`;
      } else if (curr.curve === "exponential") {
        const cpx = x1 + (x2 - x1) * 0.6;
        d += ` Q ${cpx} ${y1}, ${x2} ${y2}`;
      } else if (curr.curve === "logarithmic") {
        const cpx = x1 + (x2 - x1) * 0.4;
        d += ` Q ${cpx} ${y2}, ${x2} ${y2}`;
      } else {
        d += ` L ${x2} ${y2}`;
      }
    }
    return d;
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2">
          <GripVertical size={14} className="text-gray-600" />
          <span className="text-sm font-semibold text-gray-200">{track.name}</span>
          <span className="text-[10px] text-gray-500">
            {track.min_value.toFixed(1)}–{track.max_value.toFixed(1)}
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          {track.points.length} pts
        </span>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 600 ${height}`}
        preserveAspectRatio="none"
        className="cursor-crosshair"
        onClick={handleSvgClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <linearGradient id="lane-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0.02)" />
          </linearGradient>
        </defs>

        <rect x={padding.left} y={padding.top} width={innerW} height={innerH} fill="url(#lane-bg)" rx="4" />

        {Array.from({ length: gridLinesX }).map((_, i) => {
          const x = padding.left + (i / (gridLinesX - 1)) * innerW;
          return (
            <line key={`gx-${i}`} x1={x} y1={padding.top} x2={x} y2={padding.top + innerH} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          );
        })}

        {Array.from({ length: gridLinesY }).map((_, i) => {
          const y = padding.top + (i / (gridLinesY - 1)) * innerH;
          const val = track.max_value - (i / (gridLinesY - 1)) * (track.max_value - track.min_value);
          return (
            <g key={`gy-${i}`}>
              <line x1={padding.left} y1={y} x2={padding.left + innerW} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize={9}>
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {sorted.length > 1 && (
          <motion.path
            d={buildPath()}
            fill="none"
            stroke="#818cf8"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4 }}
          />
        )}

        {sorted.length > 1 && (
          <path
            d={`${buildPath()} L ${xFromMs(sorted[sorted.length - 1].time_ms)} ${padding.top + innerH} L ${xFromMs(sorted[0].time_ms)} ${padding.top + innerH} Z`}
            fill="rgba(129,140,248,0.08)"
          />
        )}

        {sorted.map((point, i) => (
          <motion.g
            key={`pt-${i}-${point.time_ms}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            onPointerDown={(e) => handlePointerDown(i, e)}
            onContextMenu={(e) => handleContextMenu(i, e)}
            style={{ cursor: "grab" }}
          >
            <circle cx={xFromMs(point.time_ms)} cy={yFromVal(point.value)} r={8} fill="rgba(15,23,42,0.8)" stroke="#818cf8" strokeWidth={2} />
            <circle cx={xFromMs(point.time_ms)} cy={yFromVal(point.value)} r={3} fill="#c7d2fe" />
          </motion.g>
        ))}
      </svg>

      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Curve</div>
          {CURVE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="w-full text-left px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
              onClick={() => handleCurveChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <div className="border-t border-gray-700 my-1" />
          <button
            type="button"
            className="w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-gray-800 transition-colors flex items-center gap-2"
            onClick={handleDelete}
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
