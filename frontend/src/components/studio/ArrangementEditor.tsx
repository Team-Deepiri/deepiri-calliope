import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun, Moon, Cloud, Star, Flame, Sigma,
  ZoomIn, ZoomOut, Maximize2,   FolderOpen,
  RefreshCw,
} from "lucide-react";
import { ClipContextMenu, type ContextMenuAction } from "./ClipContextMenu";
import { AudioClipEditor } from "./AudioClipEditor";
import { MidiClipEditor } from "./MidiClipEditor";
import { ClipWaveform } from "./TimelineView";

interface ArrangementTrack {
  id: string;
  name: string;
  type: string;
  color: string;
  height: number;
  parentId?: string;
}

export interface ArrangementClip {
  id: string;
  trackId: string;
  name: string;
  startBar: number;
  duration: number;
  color: string;
  type: string;
  loop?: boolean;
  gain?: number;
  pan?: number;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  pitchShift?: number;
  timeStretch?: number;
  notes?: Array<{ pitch: number; start: number; duration: number; velocity: number }>;
  waveformPeaks?: number[];
  parentId?: string;
}

interface Section {
  name: string;
  startBar: number;
  bars: number;
  color: string;
}

interface ArrangementEditorProps {
  tracks: ArrangementTrack[];
  clips: ArrangementClip[];
  sections: Section[];
  isPlaying: boolean;
  currentPosition: number;
  zoom: number;
  getPlayheadBar?: () => number;
  onZoomChange: (zoom: number) => void;
  onClipMove: (clipId: string, newTrackId: string, newStartBar: number) => void;
  onClipResize: (clipId: string, newDuration: number) => void;
  onSectionChange: (sections: Section[]) => void;
}

const SECTION_ICONS: Record<string, typeof Sun> = {
  Intro: Sun,
  Verse: Moon,
  Chorus: Star,
  Bridge: Cloud,
  Outro: Flame,
};

const MAX_BARS = 128;

function getSectionIcon(name: string) {
  const Icon = SECTION_ICONS[name] || Sigma;
  return Icon;
}

