import { RotaryKnob } from "./RotaryKnob";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  frequency?: number;
};

function formatFrequency(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}kHz`;
  return `${Math.round(hz)}Hz`;
}

export function EQKnob({ label, value, onChange, min = 0, max = 100, frequency }: Props) {
  return (
    <div className="rotary-knob">
      <RotaryKnob
        label=""
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        accent="#818cf8"
        size="sm"
        showValue={false}
      />
      <div className="rotary-knob__label">{label}</div>
      {frequency != null && (
        <div
          className="rotary-knob__value"
          style={{ fontSize: "0.6rem", color: "rgba(148,163,184,0.6)" }}
        >
          {formatFrequency(frequency)}
        </div>
      )}
    </div>
  );
}
