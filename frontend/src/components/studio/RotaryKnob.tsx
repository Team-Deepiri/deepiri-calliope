import { useCallback, useRef, useState } from "react";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  accent?: string;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
};

function ledColor(pct: number): string {
  if (pct < 0.5) return "low";
  if (pct < 0.8) return "mid";
  return "high";
}

function formatValue(v: number, min: number, max: number): string {
  const span = max - min;
  if (span <= 1) return v.toFixed(2);
  if (span <= 20) return v.toFixed(1);
  return Math.round(v).toString();
}

const TICK_COUNT = 12;
const TICK_RANGE = 270;
const TICK_START = -135;

export function RotaryKnob({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  accent = "var(--knob-accent, #818cf8)",
  size = "md",
  showValue = true,
}: Props) {
  const start = useRef({ y: 0, val: 0 });
  const [hovering, setHovering] = useState(false);

  const pct = (value - min) / (max - min);
  const rotation = TICK_START + pct * TICK_RANGE;

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const dy = start.current.y - e.clientY;
      const span = max - min;
      const next = Math.round(Math.min(max, Math.max(min, start.current.val + dy * (span / 120))));
      onChange(next);
    },
    [max, min, onChange],
  );

  const endDrag = useCallback(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    start.current = { y: e.clientY, val: value };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const color = ledColor(pct);
  const tickAngle = TICK_RANGE / (TICK_COUNT - 1);

  return (
    <div className={`rotary-knob rotary-knob--${size}`}>
      <div
        className="rotary-knob__dial-wrapper"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {hovering && (
          <div className="rotary-knob__tooltip">
            {formatValue(value, min, max)}
          </div>
        )}

        <div
          className={`rotary-knob__led-ring rotary-knob__led-ring--${color}`}
        />

        <div className="rotary-knob__ticks">
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const angle = TICK_START + i * tickAngle;
            const isMajor = i === 0 || i === Math.floor(TICK_COUNT / 2) || i === TICK_COUNT - 1;
            return (
              <div
                key={i}
                className={`rotary-knob__tick${isMajor ? " rotary-knob__tick--major" : ""}`}
                style={{ transform: `rotate(${angle}deg) translateY(-4px)` }}
              />
            );
          })}
        </div>

        <div
          className="rotary-knob__dial"
          style={{ ["--knob-accent" as string]: accent, ["--knob-rot" as string]: `${rotation}deg` }}
          onPointerDown={onPointerDown}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={label}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 5 : 1;
            if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(Math.min(max, value + step));
            if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(Math.max(min, value - step));
          }}
        >
          <span className="rotary-knob__cap" />
          <span className="rotary-knob__pointer" />
          <span className="rotary-knob__screw" />
        </div>
      </div>

      <div className="rotary-knob__label">{label}</div>
      {showValue && (
        <div className="rotary-knob__value">{formatValue(value, min, max)}</div>
      )}
    </div>
  );
}
