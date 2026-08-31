import { useEffect, useRef, useState, type MouseEvent } from "react";

const BAR_W = 40;
const WAVE_BUCKETS = 96;

export type ArrangementTrack = {
  id: string;
  name: string;
  type: string;
  color: string;
};

export type TimelineClip = {
  id: string;
  trackId: string;
  name: string;
  startBar: number;
  durationBars: number;
  color: string;
  waveformPeaks?: number[];
};

type TimelineViewProps = {
  bpm: number;
  durationBars: number;
  sections: Array<{ name: string; startBar: number; bars: number; color: string }>;
  tracks: ArrangementTrack[];
  selectedTrackId: string | null;
  playheadBar: number;
  isPlaying?: boolean;
  getPlayheadBar?: () => number;
  clips?: TimelineClip[];
  onFileDrop?: (trackId: string, file: File) => void;
  onSelectClip?: (clipId: string) => void;
  selectedClipId?: string | null;
  /** Seek playhead to a 0-based bar (ruler click). */
  onSeek?: (bar: number) => void;
};

export function ClipWaveform({ peaks, color }: { peaks?: number[]; color: string }) {
  if (!peaks || peaks.length === 0) return null;
  // Downsample to the display bucket count for crisp rendering at any width.
  const step = Math.max(1, Math.floor(peaks.length / WAVE_BUCKETS));
  const pts: number[] = [];
  for (let b = 0; b < WAVE_BUCKETS; b++) {
    let p = 0;
    for (let i = b * step; i < Math.min(peaks.length, (b + 1) * step); i++) {
      if (peaks[i] > p) p = peaks[i];
    }
    pts.push(p);
  }
  const mid = WAVE_BUCKETS / 2;
  const top = pts.map((p, i) => `${i},${(0.5 - (p * 0.92) / 2).toFixed(3)}`).join(" ");
  const bottom = pts
    .slice()
    .reverse()
    .map((p, i) => `${WAVE_BUCKETS - 1 - i},${(0.5 + (p * 0.92) / 2).toFixed(3)}`)
    .join(" ");
  return (
    <svg
      className="daw-clip-wave"
      viewBox={`0 0 ${WAVE_BUCKETS} 1`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={`${top} ${bottom}`} fill={color} opacity={0.85} />
      <line x1={0} y1={0.5} x2={WAVE_BUCKETS} y2={0.5} stroke="#fff" strokeWidth={0.008} opacity={0.35} />
      <line x1={mid} y1={0} x2={mid} y2={1} stroke="#fff" strokeWidth={0.006} opacity={0.18} />
    </svg>
  );
}

export function TimelineView({
  durationBars,
  sections,
  tracks,
  selectedTrackId,
  playheadBar,
  isPlaying = false,
  getPlayheadBar,
  clips = [],
  onFileDrop,
  onSelectClip,
  selectedClipId,
  onSeek,
}: TimelineViewProps) {
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const totalWidth = durationBars * BAR_W;
  const playheadLeft = Math.max(0, (playheadBar - 1) * BAR_W);

  // Buttery playhead: rAF-driven transform while playing (no per-frame React renders).
  useEffect(() => {
    if (!isPlaying || !getPlayheadBar) return;
    let raf = 0;
    const tick = () => {
      const el = playheadRef.current;
      if (el) {
        const barFloat = Math.max(0, getPlayheadBar() - 1);
        el.style.transform = `translateX(${barFloat * BAR_W}px)`;
        el.style.left = "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, getPlayheadBar]);

  const handleRulerClick = (e: MouseEvent) => {
    if (!onSeek || !rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 0) return;
    const bar = Math.max(0, Math.min(durationBars - 1, Math.floor(x / BAR_W)));
    onSeek(bar);
  };

  return (
    <div className="daw-timeline" style={{ ["--daw-bar-w" as string]: `${BAR_W}px` }}>
      <div className="daw-timeline__ruler-wrap">
        <div
          ref={rulerRef}
          className="daw-timeline__ruler"
          style={{ width: totalWidth, cursor: onSeek ? "pointer" : undefined }}
          onClick={handleRulerClick}
          title={onSeek ? "Click to seek" : undefined}
        >
          {Array.from({ length: durationBars }).map((_, i) => (
            <div key={i} className="daw-timeline__bar" style={{ width: BAR_W }}>
              {i % 4 === 0 ? i + 1 : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="daw-timeline__scroll">
        <div className="daw-timeline__grid" style={{ width: totalWidth, position: "relative" }}>
          {tracks.map((track) => {
            const trackClips = clips.filter((c) => c.trackId === track.id);
            return (
              <div
                key={track.id}
                className={`daw-timeline__lane${dragOverTrack === track.id ? " is-drag-over" : ""}${
                  selectedTrackId === track.id ? " is-selected" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTrack(track.id);
                }}
                onDragLeave={() => setDragOverTrack(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTrack(null);
                  const file = Array.from(e.dataTransfer.files).find(
                    (f) => f.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(f.name),
                  );
                  if (file) onFileDrop?.(track.id, file);
                }}
              >
                <div className="daw-timeline__lane-bg">
                  {sections.map((section, idx) => (
                    <div
                      key={`${track.id}-sec-${idx}`}
                      className="daw-timeline__clip daw-timeline__clip--section"
                      style={{
                        left: section.startBar * BAR_W,
                        width: section.bars * BAR_W,
                        backgroundColor: section.color,
                      }}
                    >
                      {track.type === "vocal" ? "" : section.name}
                    </div>
                  ))}
                  {trackClips.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      style={
                        {
                          left: clip.startBar * BAR_W,
                          width: Math.max(BAR_W * 0.5, clip.durationBars * BAR_W),
                          ["--daw-clip-color" as string]: clip.color,
                        } as React.CSSProperties
                      }
                      title={`${clip.name} · ${clip.durationBars.toFixed(2)} bars`}
                      onClick={() => onSelectClip?.(clip.id)}
                      className={`daw-timeline__clip daw-timeline__clip--audio has-wave${selectedClipId === clip.id ? " is-selected" : ""}`}
                    >
                      <span className="daw-clip-name">{clip.name.replace(/\.[^.]+$/, "")}</span>
                      <ClipWaveform peaks={clip.waveformPeaks} color={clip.color} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {clips.length === 0 && (
            <div className="daw-timeline__empty" aria-hidden="true">
              <div className="daw-timeline__empty-eq">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <i key={i} style={{ ["--i" as string]: String(i) }} />
                ))}
              </div>
              <p className="daw-timeline__empty-title">Your timeline is waiting</p>
              <p className="daw-timeline__empty-hint">
                Drop audio on a track · press <kbd>R</kbd> to record · generate from the AI panel
              </p>
            </div>
          )}
          <div ref={playheadRef} className="daw-timeline__playhead" style={{ left: playheadLeft }} />
        </div>
      </div>
    </div>
  );
}
