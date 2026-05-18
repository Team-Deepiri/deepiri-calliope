import React from "react";
import { motion } from "framer-motion";
import { Clock, Layers } from "lucide-react";

interface TimelineViewProps {
  bpm: number;
  durationBars: number;
  sections: Array<{ name: string; startBar: number; bars: number; color: string }>;
  tracks: Array<{ id: string; name: string; type: string }>;
}

export function TimelineView({ bpm, durationBars, sections, tracks }: TimelineViewProps) {
  const barWidth = 40; // Pixels per bar
  const totalWidth = durationBars * barWidth;

  return (
    <div className="timeline-view bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="timeline-header flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-500" />
          <span className="font-bold text-gray-200">Arrangement</span>
          <span className="text-xs text-gray-500 ml-2">{bpm} BPM · {durationBars} Bars</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-xs text-gray-400">Intro</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-xs text-gray-400">Drop</span>
          </div>
        </div>
      </div>

      <div className="timeline-container relative overflow-x-auto p-4 custom-scrollbar">
        {/* Ruler */}
        <div className="timeline-ruler flex mb-2" style={{ width: totalWidth }}>
          {Array.from({ length: durationBars }).map((_, i) => (
            <div
              key={i}
              className="text-[10px] text-gray-600 border-l border-gray-800 h-4 pl-1"
              style={{ width: barWidth }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Tracks Area */}
        <div className="tracks-stack space-y-2" style={{ width: totalWidth }}>
          {tracks.map((track) => (
            <div key={track.id} className="track-row flex items-center group">
              <div className="track-label w-32 shrink-0 text-sm font-medium text-gray-400 group-hover:text-white transition-colors">
                {track.name}
              </div>
              <div className="track-content relative h-12 flex-grow bg-gray-800/30 rounded-md border border-gray-800/50">
                {/* Render sections as blocks for now */}
                {sections.map((section, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute h-full rounded-sm border-x border-gray-900/20 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white/50"
                    style={{
                      left: section.startBar * barWidth,
                      width: section.bars * barWidth,
                      backgroundColor: section.color,
                    }}
                  >
                    {section.name}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Playhead Placeholder */}
        <div 
          className="absolute top-0 bottom-0 w-px bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] z-10 pointer-events-none"
          style={{ left: 160 }} // Example position
        />
      </div>
    </div>
  );
}
