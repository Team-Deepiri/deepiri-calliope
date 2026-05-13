import type { ReactNode } from "react";
import { Mic2, Power, Sparkles } from "lucide-react";
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

function RackModule({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="vocal-rack__module">
      <div className="vocal-rack__module-head">
        <h3 className="vocal-rack__module-title">{title}</h3>
        {subtitle ? <p className="vocal-rack__module-sub">{subtitle}</p> : null}
      </div>
      <div className="vocal-rack__knobs vocal-rack__knobs--dense">{children}</div>
    </section>
  );
}

export function VocalRackPanel({ value, onChange, injectEnabled, onInjectChange }: Props) {
  return (
    <div className={`vocal-rack ${injectEnabled ? "vocal-rack--live" : "vocal-rack--muted"}`}>
      <div className="vocal-rack__header">
        <div className="vocal-rack__title">
          <Mic2 size={18} />
          <span>Calliope Voice Unit</span>
          <span className="vocal-rack__badge">DSP + architect</span>
        </div>
        <button
          type="button"
          className={`vocal-rack__power ${injectEnabled ? "is-on" : ""}`}
          onClick={() => onInjectChange(!injectEnabled)}
          title={injectEnabled ? "Stop sending rack to the model" : "Send rack settings in the prompt"}
        >
          <Power size={16} />
          {injectEnabled ? "Prompt inject on" : "Prompt inject off"}
        </button>
      </div>

      <p className="vocal-rack__lede">
        Twelve rotaries + role matrix. Same payload drives the <strong>numpy voice engine</strong> (preview below) and
        the LLM prompt when inject is on.
      </p>

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
        <span className="vocal-rack__presets-label">
          <Sparkles size={13} /> Presets
        </span>
        {Object.entries(VOCAL_PRESETS).map(([key, preset]) => (
          <button key={key} type="button" className="vocal-preset-btn" onClick={() => onChange({ ...preset })}>
            {key.replace(/_/g, " ")}
          </button>
        ))}
        <button type="button" className="vocal-preset-btn vocal-preset-btn--ghost" onClick={() => onChange({ ...DEFAULT_VOCAL_RACK })}>
          Reset
        </button>
      </div>

      <div className="vocal-rack__modules">
        <RackModule title="EQ & tone" subtitle="Air, body, warmth, brilliance, presence">
          <RotaryKnob label="Breath / air" value={value.breath_air} onChange={(breath_air) => onChange(set(value, { breath_air }))} accent="#22d3ee" />
          <RotaryKnob label="Chest / body" value={value.chest_body} onChange={(chest_body) => onChange(set(value, { chest_body }))} accent="#f97316" />
          <RotaryKnob label="Warmth low" value={value.warmth_low} onChange={(warmth_low) => onChange(set(value, { warmth_low }))} accent="#c084fc" />
          <RotaryKnob label="Brilliance" value={value.brilliance_air} onChange={(brilliance_air) => onChange(set(value, { brilliance_air }))} accent="#fde047" />
          <RotaryKnob label="Presence" value={value.presence_bite} onChange={(presence_bite) => onChange(set(value, { presence_bite }))} accent="#a78bfa" />
        </RackModule>

        <RackModule title="Dynamics" subtitle="Sibilance, transient punch">
          <RotaryKnob label="De-esser" value={value.de_esser} onChange={(de_esser) => onChange(set(value, { de_esser }))} accent="#34d399" />
          <RotaryKnob label="Punch snap" value={value.punch_snap} onChange={(punch_snap) => onChange(set(value, { punch_snap }))} accent="#fb923c" />
        </RackModule>

        <RackModule title="Color & space" subtitle="Drive, grit, width, time FX">
          <RotaryKnob label="Saturate" value={value.saturation_drive} onChange={(saturation_drive) => onChange(set(value, { saturation_drive }))} accent="#fbbf24" />
          <RotaryKnob label="Parallel grit" value={value.grit_parallel} onChange={(grit_parallel) => onChange(set(value, { grit_parallel }))} accent="#f43f5e" />
          <RotaryKnob label="Width" value={value.width_stereo} onChange={(width_stereo) => onChange(set(value, { width_stereo }))} accent="#60a5fa" />
          <RotaryKnob label="Motion blur" value={value.motion_blur} onChange={(motion_blur) => onChange(set(value, { motion_blur }))} accent="#38bdf8" />
          <RotaryKnob label="Room" value={value.room_send} onChange={(room_send) => onChange(set(value, { room_send }))} accent="#94a3b8" />
          <RotaryKnob label="Verb pre" value={value.verb_predelay} onChange={(verb_predelay) => onChange(set(value, { verb_predelay }))} accent="#94a3b8" />
          <RotaryKnob label="Delay throw" value={value.delay_throw} onChange={(delay_throw) => onChange(set(value, { delay_throw }))} accent="#fb7185" />
        </RackModule>

        <RackModule title="Pitch" subtitle="Tune + formant character">
          <RotaryKnob label="Tune tight" value={value.tune_tightness} onChange={(tune_tightness) => onChange(set(value, { tune_tightness }))} accent="#e879f9" />
          <RotaryKnob label="Formant" value={value.formant_shift} onChange={(formant_shift) => onChange(set(value, { formant_shift }))} accent="#2dd4bf" />
        </RackModule>
      </div>
    </div>
  );
}
