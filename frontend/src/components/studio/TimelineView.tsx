import { useState } from "react";
import type { RecordingFile } from "../../types/audio";

const BAR_W = 40;

export type ArrangementTrack = {
  id: string;
  name: string;
  type: string;
  color: string;
};

type TimelineViewProps = {
  bpm: number;
  durationBars: number;
  sections: Array<{ name: string; startBar: number; bars: number; color: string }>;
  tracks: ArrangementTrack[];
  selectedTrackId: string | null;
  playheadBar: number;
  vocalTakes?: RecordingFile[];
  onFileDrop?: (trackId: string, file: File) => void;
};

export function TimelineView({
  durationBars,
  sections,
  tracks,
  selectedTrackId,
  playheadBar,
  vocalTakes = [],
  onFileDrop,
}: TimelineViewProps) {
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  const totalWidth = durationBars * BAR_W;
  const playheadLeft = playheadBar * BAR_W;

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
          {tracks.map((track) => (
            <div
              key={track.id}
              className={`daw-timeline__lane${dragOverTrack === track.id ? " is-drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverTrack(track.id); }}
              onDragLeave={() => setDragOverTrack(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTrack(null);
                const file = Array.from(e.dataTransfer.files).find(
                  (f) => f.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(f.name)
                );
                if (file) onFileDrop?.(track.id, file);
              }}
            >
              <div className="daw-timeline__lane-bg">
                {sections.map((section, idx) => (
                  <div
                    key={`${track.id}-${idx}`}
                    className="daw-timeline__clip"
                    style={{
                      left: section.startBar * BAR_W,
                      width: section.bars * BAR_W,
                      backgroundColor: section.color,
                    }}
                  >
                    {track.type === "vocal" ? "" : section.name}
                  </div>
                ))}
                {track.type === "vocal" &&
                  vocalTakes.map((take, i) => (
                    <div
                      key={take.id}
                      className="daw-timeline__clip daw-timeline__clip--vocal"
                      style={{
                        left: (4 + i * 6) * BAR_W,
                        width: Math.max(3, Math.min(8, Math.ceil(take.duration_sec / 2))) * BAR_W,
                      }}
                      title={take.filename}
                    >
                      {take.filename.replace(/\.[^.]+$/, "")}
                    </div>
                  ))}
              </div>
            </div>
          ))}
          <div className="daw-timeline__playhead" style={{ left: playheadLeft }} />
        </div>
      </div>
    </div>
  );
}
