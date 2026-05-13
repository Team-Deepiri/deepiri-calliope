import { Mic2, Power } from "lucide-react";
import { RotaryKnob } from "./RotaryKnob";
import {
  DEFAULT_VOCAL_RACK,
  VOCAL_PRESETS,
  VOCAL_ROLE_OPTIONS,
  type VocalRackPayload,
  type VocalRole,
} from "../../types/vocalRack";

type Props = {
  value: VocalRackPayload;
  onChange: (v: VocalRackPayload) => void;
  injectEnabled: boolean;
  onInjectChange: (on: boolean) => void;
};

const set = (prev: VocalRackPayload, patch: Partial<VocalRackPayload>): VocalRackPayload => ({ ...prev, ...patch });

export function VocalRackPanel({ value, onChange, injectEnabled, onInjectChange }: Props) {
  return (
    <div className={`vocal-rack ${injectEnabled ? "vocal-rack--live" : "vocal-rack--muted"}`}>
      <div className="vocal-rack__header">
        <div className="vocal-rack__title">
          <Mic2 size={18} />
          <span>Vocal chain</span>
          <span className="vocal-rack__badge">AUX → architect</span>
        </div>
        <button
          type="button"
          className={`vocal-rack__power ${injectEnabled ? "is-on" : ""}`}
          onClick={() => onInjectChange(!injectEnabled)}
          title={injectEnabled ? "Stop sending rack to the model" : "Send rack settings in the prompt"}
        >
          <Power size={16} />
          {injectEnabled ? "Inject on" : "Inject off"}
        </button>
      </div>

      <div className="vocal-rack__roles" role="tablist" aria-label="Vocal role">
        {VOCAL_ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`vocal-role-chip ${value.role === opt.value ? "is-active" : ""}`}
            onClick={() => onChange(set(value, { role: opt.value as VocalRole }))}
            title={opt.hint}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="vocal-rack__presets">
        {Object.entries(VOCAL_PRESETS).map(([key, preset]) => (
          <button key={key} type="button" className="vocal-preset-btn" onClick={() => onChange({ ...preset })}>
            {key.replace(/_/g, " ")}
          </button>
        ))}
        <button type="button" className="vocal-preset-btn vocal-preset-btn--ghost" onClick={() => onChange({ ...DEFAULT_VOCAL_RACK })}>
          Reset defaults
        </button>
      </div>

      <div className="vocal-rack__knobs">
        <RotaryKnob label="Breath / air" value={value.breath_air} onChange={(breath_air) => onChange(set(value, { breath_air }))} accent="#22d3ee" />
        <RotaryKnob label="Chest / body" value={value.chest_body} onChange={(chest_body) => onChange(set(value, { chest_body }))} accent="#f97316" />
        <RotaryKnob label="Presence" value={value.presence_bite} onChange={(presence_bite) => onChange(set(value, { presence_bite }))} accent="#a78bfa" />
        <RotaryKnob label="De-esser" value={value.de_esser} onChange={(de_esser) => onChange(set(value, { de_esser }))} accent="#34d399" />
        <RotaryKnob label="Saturate" value={value.saturation_drive} onChange={(saturation_drive) => onChange(set(value, { saturation_drive }))} accent="#fbbf24" />
        <RotaryKnob label="Width" value={value.width_stereo} onChange={(width_stereo) => onChange(set(value, { width_stereo }))} accent="#60a5fa" />
        <RotaryKnob label="Room" value={value.room_send} onChange={(room_send) => onChange(set(value, { room_send }))} accent="#94a3b8" />
        <RotaryKnob label="Delay throw" value={value.delay_throw} onChange={(delay_throw) => onChange(set(value, { delay_throw }))} accent="#fb7185" />
        <RotaryKnob label="Tune tight" value={value.tune_tightness} onChange={(tune_tightness) => onChange(set(value, { tune_tightness }))} accent="#e879f9" />
        <RotaryKnob label="Formant" value={value.formant_shift} onChange={(formant_shift) => onChange(set(value, { formant_shift }))} accent="#2dd4bf" />
      </div>
    </div>
  );
}