export function ArrangementEditor({
  tracks, clips, sections, isPlaying, currentPosition,
  zoom, getPlayheadBar, onZoomChange, onClipMove, onClipResize, onSectionChange,
}: ArrangementEditorProps) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    type: "clip" | "section" | "loop";
    id: string;
    startX: number;
    startBar: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    clipId: string;
    edge: "left" | "right";
    startX: number;
    startDuration: number;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; clip: ArrangementClip;
  } | null>(null);

  // Clip editor modal state
  const [editingClip, setEditingClip] = useState<ArrangementClip | null>(null);

  // Sub-frame playhead: rAF-driven translate while playing (no per-frame renders).
  const arrangePlayheadRef = useRef<HTMLDivElement>(null);

  // Track color editing state
  const [colorPickerTrack, setColorPickerTrack] = useState<string | null>(null);

  // Track group collapsed state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const COLOR_OPTIONS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#d946ef", "#ec4899", "#14b8a6",
    "#84cc16", "#f43f5e",
  ];

  const barsPerView = Math.max(16, Math.round(64 / zoom));
  const barWidth = Math.max(16, Math.round(zoom * 16));

  const totalWidth = MAX_BARS * barWidth;
  const timelineHeight = tracks.reduce((sum, t) => sum + t.height, 0);

  // Sub-frame playhead: rAF-driven translate while playing (no per-frame renders).
  useEffect(() => {
    if (!isPlaying || !getPlayheadBar) return;
    let raf = 0;
    const tick = () => {
      const el = arrangePlayheadRef.current;
      if (el) el.style.transform = `translateX(${Math.max(0, getPlayheadBar() - 1) * barWidth}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      const el = arrangePlayheadRef.current;
      if (el) el.style.transform = "";
    };
  }, [isPlaying, getPlayheadBar, barWidth]);

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const bar = Math.floor(x / barWidth);
    console.log("Seek to bar:", bar);
  }, [barWidth]);

  const handleClipPointerDown = useCallback((clip: ArrangementClip, e: React.PointerEvent) => {
    e.stopPropagation();
    setDragging({
      type: "clip",
      id: clip.id,
      startX: e.clientX,
      startBar: clip.startBar,
    });
  }, []);

  const handleClipEdgePointerDown = useCallback((clipId: string, edge: "left" | "right", e: React.PointerEvent) => {
    e.stopPropagation();
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    setResizing({ clipId, edge, startX: e.clientX, startDuration: clip.duration });
  }, [clips]);

  const handleTimelinePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging && dragging.type === "clip") {
      const dx = e.clientX - dragging.startX;
      const barDelta = Math.round(dx / barWidth);
      const newStart = Math.max(0, dragging.startBar + barDelta);
      onClipMove(dragging.id, tracks[0]?.id || "", newStart);
    }
    if (resizing) {
      const dx = e.clientX - resizing.startX;
      const barDelta = Math.round(dx / barWidth);
      const newDuration = Math.max(1, resizing.startDuration + (resizing.edge === "right" ? barDelta : -barDelta));
      onClipResize(resizing.clipId, newDuration);
    }
  }, [dragging, resizing, barWidth, tracks, onClipMove, onClipResize]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  const handleClipContextMenu = useCallback((clip: ArrangementClip, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clip });
  }, []);

  const handleDoubleClickClip = useCallback((clip: ArrangementClip) => {
    setEditingClip(clip);
  }, []);

  const handleContextMenuAction = useCallback((action: ContextMenuAction) => {
    if (!contextMenu) return;
    const clip = contextMenu.clip;
    switch (action) {
      case "duplicate":
        console.log("Duplicate clip:", clip.id);
        break;
      case "delete":
        console.log("Delete clip:", clip.id);
        break;
      case "split":
        console.log("Split clip at playhead:", clip.id);
        break;
      case "rename":
        console.log("Rename clip:", clip.id);
        break;
      case "color":
        setColorPickerTrack(clip.trackId);
        break;
      case "render":
        console.log("Render clip as audio:", clip.id);
        break;
      case "loop":
        console.log("Toggle loop on clip:", clip.id);
        break;
      case "edit":
        setEditingClip(clip);
        break;
    }
  }, [contextMenu]);

  const toggleGroup = useCallback((trackId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const updateTrackColor = useCallback((trackId: string, color: string) => {
    console.log("Update track color:", trackId, color);
    setColorPickerTrack(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const selectedClip = contextMenu?.clip;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClip) console.log("Delete clip:", selectedClip.id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (selectedClip) console.log("Duplicate clip:", selectedClip.id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        if (selectedClip) console.log("Split clip:", selectedClip.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu]);

  // Build track tree (respect parentId for groups)
  const visibleTracks = useMemo(() => {
    const rootTracks = tracks.filter((t) => !t.parentId);
    const result: ArrangementTrack[] = [];
    for (const root of rootTracks) {
      result.push(root);
      if (root.type === "group" && !collapsedGroups.has(root.id)) {
        const children = tracks.filter((t) => t.parentId === root.id);
        result.push(...children);
      }
    }
    return result.length > 0 ? result : tracks;
  }, [tracks, collapsedGroups]);

  const minimapBars = useMemo(() => {
    return Array.from({ length: MAX_BARS }, (_, i) => i);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="arrangement-editor bg-gray-950 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden"
    >
      {/* Minimap overview */}
      <div className="minimap h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-0.5">
        {sections.map((section) => (
          <div
            key={section.name}
            className="h-6 rounded-sm flex items-center justify-center text-[6px] font-bold uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              width: `${(section.bars / MAX_BARS) * 100}%`,
              backgroundColor: section.color,
              color: "rgba(255,255,255,0.8)",
              minWidth: 20,
            }}
            title={`${section.name} - ${section.startBar + 1}-${section.startBar + section.bars}`}
          >
            {section.name}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-white">Arrangement</h2>
          <span className="text-[9px] font-mono text-gray-500">
            {tracks.length} tracks · {clips.length} clips
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onZoomChange(Math.max(0.25, zoom / 1.5))}
            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-all"
          >
            <ZoomOut size={12} />
          </button>
          <span className="text-[10px] font-mono text-gray-500 w-8 text-center">{zoom.toFixed(1)}x</span>
          <button
            onClick={() => onZoomChange(Math.min(8, zoom * 1.5))}
            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-all"
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={() => onZoomChange(1)}
            className="p-1.5 rounded bg-gray-800 text-gray-500 hover:text-white transition-all"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* Time ruler */}
      <div
        ref={rulerRef}
        className="time-ruler flex h-7 bg-gray-900 border-b border-gray-800 cursor-pointer sticky top-0 z-10"
        onClick={handleRulerClick}
      >
        <div className="w-32 shrink-0 border-r border-gray-800 flex items-center px-3">
          <span className="text-[8px] font-bold text-gray-600 uppercase">Track</span>
        </div>
        <div className="flex">
          {Array.from({ length: Math.min(MAX_BARS, barsPerView + 4) }, (_, i) => (
            <div
              key={i}
              className="shrink-0 border-r border-gray-800/30 flex items-center justify-start pl-1"
              style={{ width: barWidth }}
            >
              <span className={`text-[8px] font-mono ${i % 4 === 0 ? "text-gray-400 font-bold" : "text-gray-700"}`}>
                {i + 1}
              </span>
              {i % 4 === 0 && i < barsPerView + 4 && (
                <div className="absolute top-0 h-full border-l border-gray-800/20" style={{ left: `${(i + 1) * barWidth}px` }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline area */}
      <div
        ref={timelineRef}
        className="timeline-area overflow-auto max-h-[600px] custom-scrollbar relative"
        onPointerMove={handleTimelinePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Section markers */}
        <div className="section-markers absolute top-0 left-32 right-0 h-5 z-20 pointer-events-none">
          {sections.map((section) => {
            const left = section.startBar * barWidth;
            const width = section.bars * barWidth;
            return (
              <div
                key={section.name}
                className="absolute top-0 h-full pointer-events-auto cursor-pointer group"
                style={{ left, width }}
                title={`${section.name} (bar ${section.startBar + 1} - ${section.startBar + section.bars})`}
              >
                <div
                  className="h-full flex items-center px-2 gap-1 text-[8px] font-bold uppercase tracking-widest"
                  style={{ backgroundColor: section.color, color: "rgba(255,255,255,0.7)" }}
                >
                  {(() => { const Icon = getSectionIcon(section.name); return <Icon size={8} />; })()}
                  <span className="truncate">{section.name}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Track lanes */}
        <div style={{ paddingTop: 20 }}>
          {visibleTracks.map((track) => {
            const isGroup = track.type === "group";
            const isCollapsed = collapsedGroups.has(track.id);

            return (
              <div
                key={track.id}
                className={`track-lane flex border-b border-gray-800/30 hover:bg-gray-900/30 transition-colors ${
                  track.parentId ? "bg-gray-900/20" : ""
                }`}
                style={{ height: track.height }}
              >
                {/* Track label */}
                <div
                  className="track-label w-32 shrink-0 border-r border-gray-800/50 flex items-center gap-1.5 px-2 cursor-pointer group relative"
                  style={{ borderLeftColor: track.color, borderLeftWidth: 2 }}
                  onClick={() => {
                    if (isGroup) toggleGroup(track.id);
                    else if (!colorPickerTrack) setColorPickerTrack(track.id);
                    else setColorPickerTrack(null);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {isGroup && (
                    <FolderOpen size={10} className={`text-gray-500 transition-transform ${isCollapsed ? "" : ""}`} />
                  )}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: track.color }}
                  />
                  <span className="text-[10px] font-bold text-gray-300 truncate flex-1">{track.name}</span>
                  <span className="text-[7px] text-gray-600 uppercase">{track.type}</span>

                  {/* Color picker popover */}
                  {colorPickerTrack === track.id && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-xl p-2 shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-4 gap-1">
                        {COLOR_OPTIONS.map((c) => (
                          <button
                            key={c}
                            onClick={() => updateTrackColor(track.id, c)}
                            className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Clip lane */}
                <div className="clip-lane flex-1 relative min-h-full">
                  {clips
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => {
                      const left = clip.startBar * barWidth;
                      const width = clip.duration * barWidth;
                      return (
                        <div
                          key={clip.id}
                          className="clip-block absolute rounded cursor-grab active:cursor-grabbing group z-10"
                          style={{
                            left,
                            width: Math.max(barWidth * 0.5, width),
                            top: 2,
                            bottom: 2,
                            backgroundColor: clip.color + "30",
                            borderLeft: `3px solid ${clip.color}`,
                          }}
                          onPointerDown={(e) => handleClipPointerDown(clip, e)}
                          onContextMenu={(e) => handleClipContextMenu(clip, e)}
                          onDoubleClick={() => handleDoubleClickClip(clip)}
                        >
                          {clip.waveformPeaks && clip.waveformPeaks.length > 0 && (
                            <div className="absolute inset-0 flex items-end overflow-hidden rounded pointer-events-none opacity-70">
                              <ClipWaveform peaks={clip.waveformPeaks} color={clip.color} />
                            </div>
                          )}
                          <div className="relative flex items-center gap-1.5 h-full px-2">
                            <span className="text-[9px] font-bold truncate" style={{ color: clip.color }}>
                              {clip.name}
                            </span>
                            {clip.loop && (
                              <RefreshCw size={8} className="text-gray-500 shrink-0" />
                            )}
                            <span className="text-[7px] font-mono text-gray-600 ml-auto">
                              {clip.duration}b
                            </span>
                          </div>

                          {/* Resize handles */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-white/40 transition-opacity rounded-l"
                            onPointerDown={(e) => handleClipEdgePointerDown(clip.id, "left", e)}
                          />
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-white/40 transition-opacity rounded-r"
                            onPointerDown={(e) => handleClipEdgePointerDown(clip.id, "right", e)}
                          />
                        </div>
                      );
                    })}

                  {/* Beat grid lines */}
                  {Array.from({ length: barsPerView + 4 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-gray-800/10"
                      style={{ left: i * barWidth }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Playhead */}
        {isPlaying && (
          <div
            ref={arrangePlayheadRef}
            className="playhead absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 shadow-lg shadow-red-500/30 pointer-events-none"
            style={{ left: `${currentPosition * barWidth + 128}px` }}
          />
        )}
      </div>

      {/* Context menu */}
      <ClipContextMenu
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextMenuAction}
        clipName={contextMenu?.clip?.name}
      />

      {/* Clip Editor Modal */}
      <AnimatePresence>
        {editingClip && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setEditingClip(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none"
            >
              <div
                className="pointer-events-auto w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {editingClip.type === "midi" ? (
                  <MidiClipEditor
                    notes={(editingClip.notes || []).map((n) => ({
                      id: `n_${n.pitch}_${n.start}`,
                      pitch: n.pitch,
                      start: n.start,
                      duration: n.duration,
                      velocity: n.velocity,
                    }))}
                    onNotesChange={(notes) => console.log("Notes changed:", notes.length)}
                    scale="C Major"
                    timeDivision={16}
                    isPlaying={false}
                    currentPosition={0}
                  />
                ) : (
                  <AudioClipEditor
                    clipData={{
                      id: editingClip.id,
                      waveformData: editingClip.waveformPeaks || [],
                      duration: editingClip.duration * 2,
                      sampleRate: 44100,
                      gain: editingClip.gain ?? 0,
                      fadeIn: editingClip.fadeIn ?? 0,
                      fadeOut: editingClip.fadeOut ?? 0,
                      startOffset: 0,
                    }}
                    onEdit={(updates) => console.log("Edit:", updates)}
                    zoom={1}
                    onZoomChange={() => {}}
                    snapToGrid={true}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
