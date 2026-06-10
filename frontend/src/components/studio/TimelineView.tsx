import React, { useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Play, Square, SkipBack, SkipForward, 
  RotateCcw, Music, Volume2, Disc3, 
  ChevronRight, ChevronDown, Circle, GripVertical,
  ZoomIn, ZoomOut, Grid3X3, 
} from "lucide-react";

interface ClipData {
  id: string;
  name: string;
  clipType: "audio" | "midi" | "automation";
  startBar: number;
  durationBars: number;
  color: string;
  muted: boolean;
  gain: number;
}

interface TrackData {
  id: string;
  name: string;
  type: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  automationArmed: boolean;
  color: string;
  clips: ClipData[];
  automationLanes: AutomationLaneData[];
  groupId?: string;
  groupExpanded?: boolean;
}

interface ArrangementMarkerData {
  id: string;
  name: string;
  bar: number;
  color: string;
}

interface TimelineViewProps {
  bpm: number;
  durationBars: number;
  sections: Array<{ name: string; startBar: number; bars: number; color: string }>;
  tracks: Array<{
    id: string;
    name: string;
    type: string;
    volume?: number;
    pan?: number;
    muted?: boolean;
    solo?: boolean;
    armed?: boolean;
    color?: string;
  }>;
  onUpdateTrack?: (trackId: string, updates: Record<string, unknown>) => void;
}

type SnapMode = "off" | "bar" | "beat";

