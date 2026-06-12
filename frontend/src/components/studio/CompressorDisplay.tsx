import { useRef, useEffect, useCallback } from "react";

type Props = {
  threshold: number;
  ratio: number;
  gainReduction: number;
  inputLevel: number;
  outputLevel: number;
  width?: number;
  height?: number;
};

const PADDING = { left: 30, right: 10, top: 10, bottom: 20 };

export function CompressorDisplay({
  threshold,
  ratio,
  gainReduction,
  inputLevel,
  outputLevel,
  width = 240,
  height = 140,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);

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

    const graphW = w - PADDING.left - PADDING.right;
    const graphH = h - PADDING.top - PADDING.bottom;

    // Knee visualization
    const kneeY = PADDING.top + graphH * (1 - (threshold + 60) / 66);
    const ratioSlope = 1 / ratio;

    ctx.strokeStyle = "rgba(34,197,94,0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Threshold line
    ctx.beginPath();
    ctx.moveTo(PADDING.left, kneeY);
    ctx.lineTo(PADDING.left + graphW, kneeY);
    ctx.stroke();
    ctx.fillStyle = "rgba(34,197,94,0.4)";
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Thresh ${threshold.toFixed(1)}dB`, PADDING.left + 2, kneeY - 2);

    // Ratio line
    const ratioEndX = PADDING.left + graphW;
    const ratioEndY = kneeY - (graphW * ratioSlope * (graphH / 66));
    ctx.strokeStyle = "rgba(234,179,8,0.25)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, kneeY);
    ctx.lineTo(ratioEndX, Math.max(PADDING.top, ratioEndY));
    ctx.stroke();
    ctx.fillStyle = "rgba(234,179,8,0.4)";
    ctx.fillText(`Ratio ${ratio}:1`, PADDING.left + 2, Math.max(PADDING.top + 8, ratioEndY));
    ctx.setLineDash([]);

    // Gain reduction history curve
    historyRef.current.push(gainReduction);
    if (historyRef.current.length > 80) historyRef.current.shift();

    const hist = historyRef.current;
    if (hist.length > 1) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(239,68,68,0.3)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const x = PADDING.left + (i / (hist.length - 1)) * graphW;
        const y = PADDING.top + graphH * (1 - Math.min(1, hist[i]));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Input meter
    const meterW = 8;
    const meterGap = 6;
    const meterH = graphH;

    const inMeterX = w - PADDING.right - meterW;
    const inMeterY = PADDING.top;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(inMeterX, inMeterY, meterW, meterH, 2);
    ctx.fill();

    const inH = Math.max(0, Math.min(1, inputLevel)) * meterH;
    const inGrad = ctx.createLinearGradient(0, inMeterY + meterH, 0, inMeterY);
    inGrad.addColorStop(0, "#22c55e");
    inGrad.addColorStop(0.6, "#eab308");
    inGrad.addColorStop(1, "#ef4444");
    ctx.fillStyle = inGrad;
    ctx.beginPath();
    ctx.roundRect(inMeterX, inMeterY + meterH - inH, meterW, inH, 2);
    ctx.fill();

    ctx.fillStyle = "rgba(148,163,184,0.4)";
    ctx.font = "7px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("IN", inMeterX + meterW / 2, inMeterY - 3);

    // Output meter
    const outMeterX = inMeterX - meterW - meterGap;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(outMeterX, inMeterY, meterW, meterH, 2);
    ctx.fill();

    const outH = Math.max(0, Math.min(1, outputLevel)) * meterH;
    ctx.fillStyle = "#818cf8";
    ctx.beginPath();
    ctx.roundRect(outMeterX, inMeterY + meterH - outH, meterW, outH, 2);
    ctx.fill();

    ctx.fillText("OUT", outMeterX + meterW / 2, inMeterY - 3);

    // GR label
    ctx.fillStyle = "rgba(239,68,68,0.5)";
    ctx.font = "7px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`GR ${(gainReduction * 100).toFixed(0)}%`, PADDING.left, h - 5);
  }, [threshold, ratio, gainReduction, inputLevel, outputLevel, width, height]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 50);
    return () => clearInterval(interval);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, borderRadius: 8 }}
    />
  );
}
