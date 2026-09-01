import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

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
  /** Move a clip to a new start bar / track (0-based bar). */
  onClipMove?: (clipId: string, newTrackId: string, newStartBar: number) => void;
};

function ClipWaveform({
  peaks,
  color,
  contained = false,
}: {
  peaks?: number[];
  color: string;
  /** When true, fill parent without absolute positioning (safe inside arrangement clips). */
  contained?: boolean;
}) {
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
      className={contained ? "daw-clip-wave daw-clip-wave--contained" : "daw-clip-wave"}
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

type DragState = {
  clipId: string;
  originStartBar: number;
  originTrackId: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

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
  onClipMove,
}: TimelineViewProps) {
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    clipId: string;
    startBar: number;
    trackId: string;
  } | null>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<typeof dragPreview>(null);
  const suppressClickRef = useRef(false);
  const totalWidth = durationBars * BAR_W;

  dragRef.current = dragging;
  previewRef.current = dragPreview;
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
    if (!onSeek || !rulerRef.current || dragging) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 0) return;
    const bar = Math.max(0, Math.min(durationBars - 1, Math.floor(x / BAR_W)));
    onSeek(bar);
  };

  const trackIdAtY = useCallback((clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const lanes = grid.querySelectorAll<HTMLElement>("[data-track-id]");
    for (const lane of lanes) {
      const r = lane.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        return lane.dataset.trackId ?? null;
      }
    }
    return null;
  }, []);

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const preview = previewRef.current;
    if (drag.moved && preview && onClipMove) {
      suppressClickRef.current = true;
      if (preview.startBar !== drag.originStartBar || preview.trackId !== drag.originTrackId) {
        onClipMove(drag.clipId, preview.trackId, preview.startBar);
      }
    } else if (!drag.moved) {
      onSelectClip?.(drag.clipId);
    }
    setDragging(null);
    setDragPreview(null);
  }, [onClipMove, onSelectClip]);

  useEffect(() => {
    if (!dragging || !onClipMove) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging({ ...drag, moved: true });
      }
      const barDelta = Math.round(dx / BAR_W);
      const clip = clips.find((c) => c.id === drag.clipId);
      const dur = clip?.durationBars ?? 1;
      const maxStart = Math.max(0, durationBars - Math.max(0.25, dur));
      const startBar = Math.max(0, Math.min(maxStart, drag.originStartBar + barDelta));
      const trackId = trackIdAtY(e.clientY) ?? drag.originTrackId;
      setDragPreview({ clipId: drag.clipId, startBar, trackId });
    };
    const onUp = () => finishDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onClipMove, clips, durationBars, trackIdAtY, finishDrag]);

  const onClipPointerDown = (clip: TimelineClip, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onClipMove || e.button !== 0) {
      onSelectClip?.(clip.id);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    onSelectClip?.(clip.id);
    const next: DragState = {
      clipId: clip.id,
      originStartBar: clip.startBar,
      originTrackId: clip.trackId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    setDragging(next);
    setDragPreview({ clipId: clip.id, startBar: clip.startBar, trackId: clip.trackId });
  };

  const clipLaneId = (clip: TimelineClip) =>
    dragPreview?.clipId === clip.id ? dragPreview.trackId : clip.trackId;
  const clipStartBar = (clip: TimelineClip) =>
    dragPreview?.clipId === clip.id ? dragPreview.startBar : clip.startBar;

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
        <div ref={gridRef} className="daw-timeline__grid" style={{ width: totalWidth, position: "relative" }}>
          {tracks.map((track) => {
            const trackClips = clips.filter((c) => clipLaneId(c) === track.id);
            return (
              <div
                key={track.id}
                data-track-id={track.id}
                className={`daw-timeline__lane${dragOverTrack === track.id ? " is-drag-over" : ""}${
                  selectedTrackId === track.id ? " is-selected" : ""
                }${dragging?.moved && dragPreview?.trackId === track.id ? " is-drop-target" : ""}`}
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
                  {trackClips.map((clip) => {
                    const startBar = clipStartBar(clip);
                    const isDragClip = dragging?.clipId === clip.id;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        style={
                          {
                            left: startBar * BAR_W,
                            width: Math.max(BAR_W * 0.5, clip.durationBars * BAR_W),
                            ["--daw-clip-color" as string]: clip.color,
                            cursor: onClipMove ? (isDragClip && dragging.moved ? "grabbing" : "grab") : "pointer",
                            opacity: isDragClip && dragging.moved ? 0.92 : 1,
                            zIndex: isDragClip ? 5 : undefined,
                          } as React.CSSProperties
                        }
                        title={`${clip.name} · ${clip.durationBars.toFixed(2)} bars${onClipMove ? " · drag to move" : ""}`}
                        onClick={(ev) => {
                          if (suppressClickRef.current) {
                            suppressClickRef.current = false;
                            ev.preventDefault();
                            return;
                          }
                          onSelectClip?.(clip.id);
                        }}
                        onPointerDown={(ev) => onClipPointerDown(clip, ev)}
                        className={`daw-timeline__clip daw-timeline__clip--audio has-wave${selectedClipId === clip.id ? " is-selected" : ""}${isDragClip && dragging.moved ? " is-dragging" : ""}`}
                      >
                        <span className="daw-clip-name">{clip.name.replace(/\.[^.]+$/, "")}</span>
                        <ClipWaveform peaks={clip.waveformPeaks} color={clip.color} />
                      </button>
                    );
                  })}
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
