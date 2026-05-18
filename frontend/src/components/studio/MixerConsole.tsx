import React from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX, Headphones, Sliders } from "lucide-react";

interface MixerTrack {
  id: string;
  name: string;
  volume: number; // dB
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  color: string;
}

interface MixerConsoleProps {
  tracks: MixerTrack[];
  onUpdateTrack: (trackId: string, updates: Partial<MixerTrack>) => void;
}

export function MixerConsole({ tracks, onUpdateTrack }: MixerConsoleProps) {
  return (
    <div className="mixer-console bg-gray-950 p-6 rounded-2xl border border-gray-800 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Sliders className="w-6 h-6 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-100 tracking-tight">Mixer Console</h2>
        </div>
        <div className="text-xs font-mono text-gray-500 bg-gray-900 px-3 py-1 rounded-full border border-gray-800">
          Master Output: -0.3 dBFS
        </div>
      </div>

      <div className="mixer-strips-container flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
        {tracks.map((track) => (
          <div key={track.id} className="mixer-strip flex flex-col items-center w-24 shrink-0 bg-gray-900/50 rounded-xl p-3 border border-gray-800/50 hover:bg-gray-900 transition-colors group">
            {/* VU Meter Placeholder */}
            <div className="vu-meter w-3 h-32 bg-gray-800 rounded-full mb-4 relative overflow-hidden">
              <div 
                className="absolute bottom-0 w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                style={{ height: `${60 + Math.random() * 20}%` }}
              />
            </div>

            {/* Fader */}
            <div className="fader-container relative h-40 w-8 flex items-center justify-center mb-4">
              <div className="w-1 h-full bg-gray-800 rounded-full" />
              <input
                type="range"
                min="-60"
                max="6"
                step="0.1"
                value={track.volume}
                onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                className="absolute w-40 h-1 -rotate-90 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:shadow-lg"
              />
            </div>

            {/* Controls */}
            <div className="controls flex flex-col gap-3 w-full">
              <div className="flex justify-between gap-1">
                <button
                  onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                  className={`flex-1 p-2 rounded-lg text-xs font-bold transition-all ${
                    track.muted ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => onUpdateTrack(track.id, { solo: !track.solo })}
                  className={`flex-1 p-2 rounded-lg text-xs font-bold transition-all ${
                    track.solo ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  S
                </button>
              </div>

              {/* Pan Knob (Simplified) */}
              <div className="flex flex-col items-center gap-1">
                <div className="text-[10px] text-gray-600 uppercase font-bold">Pan</div>
                <div 
                  className="w-8 h-8 rounded-full border-2 border-gray-700 relative cursor-pointer group-hover:border-blue-500/50 transition-colors"
                  style={{ transform: `rotate(${track.pan * 90}deg)` }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-blue-500" />
                </div>
              </div>

              {/* Track Name */}
              <div className="text-[10px] text-center font-bold text-gray-500 uppercase truncate group-hover:text-blue-400 transition-colors">
                {track.name}
              </div>
            </div>
            
            <div className="w-full h-1 mt-3 rounded-full" style={{ backgroundColor: track.color }} />
          </div>
        ))}

        {/* Master Fader */}
        <div className="mixer-strip flex flex-col items-center w-24 shrink-0 bg-gray-900 rounded-xl p-3 border-2 border-blue-900/30">
           <div className="vu-meter w-4 h-32 bg-gray-800 rounded-full mb-4 relative overflow-hidden">
              <div className="absolute bottom-0 w-full bg-blue-500 opacity-20 h-full" />
              <div className="absolute bottom-0 w-full bg-blue-500 h-[75%]" />
            </div>
            <div className="fader-container relative h-40 w-8 flex items-center justify-center mb-4">
              <div className="w-1.5 h-full bg-gray-800 rounded-full" />
              <div className="absolute w-8 h-4 bg-white rounded-sm shadow-xl top-1/4" />
            </div>
            <div className="text-[10px] text-center font-black text-blue-500 uppercase mt-auto">Master</div>
        </div>
      </div>
    </div>
  );
}
