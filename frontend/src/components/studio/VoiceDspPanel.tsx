import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Radio, Wand2 } from "lucide-react";
import { processVoiceUnit, type VoiceProcessResult } from "../../api/client";
import type { VocalRackPayload } from "../../types/vocalRack";

type Props = {
  rack: VocalRackPayload;
  sampleRate: number;
};

function downsampleAbs(w: number[], maxPts: number): number[] {
  if (w.length === 0) return [];
  if (w.length <= maxPts) return w.map((x) => Math.abs(x));
  const step = Math.ceil(w.length / maxPts);
  const out: number[] = [];
  for (let i = 0; i < w.length; i += step) out.push(Math.abs(w[i]!));
  return out;
}

function WaveCanvas({ left, right }: { left: number[]; right: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    ctx.fillRect(0, 0, w, h);
    const mid = h / 2;
    const chH = h / 2 - 6;
    const plot = (data: number[], y0: number, color: string) => {
      if (!data.length) return;
      const m = Math.max(1e-6, ...data);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < data.length; i++) {
        const x = data.length > 1 ? (i / (data.length - 1)) * w : 0;
        const amp = (data[i]! / m) * chH;
        const y = y0 - amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    plot(left, mid - 3, "rgba(52,211,153,0.95)");
    plot(right, h - 4, "rgba(56,189,248,0.95)");
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }, [left, right]);

  useEffect(() => {
    draw();
  }, [draw, left, right]);

  return (
    <canvas
      ref={ref}
      className="voice-dsp__canvas"
      width={560}
      height={112}
      aria-label="Processed waveform preview"
    />
  );
}

export function VoiceDspPanel({ rack, sampleRate }: Props) {
  const [demoHz, setDemoHz] = useState(220);
  const [stereo, setStereo] = useState(true);
  const [maxLen, setMaxLen] = useState(12000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<VoiceProcessResult | null>(null);

  const onProcess = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const out = await processVoiceUnit({
        samples: [],
        sample_rate: sampleRate,
        demo_tone_hz: demoHz,
        rack,
        output_stereo: stereo,
        max_return_samples: maxLen,
      });
      setRes(out);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const L = res ? downsampleAbs(res.channel_left, 400) : [];
  const R = res ? downsampleAbs(res.channel_right, 400) : [];

  return (
    <div className="voice-dsp glass-panel">
      <div className="voice-dsp__head">
        <div className="voice-dsp__title">
          <Radio size={17} />
          <span>Voice DSP preview</span>
        </div>
        <span className="voice-dsp__pill">POST /v1/voice/process</span>
      </div>
      <p className="voice-dsp__copy">Runs the same rack through the server-side numpy chain — no file upload yet (demo sine).</p>

      <div className="voice-dsp__controls">
        <label className="voice-dsp__field">
          <span>Demo Hz</span>
          <input className="input voice-dsp__input" type="number" min={55} max={880} value={demoHz} onChange={(e) => setDemoHz(Number(e.target.value))} />
        </label>
        <label className="voice-dsp__field voice-dsp__check">
          <input type="checkbox" checked={stereo} onChange={(e) => setStereo(e.target.checked)} />
          Stereo out
        </label>
        <label className="voice-dsp__field">
          <span>Max samples</span>
          <input className="input voice-dsp__input" type="number" min={2048} max={96000} step={512} value={maxLen} onChange={(e) => setMaxLen(Number(e.target.value))} />
        </label>
        <button type="button" className="btn-modern btn-primary voice-dsp__go" onClick={() => void onProcess()} disabled={busy}>
          <Wand2 size={16} />
          {busy ? "Rendering…" : "Process rack"}
        </button>
      </div>

      {err && <p className="voice-dsp__err">{err}</p>}

      {res && (
        <div className="voice-dsp__out">
          <div className="voice-dsp__metrics">
            <span className="voice-dsp__metric">
              <Activity size={14} /> Δ loudness {res.metrics.loudness_delta_db?.toFixed(1) ?? "—"} dB
            </span>
            <span className="voice-dsp__metric">RMS out {res.metrics.rms_out_dbfs?.toFixed(1) ?? "—"} dBFS</span>
            <span className="voice-dsp__metric">Peak {res.metrics.peak_out?.toFixed(3) ?? "—"}</span>
            {res.truncated ? <span className="voice-dsp__metric voice-dsp__metric--warn">Truncated</span> : null}
          </div>
          <div className="voice-dsp__wave">
            <WaveCanvas left={L} right={R} />
            <div className="voice-dsp__wave-legend">
              <span>L</span>
              <span>R</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
