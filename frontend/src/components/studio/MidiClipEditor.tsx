import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Grid3X3, Ruler, Eraser, Pen, Trash2, AlignCenter,
} from "lucide-react";

interface Note {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

interface MidiClipEditorProps {
  notes: Note[];
  onNotesChange: (notes: Note[]) => void;
  scale?: string;
  timeDivision: number;
  isPlaying: boolean;
  currentPosition: number;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_PATTERNS: Record<string, number[]> = {
  "C Major": [0, 2, 4, 5, 7, 9, 11],
  "A Minor": [0, 2, 3, 5, 7, 8, 10],
  "G Major": [0, 2, 4, 5, 7, 9, 11],
  "E Minor": [0, 2, 3, 5, 7, 8, 10],
  "D Minor": [0, 2, 3, 5, 7, 8, 10],
  "F Major": [0, 2, 4, 5, 7, 9, 11],
  "Pentatonic Minor": [0, 3, 5, 7, 10],
  "Blues": [0, 3, 5, 6, 7, 10],
};

const SNAP_VALUES = ["1/4", "1/8", "1/16", "1/32"] as const;
const NOTE_LENGTHS = ["1/4", "1/8", "1/16", "1/32", "1/2", "1"] as const;

const PITCH_START = 36;
const PITCH_END = 96;
const PITCH_COUNT = PITCH_END - PITCH_START;
const GRID_COLS = 64;

function pitchToName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[pitch % 12]}${octave}`;
}

function getNoteLength(snap: string): number {
  switch (snap) {
    case "1/32": return 0.5;
    case "1/16": return 1;
    case "1/8": return 2;
    case "1/4": return 4;
    default: return 1;
  }
}

export function MidiClipEditor({
  notes, onNotesChange, scale = "C Major",
  timeDivision, isPlaying, currentPosition,
}: MidiClipEditorProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<typeof SNAP_VALUES[number]>("1/16");
  const [noteLength, setNoteLength] = useState<typeof NOTE_LENGTHS[number]>("1/16");
  const [tool, setTool] = useState<"draw" | "select" | "eraser">("draw");
  const [draggingNote, setDraggingNote] = useState<string | null>(null);
  const [pianoScroll, setPianoScroll] = useState(0);

  const scaleNotes = useMemo(() => {
    const root = NOTE_NAMES.indexOf(scale.split(" ")[0]);
    const pattern = SCALE_PATTERNS[scale] || [0, 2, 4, 5, 7, 9, 11];
    const set = new Set(pattern.map((s) => (root + s) % 12));
    return set;
  }, [scale]);

  const noteLenBeats = getNoteLength(noteLength);
  const snapBeats = getNoteLength(snap);

  const handleGridClick = useCallback((e: React.MouseEvent) => {
    if (tool === "select") return;
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const colWidth = rect.width / GRID_COLS;
    const rowHeight = rect.height / PITCH_COUNT;

    const col = Math.floor(x / colWidth);
    const row = Math.floor((y - pianoScroll) / rowHeight);

    if (row < 0 || row >= PITCH_COUNT || col < 0 || col >= GRID_COLS) return;

    const pitch = PITCH_END - 1 - row;
    const start = col * snapBeats;
    const snappedStart = Math.round(start / snapBeats) * snapBeats;

    if (tool === "eraser") {
      const newNotes = notes.filter((n) => {
        const noteOverlap = n.pitch === pitch && Math.abs(n.start - snappedStart) < snapBeats;
        return !noteOverlap;
      });
      onNotesChange(newNotes);
      return;
    }

    const existing = notes.findIndex(
      (n) => n.pitch === pitch && Math.abs(n.start - snappedStart) < snapBeats
    );

    if (existing >= 0) {
      const newNotes = [...notes];
      newNotes.splice(existing, 1);
      onNotesChange(newNotes);
    } else {
      const newNote: Note = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pitch,
        start: snappedStart,
        duration: noteLenBeats,
        velocity: 100,
      };
      onNotesChange([...notes, newNote]);
    }
  }, [tool, notes, onNotesChange, snapBeats, noteLenBeats, pianoScroll]);

  const handleNoteDrag = useCallback((noteId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingNote(noteId);
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const colWidth = rect.width / GRID_COLS;
    const rowHeight = rect.height / PITCH_COUNT;

    const startX = e.clientX;
    const startY = e.clientY;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / colWidth;
      const dy = (ev.clientY - startY) / rowHeight;
      const newStart = Math.max(0, Math.round((note.start + dx * snapBeats) / snapBeats) * snapBeats);
      const newPitch = Math.max(PITCH_START, Math.min(PITCH_END - 1, note.pitch - Math.round(dy)));

      const updated = notes.map((n) =>
        n.id === noteId ? { ...n, start: newStart, pitch: newPitch } : n
      );
      onNotesChange(updated);
    };

    const onUp = () => {
      setDraggingNote(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [notes, onNotesChange, snapBeats]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="midi-clip-editor bg-gray-950 rounded-2xl border border-gray-800 p-4 shadow-2xl"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">Piano Roll</span>
          {scale && (
            <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
              {scale}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Tools */}
          <button
            onClick={() => setTool("draw")}
            className={`p-1.5 rounded transition-all ${
              tool === "draw" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
            title="Draw Tool (D)"
          >
            <Pen size={12} />
          </button>
          <button
            onClick={() => setTool("select")}
            className={`p-1.5 rounded transition-all ${
              tool === "select" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
            title="Select Tool (S)"
          >
            <AlignCenter size={12} />
          </button>
          <button
            onClick={() => setTool("eraser")}
            className={`p-1.5 rounded transition-all ${
              tool === "eraser" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
            title="Eraser (E)"
          >
            <Eraser size={12} />
          </button>

          <div className="w-px h-4 bg-gray-800 mx-1" />

          {/* Snap */}
          <select
            value={snap}
            onChange={(e) => setSnap(e.target.value as typeof SNAP_VALUES[number])}
            className="bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-400 px-1.5 py-1 outline-none"
            title="Snap to Grid"
          >
            {SNAP_VALUES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Note length */}
          <select
            value={noteLength}
            onChange={(e) => setNoteLength(e.target.value as typeof NOTE_LENGTHS[number])}
            className="bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-400 px-1.5 py-1 outline-none"
            title="Note Length"
          >
            {NOTE_LENGTHS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* Quantize */}
          <button
            onClick={() => {
              const quantized = notes.map((n) => ({
                ...n,
                start: Math.round(n.start / snapBeats) * snapBeats,
              }));
              onNotesChange(quantized);
            }}
            className="px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-white text-[10px] font-bold transition-all"
            title="Quantize Notes (Q)"
          >
            <Grid3X3 size={12} />
          </button>

          {/* Clear */}
          <button
            onClick={() => onNotesChange([])}
            className="p-1.5 rounded bg-gray-800 text-gray-500 hover:text-red-400 transition-all"
            title="Clear All Notes"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex border border-gray-800 rounded-xl overflow-hidden bg-gray-900">
        {/* Piano keyboard */}
        <div
          className="piano-keys w-12 bg-gray-950 border-r border-gray-800 overflow-hidden"
          onWheel={(e) => setPianoScroll((prev) => Math.max(0, prev + e.deltaY))}
        >
          {Array.from({ length: PITCH_COUNT }, (_, i) => {
            const pitch = PITCH_END - 1 - i;
            const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
            const isInScale = scaleNotes.has(pitch % 12);
            const noteName = pitchToName(pitch);

            return (
              <div
                key={pitch}
                className={`flex items-center justify-center text-[7px] font-mono border-b border-gray-800/50 ${
                  isBlack ? "bg-gray-900 text-gray-600" : "bg-gray-950 text-gray-500"
                } ${isInScale ? "text-green-500 font-bold" : ""}`}
                style={{ height: `${100 / PITCH_COUNT}%`, minHeight: 16 }}
              >
                {noteName}
              </div>
            );
          })}
        </div>

        {/* Note grid */}
        <div
          ref={gridRef}
          className="note-grid flex-1 relative overflow-hidden cursor-crosshair"
          style={{ height: PITCH_COUNT * 16 }}
          onClick={handleGridClick}
        >
          {/* Grid lines */}
          {Array.from({ length: GRID_COLS }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-gray-800/30"
              style={{ left: `${(i / GRID_COLS) * 100}%`, width: 0 }}
            />
          ))}

          {/* Beat divisions */}
          {Array.from({ length: GRID_COLS / 4 }, (_, i) => (
            <div
              key={`beat_${i}`}
              className="absolute top-0 bottom-0 border-l border-gray-700/40"
              style={{ left: `${(i * 4 / GRID_COLS) * 100}%`, width: 0 }}
            />
          ))}

          {/* Scale highlights */}
          {Array.from({ length: PITCH_COUNT }, (_, i) => {
            const pitch = PITCH_END - 1 - i;
            const isInScale = scaleNotes.has(pitch % 12);
            if (!isInScale) return null;
            return (
              <div
                key={`scale_${pitch}`}
                className="absolute left-0 right-0 bg-green-500/5"
                style={{
                  top: `${i / PITCH_COUNT * 100}%`,
                  height: `${100 / PITCH_COUNT}%`,
                }}
              />
            );
          })}

          {/* Playhead */}
          {isPlaying && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 shadow-lg shadow-red-500/30"
              style={{ left: `${(currentPosition / GRID_COLS) * 100}%` }}
            />
          )}

          {/* Notes */}
          {notes.map((note) => {
            const top = ((PITCH_END - 1 - note.pitch) / PITCH_COUNT) * 100;
            const left = (note.start / GRID_COLS) * 100;
            const width = (note.duration / GRID_COLS) * 100;
            const height = (1 / PITCH_COUNT) * 100;

            return (
              <div
                key={note.id}
                className={`absolute rounded-sm cursor-grab active:cursor-grabbing transition-shadow ${
                  draggingNote === note.id ? "shadow-lg shadow-blue-500/40 z-20" : "z-10"
                }`}
                style={{
                  top: `${top}%`,
                  left: `${left}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  backgroundColor: `hsl(${220 + note.velocity * 0.3}, 70%, ${40 + note.velocity * 0.15}%)`,
                  borderLeft: "2px solid rgba(255,255,255,0.2)",
                }}
                onPointerDown={(e) => handleNoteDrag(note.id, e)}
                title={`${pitchToName(note.pitch)} - Vel: ${note.velocity}`}
              />
            );
          })}
        </div>
      </div>

      {/* Velocity lane */}
      <div className="mt-2 pt-2 border-t border-gray-800/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-gray-500 font-bold uppercase">Velocity</span>
          <span className="text-[8px] font-mono text-gray-600">
            {notes.length > 0 ? Math.round(notes.reduce((a, n) => a + n.velocity, 0) / notes.length) : 0} avg
          </span>
        </div>
        <div className="flex items-end gap-[1px] h-10 bg-gray-900 rounded-lg border border-gray-800/50 p-0.5">
          {notes.length > 0 ? (
            notes.map((note) => (
              <div
                key={note.id}
                className="flex-1 rounded-t-sm relative group cursor-pointer"
                style={{
                  height: `${(note.velocity / 127) * 100}%`,
                  backgroundColor: `hsl(${220 + note.velocity * 0.3}, 70%, 50%)`,
                }}
                onClick={() => {
                  const newVel = note.velocity >= 127 ? 1 : Math.min(127, note.velocity + 20);
                  const updated = notes.map((n) =>
                    n.id === note.id ? { ...n, velocity: newVel } : n
                  );
                  onNotesChange(updated);
                }}
                title={`Vel: ${note.velocity}`}
              >
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[7px] font-mono text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  {note.velocity}
                </div>
              </div>
            ))
          ) : (
            <div className="w-full text-center text-[8px] text-gray-700 self-center">No notes</div>
          )}
        </div>
      </div>

      {/* MIDI CC lane placeholder */}
      <div className="mt-2 pt-2 border-t border-gray-800/50">
        <div className="flex items-center gap-2">
          <Ruler size={10} className="text-gray-600" />
          <span className="text-[9px] text-gray-600 font-bold uppercase">CC Lane</span>
          <select className="bg-gray-800 border border-gray-700 rounded text-[9px] text-gray-400 px-1.5 py-0.5 outline-none">
            <option>Mod Wheel (CC 1)</option>
            <option>Expression (CC 11)</option>
            <option>Breath (CC 2)</option>
            <option>Volume (CC 7)</option>
            <option>Sustain (CC 64)</option>
          </select>
        </div>
      </div>
    </motion.div>
  );
}
