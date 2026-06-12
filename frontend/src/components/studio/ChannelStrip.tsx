import { useState } from "react";
import { motion } from "framer-motion";
import { Shuffle, GitBranch, Waves, Volume2, Activity } from "lucide-react";
import type { MixerChannel } from "../../types/audio";
import { RotaryKnob } from "./RotaryKnob";
import { EQKnob } from "./EQKnob";
import { FaderKnob } from "./FaderKnob";
import { EQDisplay, type EQBand } from "./EQDisplay";
import { CompressorDisplay } from "./CompressorDisplay";

type Props = {
  channel: MixerChannel;
  onUpdate: (updates: Partial<MixerChannel>) => void;
  busses: Array<{ id: string; name: string }>;
  vcaGroups: Array<{ id: string; name: string }>;
  auxSends: Array<{ id: string; name: string }>;
};

type SectionKey = "sends" | "routing" | "eq" | "comp";

const DEFAULT_EQ_BANDS: EQBand[] = [
  { freq: 80, gain: 0, q: 0.7, type: "low-shelf" },
  { freq: 350, gain: 0, q: 0.7, type: "peaking" },
  { freq: 2000, gain: 0, q: 0.7, type: "peaking" },
  { freq: 12000, gain: 0, q: 0.7, type: "high-shelf" },
];

const EQ_LABELS = ["Low", "Low-Mid", "High-Mid", "High"];
const EQ_FREQUENCIES = [80, 350, 2000, 12000];

function vumeterSegments(level: number, count: number): ("off" | "green" | "yellow" | "red")[] {
  const segs: ("off" | "green" | "yellow" | "red")[] = [];
  const greenCount = Math.floor(count * 0.65);
  const yellowCount = Math.floor(count * 0.2);

  for (let i = 0; i < count; i++) {
    const threshold = (i + 1) / count;
    if (level >= threshold) {
      if (i < greenCount) segs.push("green");
      else if (i < greenCount + yellowCount) segs.push("yellow");
      else segs.push("red");
    } else {
      segs.push("off");
    }
  }
  return segs;
}

