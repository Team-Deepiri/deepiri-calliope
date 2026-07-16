import { useState } from "react";

const BAR_W = 40;

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
};

type TimelineViewProps = {
  bpm: number;
  durationBars: number;
  sections: Array<{ name: string; startBar: number; bars: number; color: string }>;
  tracks: ArrangementTrack[];
  selectedTrackId: string | null;
  playheadBar: number;
  clips?: TimelineClip[];
  onFileDrop?: (trackId: string, file: File) => void;
  onSelectClip?: (clipId: string) => void;
};

export function TimelineView({
  durationBars,
  sections,
  tracks,
  selectedTrackId,
  playheadBar,
  clips = [],
  onFileDrop,
  onSelectClip,
}: TimelineViewProps) {
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  const totalWidth = durationBars * BAR_W;
  const playheadLeft = Math.max(0, (playheadBar - 1) * BAR_W);

  return (
    <div className="daw-timeline" style={{ ["--daw-bar-w" as string]: `${BAR_W}px` }}>
      <div className="daw-timeline__ruler-wrap">
        <div className="daw-timeline__ruler" style={{ width: totalWidth }}>
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
                      className="daw-timeline__clip daw-timeline__clip--audio"
                      style={{
                        left: clip.startBar * BAR_W,
                        width: Math.max(BAR_W * 0.5, clip.durationBars * BAR_W),
                        backgroundColor: clip.color,
                      }}
                      title={`${clip.name} · ${clip.durationBars.toFixed(2)} bars`}
                      onClick={() => onSelectClip?.(clip.id)}
                    >
                      {clip.name.replace(/\.[^.]+$/, "")}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="daw-timeline__playhead" style={{ left: playheadLeft }} />
        </div>
      </div>
    </div>
  );
}
