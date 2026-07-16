import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Waves, Radio, Gauge, Activity } from "lucide-react";
import { RotaryKnob } from "./RotaryKnob";

type ModulationMode = "lfo" | "adsr" | "sidechain";

type LFOForm = {
  waveform: string;
  frequency: number;
  amplitude: number;
  offset: number;
};

type ADSRForm = {
  attack_ms: number;
  decay_ms: number;
  sustain_level: number;
  release_ms: number;
};

type SidechainForm = {
  threshold: number;
  depth: number;
  attack_ms: number;
  release_ms: number;
};

const WAVEFORMS = [
  { value: "sine", label: "Sine" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
  { value: "sawtooth", label: "Sawtooth" },
  { value: "smooth_square", label: "Smooth Sq" },
  { value: "random", label: "Random" },
];

const MODULES: { mode: ModulationMode; label: string; icon: typeof Waves }[] = [
  { mode: "lfo", label: "LFO", icon: Waves },
  { mode: "adsr", label: "ADSR", icon: Radio },
  { mode: "sidechain", label: "Sidechain", icon: Activity },
];

function ModuleSection({ title, icon: Icon, children }: { title: string; icon: typeof Waves; children: ReactNode }) {
  return (
    <section className="border border-gray-800 rounded-xl bg-gray-900/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function ModulationPanel() {
  const [activeMode, setActiveMode] = useState<ModulationMode>("lfo");

  const [lfo, setLfo] = useState<LFOForm>({ waveform: "sine", frequency: 1, amplitude: 1, offset: 0 });
  const [adsr, setAdsr] = useState<ADSRForm>({ attack_ms: 10, decay_ms: 100, sustain_level: 0.7, release_ms: 200 });
  const [sidechain, setSidechain] = useState<SidechainForm>({ threshold: 0.1, depth: 0.5, attack_ms: 5, release_ms: 50 });

  const setLfoVal = <K extends keyof LFOForm>(key: K, val: LFOForm[K]) => setLfo((p) => ({ ...p, [key]: val }));
  const setAdsrVal = <K extends keyof ADSRForm>(key: K, val: ADSRForm[K]) => setAdsr((p) => ({ ...p, [key]: val }));
  const setSideVal = <K extends keyof SidechainForm>(key: K, val: SidechainForm[K]) => setSidechain((p) => ({ ...p, [key]: val }));

  return (
    <div className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <Gauge size={18} className="text-purple-500" />
        <span className="font-semibold text-gray-200 text-sm">Modulation Panel</span>
      </div>

      <div className="flex border-b border-gray-800" role="tablist">
        {MODULES.map((mod) => (
          <button
            key={mod.mode}
            type="button"
            role="tab"
            aria-selected={activeMode === mod.mode}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeMode === mod.mode
                ? "text-purple-400 border-b-2 border-purple-500 bg-purple-500/5"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30"
            }`}
            onClick={() => setActiveMode(mod.mode)}
          >
            <mod.icon size={14} />
            {mod.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {activeMode === "lfo" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <ModuleSection title="LFO Configuration" icon={Waves}>
              <div className="mb-4">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Waveform</label>
                <div className="flex flex-wrap gap-1.5">
                  {WAVEFORMS.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                        lfo.waveform === w.value
                          ? "border-purple-500 bg-purple-500/15 text-purple-300"
                          : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                      }`}
                      onClick={() => setLfoVal("waveform", w.value)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <RotaryKnob label="Freq (Hz)" value={lfo.frequency} onChange={(v) => setLfoVal("frequency", v)} min={0.01} max={20} accent="#a78bfa" />
                <RotaryKnob label="Amp" value={lfo.amplitude} onChange={(v) => setLfoVal("amplitude", v)} min={0} max={2} accent="#f472b6" />
                <RotaryKnob label="Offset" value={lfo.offset} onChange={(v) => setLfoVal("offset", v)} min={-1} max={1} accent="#34d399" />
              </div>
            </ModuleSection>
          </motion.div>
        )}

        {activeMode === "adsr" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <ModuleSection title="ADSR Envelope" icon={Radio}>
              <div className="grid grid-cols-4 gap-3">
                <RotaryKnob label="Attack" value={adsr.attack_ms} onChange={(v) => setAdsrVal("attack_ms", v)} min={1} max={1000} accent="#f97316" />
                <RotaryKnob label="Decay" value={adsr.decay_ms} onChange={(v) => setAdsrVal("decay_ms", v)} min={1} max={3000} accent="#eab308" />
                <RotaryKnob label="Sustain" value={adsr.sustain_level} onChange={(v) => setAdsrVal("sustain_level", v)} min={0} max={1} accent="#22d3ee" />
                <RotaryKnob label="Release" value={adsr.release_ms} onChange={(v) => setAdsrVal("release_ms", v)} min={1} max={5000} accent="#a78bfa" />
              </div>
              <div className="mt-3 h-12 bg-gray-800/50 rounded-lg border border-gray-800 relative overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 h-full bg-gradient-to-t from-purple-500/30 to-purple-500/10"
                  style={{ width: "100%" }}
                >
                  <svg width="100%" height="100%" viewBox="0 0 200 48" preserveAspectRatio="none" className="absolute inset-0">
                    <path
                      d={`M 0 48 L 0 ${48 - 48 * 0.8} Q 10 ${48 - 48 * 0.9}, 15 ${48 - 48 * 0.9} L 15 ${48 - 48 * 0.4} Q 25 ${48 - 48 * 0.2}, 35 ${48 - 48 * 0.3} L 35 ${48 - 48 * 0.5} L 170 ${48 - 48 * 0.5} Q 180 ${48 - 48 * 0.5}, 190 ${48 - 48 * 0.1} L 190 48 Z`}
                      fill="rgba(129,140,248,0.25)"
                    />
                    <path
                      d={`M 0 48 L 0 ${48 - 48 * 0.8} Q 10 ${48 - 48 * 0.9}, 15 ${48 - 48 * 0.9} L 15 ${48 - 48 * 0.4} Q 25 ${48 - 48 * 0.2}, 35 ${48 - 48 * 0.3} L 35 ${48 - 48 * 0.5} L 170 ${48 - 48 * 0.5} Q 180 ${48 - 48 * 0.5}, 190 ${48 - 48 * 0.1} L 190 48 Z`}
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth={1.5}
                    />
                  </svg>
                </div>
              </div>
            </ModuleSection>
          </motion.div>
        )}

        {activeMode === "sidechain" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <ModuleSection title="Sidechain Configuration" icon={Activity}>
              <div className="grid grid-cols-4 gap-3">
                <RotaryKnob label="Threshold" value={sidechain.threshold} onChange={(v) => setSideVal("threshold", v)} min={0} max={1} accent="#f43f5e" />
                <RotaryKnob label="Depth" value={sidechain.depth} onChange={(v) => setSideVal("depth", v)} min={0} max={1} accent="#fb923c" />
                <RotaryKnob label="Attack" value={sidechain.attack_ms} onChange={(v) => setSideVal("attack_ms", v)} min={1} max={100} accent="#22d3ee" />
                <RotaryKnob label="Release" value={sidechain.release_ms} onChange={(v) => setSideVal("release_ms", v)} min={1} max={500} accent="#a78bfa" />
              </div>
            </ModuleSection>
          </motion.div>
        )}
      </div>
    </div>
  );
}
