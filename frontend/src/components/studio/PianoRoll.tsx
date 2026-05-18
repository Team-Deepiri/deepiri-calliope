import React, { useState } from "react";
import { motion } from "framer-motion";
import { Music, MousePointer2, Eraser, Plus } from "lucide-react";

interface Note {
  id: string;
  midi: number;
  start: number;
  duration: number;
}

export function PianoRoll() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [zoom, setZoom] = useState(1);

  const rowHeight = 20;
  const colWidth = 40 * zoom;
  const totalRows = 24; // 2 octaves
  const totalCols = 32; // 8 bars (16th notes)
  const rootMidi = 60; // Middle C

  const handleCellClick = (row: number, col: number) => {
    const midi = rootMidi + (totalRows / 2 - row);
    if (tool === "draw") {
      const newNote: Note = {
        id: Math.random().toString(36).substr(2, 9),
        midi,
        start: col,
        duration: 1,
      };
      setNotes([...notes, newNote]);
    } else {
      setNotes(notes.filter((n) => !(n.midi === midi && n.start === col)));
    }
  };

  return (
    <div className="piano-roll bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
      <div className="piano-roll-toolbar flex items-center justify-between p-4 bg-gray-900/50 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setTool("draw")}
              className={`p-2 rounded-md transition-colors ${tool === "draw" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              <MousePointer2 size={16} />
            </button>
            <button
              onClick={() => setTool("erase")}
              className={`p-2 rounded-md transition-colors ${tool === "erase" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              <Eraser size={16} />
            </button>
          </div>
          <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Piano Roll</span>
        </div>
        <div className="flex items-center gap-2">
           <input 
             type="range" 
             min="0.5" 
             max="2" 
             step="0.1" 
             value={zoom} 
             onChange={(e) => setZoom(parseFloat(e.target.value))}
             className="w-24 h-1 bg-gray-800 appearance-none rounded-full"
           />
        </div>
      </div>

      <div className="piano-roll-container flex overflow-auto custom-scrollbar h-[400px]">
        {/* Keys */}
        <div className="piano-keys sticky left-0 z-20 bg-gray-900 border-r border-gray-800 w-16">
          {Array.from({ length: totalRows }).map((_, i) => {
            const midi = rootMidi + (totalRows / 2 - i);
            const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
            return (
              <div
                key={i}
                className={`h-[20px] flex items-center justify-end pr-2 text-[10px] font-bold border-b border-gray-800/50 ${isBlack ? "bg-black text-gray-600" : "bg-white text-gray-400"}`}
                style={{ height: rowHeight }}
              >
                {midi % 12 === 0 ? `C${Math.floor(midi / 12) - 1}` : ""}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="piano-grid relative" style={{ width: totalCols * colWidth, height: totalRows * rowHeight }}>
          {Array.from({ length: totalRows }).map((_, row) => (
            <div key={row} className="flex border-b border-gray-800/30">
              {Array.from({ length: totalCols }).map((_, col) => (
                <div
                  key={col}
                  onClick={() => handleCellClick(row, col)}
                  className={`border-r border-gray-800/30 hover:bg-white/5 transition-colors cursor-crosshair ${col % 4 === 0 ? "border-r-gray-700" : ""}`}
                  style={{ width: colWidth, height: rowHeight }}
                />
              ))}
            </div>
          ))}

          {/* Notes */}
          {notes.map((note) => {
            const row = totalRows / 2 - (note.midi - rootMidi);
            return (
              <motion.div
                key={note.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute bg-blue-500 rounded-sm border border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] z-10"
                style={{
                  top: row * rowHeight,
                  left: note.start * colWidth,
                  width: note.duration * colWidth,
                  height: rowHeight - 2,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
