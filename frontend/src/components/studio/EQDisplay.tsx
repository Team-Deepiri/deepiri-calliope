import { useRef, useEffect, useCallback, useState } from "react";

export type EQBand = {
  freq: number;
  gain: number;
  q: number;
  type: "low-shelf" | "peaking" | "high-shelf";
};

type Props = {
  bands: EQBand[];
  width?: number;
  height?: number;
  onBandUpdate?: (index: number, updates: Partial<EQBand>) => void;
};

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_GAIN = -30;
const MAX_GAIN = 30;
const PADDING = { top: 20, right: 20, bottom: 30, left: 40 };

function freqToX(freq: number, w: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  const pct = (Math.log10(freq) - logMin) / (logMax - logMin);
  return PADDING.left + pct * (w - PADDING.left - PADDING.right);
}

function gainToY(gain: number, h: number): number {
  const pct = (gain - MIN_GAIN) / (MAX_GAIN - MIN_GAIN);
  return h - PADDING.bottom - pct * (h - PADDING.top - PADDING.bottom);
}

function shelvingResponse(freq: number, gain: number, _q: number, type: "low-shelf" | "high-shelf"): (f: number) => number {
  return (f: number) => {
    const ratio = f / freq;
    const normalizedFreq = type === "low-shelf" ? ratio : 1 / ratio;
    const w = normalizedFreq;
    const gainLinear = Math.pow(10, gain / 20);
    const wSq = w * w;
    const gSq = gainLinear * gainLinear;
    const hSq = (gSq * wSq + 1) / (wSq + 1);
    if (hSq <= 0) return 0;
    const dB = 20 * Math.log10(Math.sqrt(hSq));
    return Math.max(MIN_GAIN, Math.min(MAX_GAIN, dB));
  };
}

function peakingResponse(freq: number, gain: number, q: number): (f: number) => number {
  return (f: number) => {
    const ratio = f / freq;
    const gainLinear = Math.pow(10, gain / 20);
    const gSq = gainLinear * gainLinear;
    const hSq = (gSq * ratio * ratio + ratio * ratio / gSq + (gSq - 1) * ratio * Math.sin(Math.PI / (2 * q)) + 1) /
      (ratio * ratio + 1 / (q * q) * ratio + 1);
    if (hSq <= 0) return 0;
    const dB = 20 * Math.log10(Math.sqrt(hSq));
    return Math.max(MIN_GAIN, Math.min(MAX_GAIN, dB));
  };
}

function buildResponseFn(bands: EQBand[]): (f: number) => number {
  const fns = bands.map((b) => {
    if (b.type === "peaking") return peakingResponse(b.freq, b.gain, b.q);
    return shelvingResponse(b.freq, b.gain, b.q, b.type);
  });
  return (f: number) => {
    let total = 0;
    for (const fn of fns) total += fn(f);
    return Math.max(MIN_GAIN, Math.min(MAX_GAIN, total));
  };
}

function generateCurvePoints(bands: EQBand[], w: number): Array<{ x: number; y: number }> {
  const responseFn = buildResponseFn(bands);
  const h = 200;
  const points: Array<{ x: number; y: number }> = [];
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
    const x = freqToX(freq, w);
    const gain = responseFn(freq);
    const y = gainToY(gain, h);
    points.push({ x, y });
  }
  return points;
}

const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

