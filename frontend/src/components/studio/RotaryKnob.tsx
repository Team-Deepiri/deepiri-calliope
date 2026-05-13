import { useCallback, useRef } from "react";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  accent?: string;
};

export function RotaryKnob({ label, value, onChange, min = 0, max = 100, accent = "var(--knob-accent, #818cf8)" }: Props) {
  const start = useRef({ y: 0, val: 0 });

  const pct = (value - min) / (max - min);
  const rotation = -135 + pct * 270;

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

  return (
    <div className="rotary-knob">
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
      </div>
      <div className="rotary-knob__label">{label}</div>
      <div className="rotary-knob__value">{value}</div>
    </div>
  );
}
