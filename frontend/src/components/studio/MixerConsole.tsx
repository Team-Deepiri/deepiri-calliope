import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sliders, Waves, GitBranch, Shuffle, LayoutGrid, Equalizer,
} from "lucide-react";
import type { MixerChannel } from "../../types/audio";
import { ParametricEQ } from "./ParametricEQ";

interface MixerConsoleProps {
  channels: MixerChannel[];
  busses: Array<{ id: string; name: string }>;
  vcaGroups: Array<{ id: string; name: string }>;
  auxSends: Array<{ id: string; name: string }>;
  onUpdateChannel: (channelId: string, updates: Partial<MixerChannel>) => void;
  onOpenRoutingModal: () => void;
}

type SectionKey = "sends" | "routing" | "eq";

function dbToPercent(db: number): number {
  const clamped = Math.max(-60, Math.min(6, db));
  return ((clamped + 60) / 66) * 100;
}

function ChannelStrip({
  channel,
  busses,
  vcaGroups,
  auxSends,
  onUpdate,
  allChannels,
}: {
  channel: MixerChannel;
  busses: Array<{ id: string; name: string }>;
  vcaGroups: Array<{ id: string; name: string }>;
  auxSends: Array<{ id: string; name: string }>;
  onUpdate: (updates: Partial<MixerChannel>) => void;
  allChannels: MixerChannel[];
}) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ sends: false, routing: false, eq: false });
  const [eqModalOpen, setEqModalOpen] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);
  const faderStart = useRef({ y: 0, val: 0 });

  const isMaster = channel.type === "master";

  const eqBands = useMemo(() => {
    const freqs = [30, 100, 300, 1000, 3000, 8000, 16000];
    return freqs.map((freq) => {
      const logFreq = Math.log10(freq / 1000);
      const gain = Math.sin(logFreq * Math.PI * 2 + channel.volume * 0.05) * 0.3 + 0.5;
      return { freq, gain: Math.max(0, Math.min(1, gain)) };
    });
  }, [channel.volume]);

  const toggleSection = (key: SectionKey) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMaster) return;
      e.preventDefault();
      faderStart.current = { y: e.clientY, val: channel.volume };
      const onMove = (ev: PointerEvent) => {
        const dy = faderStart.current.y - ev.clientY;
        const newVal = Math.max(-60, Math.min(6, faderStart.current.val + dy * 0.3));
        onUpdate({ volume: Math.round(newVal * 10) / 10 });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [channel.volume, onUpdate, isMaster],
  );

  const channelLabel = channel.type.charAt(0).toUpperCase() + channel.type.slice(1);

  return (
    <motion.div
      layout
      className={`mixer-strip flex flex-col shrink-0 bg-gray-900/50 rounded-xl border transition-colors ${
        channel.muted ? "border-red-900/30 opacity-60" : "border-gray-800/50"
      } hover:bg-gray-900 w-[72px] ${isMaster ? "w-[84px] border-2 border-blue-900/30 bg-gray-900" : ""}`}
    >
      <div className="flex flex-col items-center px-2 py-2">
        {/* Type indicator */}
        {!isMaster && (
          <div
            className="text-[8px] font-black uppercase tracking-wider mb-1 px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: channel.color + "20",
              color: channel.color,
            }}
          >
            {channelLabel}
          </div>
        )}

        {/* VU Meter */}
        <div
          className={`vu-meter bg-gray-800 rounded-full mb-1 relative overflow-hidden cursor-pointer ${isMaster ? "w-3 h-28" : "w-2.5 h-24"}`}
          onClick={() => {
            if (channel.sends.length > 0) toggleSection("sends");
          }}
        >
          <div
            className="absolute bottom-0 w-full transition-all duration-75"
            style={{
              height: `${channel.vuLevel * 100}%`,
              background: channel.vuLevel > 0.9
                ? "linear-gradient(to top, #22c55e, #eab308, #ef4444)"
                : channel.vuLevel > 0.75
                  ? "linear-gradient(to top, #22c55e, #eab308)"
                  : "#22c55e",
              boxShadow: channel.vuLevel > 0.5 ? `0 0 8px ${channel.color}40` : "none",
            }}
          />
          {channel.gainReduction > 0 && (
            <div
              className="absolute bottom-0 w-full bg-red-500/30 transition-all duration-100"
              style={{ height: `${channel.gainReduction * 100}%` }}
            />
          )}
        </div>

        {/* Plugin count indicator */}
        {channel.pluginCount > 0 && (
          <div className="flex items-center gap-1 mb-1 text-[8px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded-full">
            <Sliders size={8} />
            {channel.pluginCount}
          </div>
        )}

        {/* Comp active indicator */}
        {channel.compActive && (
          <div className="w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent rounded-full mb-1 opacity-60" />
        )}

        {/* EQ mini visualizer */}
        {channel.eqActive && (
          <div className="flex items-end gap-[1px] h-5 w-full mb-1 px-1">
            {eqBands.map((band, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${band.gain * 100}%`,
                  backgroundColor: channel.color,
                  opacity: 0.6 + band.gain * 0.4,
                }}
              />
            ))}
          </div>
        )}

        {/* Fader */}
        {!isMaster ? (
          <div
            ref={faderRef}
            className="fader-container relative h-28 w-6 flex items-center justify-center mb-1 cursor-pointer group"
            onPointerDown={handleFaderPointerDown}
          >
            <div className="w-1 h-full bg-gray-800 rounded-full absolute" />
            <div
              className="w-1 h-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-full absolute transition-all duration-75"
              style={{ height: `${dbToPercent(channel.volume)}%`, bottom: 0 }}
            />
            <div
              className="absolute w-4 h-2 bg-white rounded-sm shadow-lg hover:bg-blue-200 transition-colors"
              style={{ bottom: `calc(${dbToPercent(channel.volume)}% - 4px)` }}
            />
          </div>
        ) : (
          <div className="fader-container relative h-28 w-6 flex items-center justify-center mb-1">
            <div className="w-1.5 h-full bg-gray-800 rounded-full absolute" />
            <div
              className="w-1.5 h-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-full absolute transition-all duration-75"
              style={{ height: `${dbToPercent(channel.volume)}%`, bottom: 0 }}
            />
            <div
              className="absolute w-4 h-2.5 bg-blue-400 rounded-sm shadow-xl"
              style={{ bottom: `calc(${dbToPercent(channel.volume)}% - 5px)` }}
            />
          </div>
        )}

        {/* Volume label */}
        <div className="text-[9px] font-mono text-gray-500 mb-1">
          {isMaster ? channel.volume.toFixed(1) : channel.volume >= 0 ? `+${channel.volume}` : channel.volume}
        </div>

        {/* Mute/Solo */}
        {!isMaster && (
          <div className="flex gap-0.5 w-full mb-1">
            <button
              onClick={() => onUpdate({ muted: !channel.muted })}
              className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${
                channel.muted ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
              }`}
            >
              M
            </button>
            <button
              onClick={() => onUpdate({ solo: !channel.solo })}
              className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${
                channel.solo ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-500 hover:text-gray-300"
              }`}
            >
              S
            </button>
          </div>
        )}

        {/* Pan indicator */}
        <div className="flex items-center gap-1 mb-1">
          <div className="w-6 h-6 rounded-full border border-gray-700 relative flex items-center justify-center">
            <div
              className="absolute w-0.5 h-2 bg-blue-500 rounded-full transition-transform"
              style={{ transform: `rotate(${channel.pan * 90}deg)`, transformOrigin: "bottom center", bottom: "50%" }}
            />
          </div>
        </div>

        {/* Send levels (collapsible) */}
        <AnimatePresence>
          {expanded.sends && auxSends.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full overflow-hidden"
            >
              {auxSends.map((send) => {
                const sendLevel = channel.sends.find((s) => s.sendId === send.id)?.level ?? 0;
                return (
                  <div key={send.id} className="flex items-center gap-1 mb-0.5">
                    <span className="text-[7px] text-gray-500 w-8 truncate">{send.name}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={sendLevel}
                      onChange={(e) => {
                        const level = parseFloat(e.target.value);
                        const newSends = sendLevel > 0 || level > 0
                          ? channel.sends.filter((s) => s.sendId !== send.id).concat({ sendId: send.id, level })
                          : channel.sends;
                        onUpdate({ sends: newSends });
                      }}
                      className="flex-1 h-1 appearance-none bg-gray-700 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:h-2 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                    />
                    <span className="text-[7px] font-mono text-gray-500 w-4 text-right">{Math.round(sendLevel * 100)}</span>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand/collapse buttons */}
        <div className="flex gap-1 mb-1">
          {auxSends.length > 0 && (
            <button
              onClick={() => toggleSection("sends")}
              className={`p-0.5 rounded ${expanded.sends ? "bg-blue-500/20 text-blue-400" : "text-gray-600"}`}
            >
              <Shuffle size={8} />
            </button>
          )}
          <button
            onClick={() => toggleSection("routing")}
            className={`p-0.5 rounded ${expanded.routing ? "bg-blue-500/20 text-blue-400" : "text-gray-600"}`}
          >
            <GitBranch size={8} />
          </button>
          {channel.eqActive && (
            <button
              onClick={() => setEqModalOpen(true)}
              className={`p-0.5 rounded text-gray-600 hover:text-blue-400 hover:bg-blue-500/20`}
              title="Open EQ"
            >
              <Equalizer size={8} />
            </button>
          )}
        </div>

        {/* Routing section (collapsible) */}
        <AnimatePresence>
          {expanded.routing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full overflow-hidden space-y-1"
            >
              {busses.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[7px] text-gray-600 font-bold uppercase">Bus</span>
                  <select
                    value={channel.outputBus ?? ""}
                    onChange={(e) => onUpdate({ outputBus: e.target.value || undefined })}
                    className="w-full bg-gray-800 border border-gray-700 rounded text-[8px] text-gray-300 p-0.5"
                  >
                    <option value="">None</option>
                    {busses.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {vcaGroups.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[7px] text-gray-600 font-bold uppercase">VCA</span>
                  <select
                    value={channel.vcaGroup ?? ""}
                    onChange={(e) => onUpdate({ vcaGroup: e.target.value || undefined })}
                    className="w-full bg-gray-800 border border-gray-700 rounded text-[8px] text-gray-300 p-0.5"
                  >
                    <option value="">None</option>
                    {vcaGroups.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {allChannels.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[7px] text-gray-600 font-bold uppercase">SC</span>
                  <select
                    value={channel.sidechainSource ?? ""}
                    onChange={(e) => onUpdate({ sidechainSource: e.target.value || undefined })}
                    className="w-full bg-gray-800 border border-gray-700 rounded text-[8px] text-gray-300 p-0.5"
                  >
                    <option value="">None</option>
                    {allChannels.filter((c) => c.id !== channel.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* EQ Modal */}
        <AnimatePresence>
          {eqModalOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => setEqModalOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none"
              >
                <div
                  className="pointer-events-auto bg-gray-950 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                      <Waves size={14} className="text-blue-400" />
                      <span className="text-sm font-bold text-white">EQ - {channel.name}</span>
                    </div>
                    <button
                      onClick={() => setEqModalOpen(false)}
                      className="p-1 rounded text-gray-500 hover:text-white transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <ParametricEQ onPresetChange={(preset) => console.log("EQ preset:", preset)} />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Track name */}
        <div
          className="text-[9px] text-center font-bold truncate w-full mt-auto"
          style={{ color: channel.color }}
        >
          {channel.name}
        </div>
        {isMaster && (
          <div className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Master</div>
        )}
      </div>
    </motion.div>
  );
}

export function MixerConsole({
  channels,
  busses,
  vcaGroups,
  auxSends,
  onUpdateChannel,
  onOpenRoutingModal,
}: MixerConsoleProps) {
  const masterChannel = channels.find((c) => c.type === "master");
  const audioChannels = channels.filter((c) => c.type !== "master");

  return (
    <div className="mixer-console bg-gray-950 p-4 rounded-2xl border border-gray-800 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-bold text-gray-100 tracking-tight">Mixer Console</h2>
          <div className="text-[10px] font-mono text-gray-500 bg-gray-900 px-2 py-1 rounded-full border border-gray-800">
            {audioChannels.length + (masterChannel ? 1 : 0)} channels
          </div>
        </div>
        <div className="flex items-center gap-2">
          {masterChannel && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500 bg-gray-900 px-3 py-1.5 rounded-full border border-gray-800">
              <span>LUFS: <span className="text-cyan-400">{-14 + Math.random() * 2 - 1}</span></span>
              <span>Corr: <span className={masterChannel.pan > 0.3 ? "text-green-400" : "text-yellow-400"}>
                {0.7 + Math.random() * 0.3}
              </span></span>
              <span>Width: <span className="text-blue-400">
                {0.6 + Math.random() * 0.4}
              </span></span>
            </div>
          )}
          <button
            onClick={onOpenRoutingModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-bold transition-colors"
          >
            <LayoutGrid size={12} />
            Routing
          </button>
        </div>
      </div>

      <div className="mixer-strips-container flex gap-2 overflow-x-auto pb-2 custom-scrollbar items-start">
        {audioChannels.map((channel) => (
          <ChannelStrip
            key={channel.id}
            channel={channel}
            busses={busses}
            vcaGroups={vcaGroups}
            auxSends={auxSends}
            onUpdate={(updates) => onUpdateChannel(channel.id, updates)}
            allChannels={channels}
          />
        ))}

        {masterChannel && (
          <div className="shrink-0 pl-2 border-l border-gray-800/50 ml-1">
            <ChannelStrip
              channel={masterChannel}
              busses={[]}
              vcaGroups={[]}
              auxSends={[]}
              onUpdate={(updates) => onUpdateChannel(masterChannel.id, updates)}
              allChannels={channels}
            />
          </div>
        )}
      </div>
    </div>
  );
}
