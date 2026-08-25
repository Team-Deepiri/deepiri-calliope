import React, { useState, useCallback, useRef, useEffect } from "react";
import { MousePointer2, Eraser, Scissors, Music } from "lucide-react";

export type PianoNote = {
  id: string;
  midi: number;
  start: number;
  duration: number;
  velocity?: number;
};

type Props = {
  notes: PianoNote[];
  onChange: (notes: PianoNote[]) => void;
  totalBars?: number;
  rootMidi?: number;
  octaveCount?: number;
  onNotePreview?: (midi: number, on: boolean) => void;
};

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function PianoRoll({
  notes,
  onChange,
  totalBars = 8,
  rootMidi = 48,
  octaveCount = 4,
  onNotePreview,
}: Props) {
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [zoom, setZoom] = useState(1);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const totalRows = octaveCount * 12;
  const stepsPerBar = 4;
  const totalCols = totalBars * stepsPerBar;
  const rowHeight = 18;
  const colWidth = 36 * zoom;

  const midiFromRow = useCallback(
    (row: number) => rootMidi + (totalRows - 1 - row),
    [rootMidi, totalRows],
  );

  const rowFromMidi = useCallback(
    (midi: number) => totalRows - 1 - (midi - rootMidi),
    [rootMidi, totalRows],
  );

  const handleMouseDown = useCallback(
    (row: number, col: number) => {
      const midi = midiFromRow(row);
      if (tool === "erase") {
        onChange(notes.filter((n) => !(n.midi === midi && col >= n.start && col < n.start + n.duration)));
        return;
      }
      const existing = notes.find((n) => n.midi === midi && col >= n.start && col < n.start + n.duration);
      if (existing) {
        onChange(notes.filter((n) => n.id !== existing.id));
        return;
      }
      setDragStart({ row, col });
      onNotePreview?.(midi, true);
    },
    [tool, notes, onChange, midiFromRow, onNotePreview],
  );

  const handleMouseUp = useCallback(() => {
    if (!dragStart) return;
    const midi = midiFromRow(dragStart.row);
    const newNote: PianoNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      midi,
      start: dragStart.col,
      duration: 1,
      velocity: 100,
    };
    onChange([...notes, newNote]);
    onNotePreview?.(midi, false);
    setDragStart(null);
  }, [dragStart, notes, onChange, midiFromRow, onNotePreview]);

  useEffect(() => {
    const up = () => {
      if (dragStart) {
        onNotePreview?.(midiFromRow(dragStart.row), false);
        setDragStart(null);
      }
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [dragStart, midiFromRow, onNotePreview]);

  return (
    <div className="piano-roll">
      <div className="piano-roll-toolbar">
        <div className="piano-roll-toolbar__left">
          <div className="piano-roll-tools">
            <button
              className={`btn-icon ${tool === "draw" ? "btn-icon--active" : ""}`}
              onClick={() => setTool("draw")}
              title="Draw (D)"
            >
              <MousePointer2 size={14} />
            </button>
            <button
              className={`btn-icon ${tool === "erase" ? "btn-icon--active" : ""}`}
              onClick={() => setTool("erase")}
              title="Erase (E)"
            >
              <Eraser size={14} />
            </button>
          </div>
          <span className="piano-roll-label">
            <Music size={12} /> Piano Roll · {notes.length} notes
          </span>
        </div>
        <div className="piano-roll-toolbar__right">
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="piano-roll-zoom"
          />
          <span className="piano-roll-zoom-label">{zoom.toFixed(1)}×</span>
        </div>
      </div>

      <div className="piano-roll-container" ref={gridRef}>
        <div className="piano-keys">
          {Array.from({ length: totalRows }).map((_, i) => {
            const midi = midiFromRow(i);
            const isBlack = BLACK_KEYS.has(midi % 12);
            const isC = midi % 12 === 0;
            return (
              <div
                key={i}
                className={`piano-key ${isBlack ? "piano-key--black" : "piano-key--white"} ${isC ? "piano-key--c" : ""}`}
                style={{ height: rowHeight }}
              >
                <span>{isC || midi % 12 === 4 ? midiName(midi) : ""}</span>
              </div>
            );
          })}
        </div>

        <div
          className="piano-grid"
          style={{ width: totalCols * colWidth, height: totalRows * rowHeight }}
          onMouseUp={handleMouseUp}
        >
          {Array.from({ length: totalRows }).map((_, row) =>
            Array.from({ length: totalCols }).map((_, col) => {
              const isBlackRow = BLACK_KEYS.has(midiFromRow(row) % 12);
              const isBar = col % stepsPerBar === 0;
              return (
                <div
                  key={`${row}-${col}`}
                  className={`piano-cell ${isBlackRow ? "piano-cell--black" : ""} ${isBar ? "piano-cell--bar" : ""}`}
                  style={{ width: colWidth, height: rowHeight, left: col * colWidth, top: row * rowHeight }}
                  onMouseDown={() => handleMouseDown(row, col)}
                  onMouseEnter={() => setHoveredNote(`${row}-${col}`)}
                />
              );
            }),
          )}

          {notes.map((note) => {
            const row = rowFromMidi(note.midi);
            if (row < 0 || row >= totalRows) return null;
            const vel = (note.velocity ?? 100) / 127;
            return (
              <div
                key={note.id}
                className={`piano-note ${hoveredNote === `${row}-${note.start}` ? "piano-note--hover" : ""}`}
                style={{
                  top: row * rowHeight + 1,
                  left: note.start * colWidth + 1,
                  width: note.duration * colWidth - 2,
                  height: rowHeight - 2,
                  opacity: 0.5 + vel * 0.5,
                }}
                title={`${midiName(note.midi)} · vel ${(vel * 127).toFixed(0)} · ${note.duration} steps`}
              />
            );
          })}

          {dragStart && (
            <div
              className="piano-note piano-note--preview"
              style={{
                top: dragStart.row * rowHeight + 1,
                left: dragStart.col * colWidth + 1,
                width: colWidth - 2,
                height: rowHeight - 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