export function ChannelStrip({
  channel,
  onUpdate,
  busses,
  vcaGroups,
  auxSends,
}: Props) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    sends: false,
    routing: false,
    eq: false,
    comp: false,
  });
  const [eqBands] = useState<EQBand[]>(DEFAULT_EQ_BANDS);
  const [hoverVu, setHoverVu] = useState(false);

  const isMaster = channel.type === "master";
  const VU_SEGMENTS = isMaster ? 20 : 16;

  const toggleSection = (key: SectionKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const vuSegments = vumeterSegments(channel.vuLevel, VU_SEGMENTS);

  return (
    <motion.div
      layout
      className={`channel-strip ${channel.muted ? "channel-strip--muted opacity-50" : ""} ${isMaster ? "border-blue-900/30" : ""}`}
      style={{ width: isMaster ? 200 : 180 }}
    >
      {/* Input Gain & Phase */}
      <div className="channel-strip__section flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <RotaryKnob
            label="Gain"
            value={channel.volume}
            onChange={(v) => onUpdate({ volume: v })}
            min={-12}
            max={12}
            accent={channel.color}
            size="sm"
            showValue={false}
          />
          <button
            onClick={() => onUpdate({})}
            className="w-6 h-6 flex items-center justify-center rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            title="Phase Invert"
          >
            <Activity size={10} className="text-gray-400" />
          </button>
        </div>
        <div
          className="text-[9px] font-bold truncate"
          style={{ color: channel.color }}
        >
          {channel.name}
        </div>
      </div>

      {/* VU Meter (LED style) */}
      <div
        className="channel-strip__section"
        onMouseEnter={() => setHoverVu(true)}
        onMouseLeave={() => setHoverVu(false)}
      >
        <div className="channel-strip__section-title">Level</div>
        <div
          className="vu-meter-led"
          style={{ height: isMaster ? 100 : 80 }}
        >
          {vuSegments.map((seg, i) => (
            <div
              key={i}
              className={`vu-meter-led__segment vu-meter-led__segment--${seg}`}
              style={{
                height: `${100 / VU_SEGMENTS}%`,
                opacity: seg === "off" ? 0.3 : 1,
              }}
            />
          ))}
        </div>
        {hoverVu && (
          <div className="text-[8px] font-mono text-center text-gray-400 mt-1">
            {channel.vuLevel > 0 ? `-${((1 - channel.vuLevel) * 60).toFixed(0)}dB` : "-∞"}
          </div>
        )}
      </div>

      {/* EQ Section */}
      <div className="channel-strip__section">
        <button
          onClick={() => toggleSection("eq")}
          className="w-full flex items-center justify-center gap-1 text-[9px] font-bold text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Waves size={10} />
          EQ
        </button>
        {channel.eqActive && (
          <div className="grid grid-cols-4 gap-1 mt-1">
            {eqBands.map((band, i) => (
                  <EQKnob
                key={i}
                label={EQ_LABELS[i]}
                value={band.gain}
                onChange={() => {}}
                min={-24}
                max={24}
                frequency={EQ_FREQUENCIES[i]}
              />
            ))}
          </div>
        )}
        <motion.div
          initial={false}
          animate={{ height: expanded.eq && channel.eqActive ? "auto" : 0, opacity: expanded.eq ? 1 : 0 }}
          className="overflow-hidden"
        >
          {expanded.eq && channel.eqActive && (
            <div className="mt-2">
              <EQDisplay
                bands={eqBands}
                width={160}
                height={120}
              />
            </div>
          )}
        </motion.div>
      </div>

      {/* Compressor Section */}
      <div className="channel-strip__section">
        <button
          onClick={() => toggleSection("comp")}
          className="w-full flex items-center justify-center gap-1 text-[9px] font-bold text-gray-500 hover:text-gray-300 transition-colors"
        >
          <Volume2 size={10} />
          COMP
        </button>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <RotaryKnob
            label="Thresh"
            value={-24}
            onChange={() => {}}
            min={-60}
            max={0}
            accent="#22c55e"
            size="sm"
            showValue={false}
          />
          <RotaryKnob
            label="Ratio"
            value={4}
            onChange={() => {}}
            min={1}
            max={20}
            accent="#eab308"
            size="sm"
            showValue={false}
          />
          <RotaryKnob
            label="Attack"
            value={10}
            onChange={() => {}}
            min={0.1}
            max={50}
            accent="#818cf8"
            size="sm"
            showValue={false}
          />
          <RotaryKnob
            label="Release"
            value={100}
            onChange={() => {}}
            min={10}
            max={500}
            accent="#ef4444"
            size="sm"
            showValue={false}
          />
        </div>
        <motion.div
          initial={false}
          animate={{ height: expanded.comp ? "auto" : 0, opacity: expanded.comp ? 1 : 0 }}
          className="overflow-hidden"
        >
          {expanded.comp && (
            <div className="mt-2">
              <CompressorDisplay
                threshold={-24}
                ratio={4}
                gainReduction={channel.gainReduction}
                inputLevel={channel.vuLevel}
                outputLevel={Math.max(0, channel.vuLevel - channel.gainReduction)}
                width={160}
                height={100}
              />
            </div>
          )}
        </motion.div>
      </div>

      {/* Fader Section */}
      <div className="channel-strip__section flex flex-col items-center gap-1">
        <div className="channel-strip__section-title">Volume</div>
        <div className="flex items-center gap-2 w-full justify-center">
          <FaderKnob
            label=""
            value={channel.volume}
            onChange={(v) => onUpdate({ volume: v })}
            min={-60}
            max={6}
            showScale={false}
          />
          <div className="flex flex-col gap-1">
            {!isMaster && (
              <>
                <button
                  onClick={() => onUpdate({ muted: !channel.muted })}
                  className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                    channel.muted
                      ? "bg-red-600 text-white"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => onUpdate({ solo: !channel.solo })}
                  className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${
                    channel.solo
                      ? "bg-yellow-500 text-black"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  S
                </button>
              </>
            )}
            <div className="w-6 h-6 rounded-full border border-gray-700 relative flex items-center justify-center">
              <div
                className="absolute w-0.5 h-2 bg-blue-500 rounded-full transition-transform"
                style={{
                  transform: `rotate(${channel.pan * 90}deg)`,
                  transformOrigin: "bottom center",
                  bottom: "50%",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Routing & Sends */}
      <div className="channel-strip__section">
        <div className="flex gap-1 justify-center mb-1">
          {auxSends.length > 0 && (
            <button
              onClick={() => toggleSection("sends")}
              className={`p-0.5 rounded ${expanded.sends ? "bg-blue-500/20 text-blue-400" : "text-gray-600"}`}
            >
              <Shuffle size={10} />
            </button>
          )}
          <button
            onClick={() => toggleSection("routing")}
            className={`p-0.5 rounded ${expanded.routing ? "bg-blue-500/20 text-blue-400" : "text-gray-600"}`}
          >
            <GitBranch size={10} />
          </button>
        </div>

        <motion.div
          initial={false}
          animate={{ height: expanded.routing ? "auto" : 0, opacity: expanded.routing ? 1 : 0 }}
          className="overflow-hidden"
        >
          {expanded.routing && (
            <div className="space-y-1">
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
            </div>
          )}
        </motion.div>

        <motion.div
          initial={false}
          animate={{ height: expanded.sends ? "auto" : 0, opacity: expanded.sends ? 1 : 0 }}
          className="overflow-hidden"
        >
          {expanded.sends && auxSends.length > 0 && (
            <div className="space-y-1">
              {auxSends.map((send) => {
                const sendLevel = channel.sends.find((s) => s.sendId === send.id)?.level ?? 0;
                return (
                  <div key={send.id} className="flex items-center gap-1">
                    <span className="text-[7px] text-gray-500 w-8 truncate">{send.name}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={sendLevel}
                      onChange={(e) => {
                        const level = parseFloat(e.target.value);
                        const newSends =
                          sendLevel > 0 || level > 0
                            ? channel.sends
                                .filter((s) => s.sendId !== send.id)
                                .concat({ sendId: send.id, level })
                            : channel.sends;
                        onUpdate({ sends: newSends });
                      }}
                      className="flex-1 h-1 appearance-none bg-gray-700 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400"
                    />
                    <span className="text-[7px] font-mono text-gray-500 w-4 text-right">
                      {Math.round(sendLevel * 100)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Channel type badge */}
      {!isMaster && (
        <div className="px-2 py-1 text-center">
          <span
            className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: channel.color + "20",
              color: channel.color,
            }}
          >
            {channel.type.charAt(0).toUpperCase() + channel.type.slice(1)}
          </span>
        </div>
      )}
    </motion.div>
  );
}
