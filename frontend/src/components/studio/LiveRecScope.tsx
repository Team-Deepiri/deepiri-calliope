import { useEffect, useRef } from "react";

interface LiveRecScopeProps {
  getAnalyser?: () => AnalyserNode | null;
}

/**
 * Compact always-on-top scope for the live input while recording:
 * scrolling time-domain waveform plus an instantaneous level bar.
 * Draws nothing (flat line) when no analyser is available yet.
 */
export function LiveRecScope({ getAnalyser }: LiveRecScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<Float32Array[]>([]);
  const levelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stopped = false;

    const draw = () => {
      if (stopped) return;
      const analyser = getAnalyser?.();
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Background grid
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(0, h / 2 - 0.5, w, 1);

      if (analyser) {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const a = Math.abs(buf[i]);
          if (a > peak) peak = a;
        }
        levelRef.current = Math.max(levelRef.current * 0.85, peak);

        // Downsample one column per frame of waveform history
        const step = Math.floor(buf.length / 64);
        const col = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
          col[i] = buf[i * step];
        }
        historyRef.current.push(col);
        const maxCols = Math.floor(w / 4);
        if (historyRef.current.length > maxCols) {
          historyRef.current.splice(0, historyRef.current.length - maxCols);
        }
      }

      // Level bar
      const lvl = Math.min(1, levelRef.current);
      ctx.fillStyle = lvl > 0.95 ? "#ff5252" : "#3dd68c";
      ctx.fillRect(0, h - 3, w * lvl, 3);

      // Scrolling waveform
      ctx.strokeStyle = "#6b9fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const hist = historyRef.current;
      for (let c = 0; c < hist.length; c++) {
        const x = w - (hist.length - c) * 4;
        const col = hist[c];
        for (let i = 0; i < col.length - 1; i++) {
          const y1 = h / 2 - col[i] * (h / 2 - 4);
          const y2 = h / 2 - col[i + 1] * (h / 2 - 4);
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
        }
      }
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      historyRef.current = [];
      levelRef.current = 0;
    };
  }, [getAnalyser]);

  return <canvas ref={canvasRef} width={260} height={44} className="daw-recscope" aria-hidden="true" />;
}