export function EQDisplay({ bands, width = 400, height = 200, onBandUpdate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setDragIndex] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = width;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "rgba(15,23,42,0.95)");
    bg.addColorStop(1, "rgba(2,6,23,0.98)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let g = -20; g <= 20; g += 10) {
      const gy = gainToY(g, h);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, gy);
      ctx.lineTo(w - PADDING.right, gy);
      ctx.stroke();
    }
    for (const fl of FREQ_LABELS) {
      const fx = freqToX(fl, w);
      ctx.beginPath();
      ctx.moveTo(fx, PADDING.top);
      ctx.lineTo(fx, h - PADDING.bottom);
      ctx.stroke();
    }

    // 0dB line
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const zeroY = gainToY(0, h);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, zeroY);
    ctx.lineTo(w - PADDING.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    for (const fl of FREQ_LABELS) {
      const fx = freqToX(fl, w);
      const label = fl >= 1000 ? `${fl / 1000}k` : `${fl}`;
      ctx.fillText(label, fx, h - 8);
    }
    ctx.textAlign = "right";
    for (let g = -20; g <= 20; g += 10) {
      const gy = gainToY(g, h);
      ctx.fillText(`${g > 0 ? "+" : ""}${g}`, PADDING.left - 4, gy + 3);
    }

    // Individual band curves
    const bandColors = ["#818cf8", "#22d55e", "#eab308", "#ef4444"];
    const bandFns = bands.map((b) => {
      if (b.type === "peaking") return peakingResponse(b.freq, b.gain, b.q);
      return shelvingResponse(b.freq, b.gain, b.q, b.type);
    });
    for (let bi = 0; bi < bands.length; bi++) {
      const fn = bandFns[bi];
      ctx.strokeStyle = bandColors[bi % bandColors.length] + "40";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const steps = 100;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
        const x = freqToX(freq, w);
        const gain = fn(freq);
        const y = gainToY(gain, h);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Combined curve
    const points = generateCurvePoints(bands, w);
    ctx.strokeStyle = "#818cf8";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(129,140,248,0.3)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill under curve
    const fillGrad = ctx.createLinearGradient(0, PADDING.top, 0, h - PADDING.bottom);
    fillGrad.addColorStop(0, "rgba(129,140,248,0.12)");
    fillGrad.addColorStop(1, "rgba(129,140,248,0.01)");
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, h - PADDING.bottom);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.lineTo(points[points.length - 1].x, h - PADDING.bottom);
    ctx.closePath();
    ctx.fill();

    // Frequency nodes
    for (let bi = 0; bi < bands.length; bi++) {
      const b = bands[bi];
      const nx = freqToX(b.freq, w);
      const ny = gainToY(b.gain, h);

      ctx.beginPath();
      ctx.arc(nx, ny, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,23,42,0.9)";
      ctx.fill();
      ctx.strokeStyle = bandColors[bi % bandColors.length];
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, Math.PI * 2);
      ctx.fillStyle = bandColors[bi % bandColors.length];
      ctx.fill();
    }
  }, [bands, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCanvasPos = useCallback(
    (clientX: number, clientY: number): { freq: number; gain: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const logMin = Math.log10(MIN_FREQ);
      const logMax = Math.log10(MAX_FREQ);
      const pctX = (x - PADDING.left) / (width - PADDING.left - PADDING.right);
      const freq = Math.pow(10, logMin + pctX * (logMax - logMin));
      const pctY = 1 - (y - PADDING.top) / (height - PADDING.top - PADDING.bottom);
      const gain = MIN_GAIN + pctY * (MAX_GAIN - MIN_GAIN);
      return {
        freq: Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)),
        gain: Math.max(MIN_GAIN, Math.min(MAX_GAIN, gain)),
      };
    },
    [width, height],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    const pos = getCanvasPos(e.clientX, e.clientY);
    if (!pos || !onBandUpdate) return;
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < bands.length; i++) {
      const dx = freqToX(bands[i].freq, width) - freqToX(pos.freq, width);
      const dy = gainToY(bands[i].gain, height) - gainToY(pos.gain, height);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist && dist < 20) {
        closestDist = dist;
        closest = i;
      }
    }
    if (closest >= 0) {
      setDragIndex(closest);
      const onMove = (ev: PointerEvent) => {
        const newPos = getCanvasPos(ev.clientX, ev.clientY);
        if (newPos) onBandUpdate(closest, { freq: Math.round(newPos.freq), gain: Math.round(newPos.gain * 10) / 10 });
      };
      const onUp = () => {
        setDragIndex(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, borderRadius: 8, cursor: onBandUpdate ? "pointer" : "default" }}
      onPointerDown={handlePointerDown}
    />
  );
}