export function TimelineView({
  bpm,
  durationBars,
  sections,
  tracks,
  onUpdateTrack,
}: TimelineViewProps) {
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snapMode, setSnapMode] = useState<SnapMode>("bar");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  const barWidth = 80 * zoom;
  const trackHeaderWidth = 180;
  const totalWidth = durationBars * barWidth;
  const beatsPerBar = 4;
  const beatWidth = barWidth / beatsPerBar;

  const trackData: TrackData[] = useMemo(() => tracks.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    volume: t.volume ?? 0,
    pan: t.pan ?? 0,
    muted: t.muted ?? false,
    solo: t.solo ?? false,
    armed: t.armed ?? false,
    automationArmed: false,
    color: t.color ?? "#8b5cf6",
    clips: [],
    automationLanes: [],
  })), [tracks]);

  const groupTracks = trackData.filter(t => t.type === "group");
  const regularTracks = trackData.filter(t => t.type !== "group" || expandedGroups.has(t.id));

  const snapToGrid = useCallback((bar: number): number => {
    if (snapMode === "off") return bar;
    if (snapMode === "beat") return Math.round(bar * beatsPerBar) / beatsPerBar;
    return Math.round(bar);
  }, [snapMode, beatsPerBar]);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const bar = x / barWidth;
    setPlayhead(snapToGrid(bar));
  }, [barWidth, scrollLeft, snapToGrid]);

  const handleScroll = useCallback((e: React.UIEvent) => {
    setScrollLeft((e.target as HTMLDivElement).scrollLeft);
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const formatBarsBeats = (bar: number): string => {
    const b = Math.floor(bar) + 1;
    const beat = Math.round((bar % 1) * beatsPerBar) + 1;
    return `${b}.${beat}`;
  };

  const formatTime = (bar: number): string => {
    const secondsPerBeat = 60 / bpm;
    const totalSec = bar * beatsPerBar * secondsPerBeat;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="timeline-view bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Transport Bar */}
      <div className="transport-bar flex items-center gap-2 p-3 border-b border-gray-800 bg-gray-950/80">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setPlayhead(0); setIsPlaying(false); }}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Go to start"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-md transition-all ${
              isPlaying ? "bg-green-600 text-white shadow-lg shadow-green-600/30" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
            title="Play/Stop"
          >
            {isPlaying ? <Square size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={() => { setPlayhead(durationBars); setIsPlaying(false); }}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Go to end"
          >
            <SkipForward size={16} />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-800 mx-1" />

        <button
          onClick={() => setIsRecording(!isRecording)}
          className={`p-2 rounded-md transition-all ${
            isRecording ? "bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
          title="Record"
        >
          <Circle size={16} />
        </button>

        <button
          onClick={() => setLoopEnabled(!loopEnabled)}
          className={`p-1.5 rounded-md transition-colors ${
            loopEnabled ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
          title="Toggle loop"
        >
          <RotateCcw size={14} />
        </button>

        <div className="w-px h-6 bg-gray-800 mx-1" />

        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="text-yellow-500 font-bold">{formatBarsBeats(playhead)}</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{formatTime(playhead)}</span>
        </div>

        <div className="flex-1" />

        {/* Snap mode */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setSnapMode("off")}
            className={`p-1.5 rounded-md text-[10px] font-bold transition-colors ${snapMode === "off" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            <Grid3X3 size={12} />
          </button>
          <button
            onClick={() => setSnapMode("beat")}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${snapMode === "beat" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
          >
            1/4
          </button>
          <button
            onClick={() => setSnapMode("bar")}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${snapMode === "bar" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
             title="Snap to bar"
          >
            1/1
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-20 h-1 bg-gray-800 appearance-none rounded-full cursor-pointer"
          />
          <button
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="timeline-body flex" style={{ height: "400px" }}>
        {/* Track headers column */}
        <div className="track-headers shrink-0 bg-gray-950 border-r border-gray-800 overflow-y-auto custom-scrollbar" style={{ width: trackHeaderWidth }}>
          {trackData.map((track) => (
            <React.Fragment key={track.id}>
              <div
                className="track-header flex flex-col justify-center px-3 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group"
                style={{ height: track.type === "group" ? 40 : 80 }}
              >
                {track.type === "group" ? (
                  <button
                    onClick={() => toggleGroup(track.id)}
                    className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
                  >
                    {expandedGroups.has(track.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: track.color }} />
                    <span className="text-sm font-bold uppercase tracking-wider">{track.name}</span>
                  </button>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <GripVertical size={12} className="text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                      <div
                        className="w-2.5 h-2.5 rounded-sm cursor-pointer shrink-0"
                        style={{ backgroundColor: track.color }}
                        onClick={() => onUpdateTrack?.(track.id, { color: "#" + Math.floor(Math.random() * 16777215).toString(16) })}
                      />
                      <span
                        className="text-xs font-bold text-gray-300 truncate cursor-pointer hover:text-white transition-colors"
                        onClick={() => onUpdateTrack?.(track.id, { name: prompt("Track name:", track.name) || track.name })}
                      >
                        {track.name}
                      </span>
                      {track.armed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Armed" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onUpdateTrack?.(track.id, { muted: !track.muted })}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                          track.muted ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        M
                      </button>
                      <button
                        onClick={() => onUpdateTrack?.(track.id, { solo: !track.solo })}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                          track.solo ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        S
                      </button>
                      <button
                        onClick={() => onUpdateTrack?.(track.id, { armed: !track.armed })}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                          track.armed ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        R
                      </button>
                      <button
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                          track.automationArmed ? "bg-green-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
                        onClick={() => onUpdateTrack?.(track.id, { automationArmed: !track.automationArmed })}
                      >
                        A
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Volume2 size={10} className="text-gray-600" />
                      <input
                        type="range"
                        min="-60"
                        max="6"
                        step="0.5"
                        value={track.volume}
                        onChange={(e) => onUpdateTrack?.(track.id, { volume: parseFloat(e.target.value) })}
                        className="w-16 h-0.5 bg-gray-800 appearance-none rounded-full cursor-pointer"
                      />
                      <span className="text-[9px] font-mono text-gray-500 w-8 text-right">
                        {track.volume > 0 ? "+" : ""}{track.volume.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Disc3 size={10} className="text-gray-600" />
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={track.pan}
                        onChange={(e) => onUpdateTrack?.(track.id, { pan: parseFloat(e.target.value) })}
                        className="w-16 h-0.5 bg-gray-800 appearance-none rounded-full cursor-pointer"
                      />
                      <span className="text-[9px] font-mono text-gray-500 w-8 text-right">
                        {track.pan > 0 ? "R" : track.pan < 0 ? "L" : "C"}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {track.type === "group" && !expandedGroups.has(track.id) && (
                <div className="h-6 bg-gray-950/50 border-b border-gray-800/30 flex items-center px-4">
                  <span className="text-[10px] text-gray-600 italic">{track.name} collapsed ({trackData.filter(t => t.groupId === track.id).length} tracks)</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Timeline area */}
        <div
          ref={timelineRef}
          className="timeline-area flex-1 overflow-auto custom-scrollbar relative"
          onScroll={handleScroll}
        >
          {/* Time ruler */}
          <div
            className="time-ruler sticky top-0 z-20 bg-gray-950 border-b border-gray-800 flex shrink-0 h-8"
            style={{ width: totalWidth }}
          >
            {Array.from({ length: durationBars }).map((_, i) => {
              const isBeatBar = i % 4 === 0;
              return (
                <div
                  key={i}
                  className="flex items-end border-l border-gray-800/50 shrink-0"
                  style={{ width: barWidth }}
                >
                  {isBeatBar && (
                    <span className="text-[9px] text-gray-500 font-mono pl-1 pb-1">
                      {Math.floor(i / 4) + 1}
                    </span>
                  )}
                  {Array.from({ length: beatsPerBar }).map((_, b) => (
                    <div
                      key={b}
                      className="h-2 border-l border-gray-800/20"
                      style={{ width: beatWidth }}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Tracks */}
          <div
            className="tracks-area relative"
            style={{ width: totalWidth }}
            onClick={handleTimelineClick}
          >
            {/* Section Markers */}
            {sections.map((section, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-0 z-10 h-full pointer-events-none"
                style={{
                  left: section.startBar * barWidth,
                  width: section.bars * barWidth,
                  backgroundColor: section.color,
                }}
              >
                <span className="absolute top-1 left-2 text-[9px] font-bold uppercase tracking-wider text-white/50">
                  {section.name}
                </span>
              </motion.div>
            ))}

            {/* Track rows */}
            {regularTracks.map((track) => (
              <div
                key={track.id}
                className="track-row relative border-b border-gray-800/30"
                style={{ height: 80 }}
              >
                {/* Clip placeholders */}
                {track.clips.length === 0 && (
                  <div className="absolute inset-2 rounded-md border border-dashed border-gray-800/40 flex items-center justify-center">
                    <span className="text-[10px] text-gray-700 italic">Drop clips here</span>
                  </div>
                )}
                {track.clips.map((clip) => (
                  <motion.div
                    key={clip.id}
                    initial={{ opacity: 0, scaleX: 0.95 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }}
                    className={`absolute top-1 bottom-1 rounded-md border cursor-pointer transition-shadow flex items-center px-2 overflow-hidden ${
                      selectedClipId === clip.id
                        ? "border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.3)]"
                        : "border-transparent hover:border-white/20"
                    }`}
                    style={{
                      left: clip.startBar * barWidth,
                      width: clip.durationBars * barWidth,
                      backgroundColor: clip.color + "40",
                      opacity: clip.muted ? 0.4 : 1,
                    }}
                  >
                    {clip.clipType === "midi" ? (
                      <Music size={12} className="text-white/60 mr-1 shrink-0" />
                    ) : (
                      <div className="w-1 h-full rounded-full bg-white/20 mr-2 shrink-0" />
                    )}
                    <span className="text-[10px] font-bold text-white/70 truncate">{clip.name}</span>
                  </motion.div>
                ))}
              </div>
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] z-20 pointer-events-none"
              style={{ left: playhead * barWidth }}
            >
              <div className="w-3 h-3 bg-yellow-500 rounded-full -ml-[5px] -mt-[1px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
