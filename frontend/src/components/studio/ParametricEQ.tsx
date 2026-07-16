import { useState, useCallback, useMemo } from "react";
import { Waves, Power } from "lucide-react";
import { RotaryKnob } from "./RotaryKnob";
import { EQDisplay, type EQBand } from "./EQDisplay";
import { EQKnob } from "./EQKnob";

type BandConfig = {
  freq: number;
  gain: number;
  q: number;
  type: "low-shelf" | "peaking" | "high-shelf";
  active: boolean;
};

type Preset = {
  name: string;
  bands: BandConfig[];
};

const PRESETS: Preset[] = [
  {
    name: "Flat",
    bands: [
      { freq: 80, gain: 0, q: 0.7, type: "low-shelf", active: true },
      { freq: 350, gain: 0, q: 0.7, type: "peaking", active: true },
      { freq: 2000, gain: 0, q: 0.7, type: "peaking", active: true },
      { freq: 12000, gain: 0, q: 0.7, type: "high-shelf", active: true },
    ],
  },
  {
    name: "Vocal Boost",
    bands: [
      { freq: 120, gain: -2, q: 0.7, type: "low-shelf", active: true },
      { freq: 800, gain: 3, q: 1.2, type: "peaking", active: true },
      { freq: 4000, gain: 4, q: 1.0, type: "peaking", active: true },
      { freq: 14000, gain: 2, q: 0.7, type: "high-shelf", active: true },
    ],
  },
  {
    name: "Warmth",
    bands: [
      { freq: 100, gain: 4, q: 0.6, type: "low-shelf", active: true },
      { freq: 500, gain: -2, q: 0.7, type: "peaking", active: true },
      { freq: 4000, gain: -3, q: 0.8, type: "peaking", active: true },
      { freq: 12000, gain: -2, q: 0.7, type: "high-shelf", active: true },
    ],
  },
  {
    name: "Air",
    bands: [
      { freq: 60, gain: -3, q: 0.7, type: "low-shelf", active: true },
      { freq: 2000, gain: 2, q: 0.7, type: "peaking", active: true },
      { freq: 8000, gain: 4, q: 1.5, type: "peaking", active: true },
      { freq: 18000, gain: 6, q: 0.7, type: "high-shelf", active: true },
    ],
  },
  {
    name: "Bass Boost",
    bands: [
      { freq: 60, gain: 6, q: 0.5, type: "low-shelf", active: true },
      { freq: 250, gain: -2, q: 0.7, type: "peaking", active: true },
      { freq: 3000, gain: -1, q: 0.7, type: "peaking", active: true },
      { freq: 12000, gain: -3, q: 0.7, type: "high-shelf", active: true },
    ],
  },
];


type Props = {
  onPresetChange?: (preset: string) => void;
};

export function ParametricEQ({ onPresetChange }: Props) {
  const [bypassed, setBypassed] = useState(false);
  const [bands, setBands] = useState<BandConfig[]>(PRESETS[0].bands);
  const [currentPreset, setCurrentPreset] = useState("Flat");

  const updateBand = useCallback(
    (index: number, updates: Partial<BandConfig>) => {
      setBands((prev) => prev.map((b, i) => (i === index ? { ...b, ...updates } : b)));
    },
    [],
  );

  const toggleBand = useCallback(
    (index: number) => {
      setBands((prev) => prev.map((b, i) => (i === index ? { ...b, active: !b.active } : b)));
    },
    [],
  );

  const applyPreset = useCallback(
    (name: string) => {
      const preset = PRESETS.find((p) => p.name === name);
      if (preset) {
        setBands(preset.bands.map((b) => ({ ...b })));
        setCurrentPreset(name);
        onPresetChange?.(name);
      }
    },
    [onPresetChange],
  );

  const eqBands: EQBand[] = useMemo(
    () =>
      bands
        .filter((b) => !bypassed && b.active)
        .map((b) => ({ freq: b.freq, gain: b.gain, q: b.q, type: b.type })),
    [bands, bypassed],
  );

  const handleBandUpdate = useCallback(
    (index: number, updates: Partial<EQBand>) => {
      const activeIndices = bands
        .map((b, i) => (b.active && !bypassed ? i : -1))
        .filter((i) => i >= 0);
      const realIndex = activeIndices[index];
      if (realIndex != null) {
        if (updates.freq != null) updateBand(realIndex, { freq: updates.freq });
        if (updates.gain != null) updateBand(realIndex, { gain: updates.gain });
      }
    },
    [bands, bypassed, updateBand],
  );

  return (
    <div className="eq-panel">
      {/* Header */}
      <div className="eq-panel__header">
        <div className="flex items-center gap-2">
          <Waves size={14} className="text-blue-400" />
          <span className="eq-panel__title">Parametric EQ</span>
        </div>
        <div className="eq-panel__presets">
          <select
            className="eq-panel__preset-select"
            value={currentPreset}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className={`eq-panel__bypass ${bypassed ? "" : "eq-panel__bypass--active"}`}
            onClick={() => setBypassed((b) => !b)}
          >
            <Power size={10} className="inline mr-1" />
            {bypassed ? "Bypass" : "Active"}
          </button>
        </div>
      </div>

      {/* EQ Curve */}
      <div className="px-3 py-2 flex justify-center border-b border-white/5">
        <EQDisplay
          bands={eqBands}
          width={320}
          height={160}
          onBandUpdate={handleBandUpdate}
        />
      </div>

      {/* Band Controls */}
      <div className="eq-panel__bands">
        {bands.map((band, i) => (
          <div
            key={i}
            className={`eq-panel__band ${!band.active || bypassed ? "eq-panel__band--bypassed" : ""}`}
          >
            <button
              className={`eq-panel__band-toggle ${band.active && !bypassed ? "eq-panel__band-toggle--on" : "eq-panel__band-toggle--off"}`}
              onClick={() => toggleBand(i)}
            >
              {band.active && !bypassed ? "On" : "Off"}
            </button>

            <div className="eq-panel__band-type">
              {band.type === "low-shelf" ? "LShlf" : band.type === "high-shelf" ? "HShlf" : "Peak"}
            </div>

            <EQKnob
              label="Freq"
              value={band.freq}
              onChange={(v) => updateBand(i, { freq: v })}
              min={20}
              max={20000}
              frequency={band.freq}
            />

            <EQKnob
              label="Gain"
              value={band.gain}
              onChange={(v) => updateBand(i, { gain: v })}
              min={-24}
              max={24}
            />

            <RotaryKnob
              label="Q"
              value={band.q}
              onChange={(v) => updateBand(i, { q: v })}
              min={0.1}
              max={10}
              size="sm"
              showValue={true}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
