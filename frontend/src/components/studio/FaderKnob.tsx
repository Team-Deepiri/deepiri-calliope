import { useCallback, useRef } from "react";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  showScale?: boolean;
};

const DB_TICKS = [-60, -50, -40, -30, -24, -18, -12, -6, -3, 0, 3, 6];

function dbToPercent(db: number, minDb: number, maxDb: number): number {
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  return ((clamped - minDb) / (maxDb - minDb)) * 100;
}

function snapToDb(val: number, minDb: number, maxDb: number): number {
  const step = 0.5;
  const snapped = Math.round(val / step) * step;
  return Math.max(minDb, Math.min(maxDb, snapped));
}

function ledClass(db: number): string {
  if (db <= -24) return "";
  if (db <= -6) return " fader-knob__track-led--warm";
  return " fader-knob__track-led--hot";
}

export function FaderKnob({
  label,
  value,
  onChange,
  min = -60,
  max = 6,
  showScale = true,
}: Props) {
  const start = useRef({ y: 0, val: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);

  const pct = dbToPercent(value, min, max);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const dy = start.current.y - e.clientY;
      const span = max - min;
      const next = snapToDb(
        start.current.val + dy * (span / 200),
        min,
        max,
      );
      if (next !== value) onChange(next);
    },
    [max, min, onChange, value],
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

  const handleTrackClick = (e: React.MouseEvent) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const pctClicked = 1 - y / rect.height;
    const dbVal = min + pctClicked * (max - min);
    onChange(snapToDb(dbVal, min, max));
  };

  return (
    <div className="fader-knob">
      <div className="fader-knob__label">{label}</div>
      <div
        ref={bodyRef}
        className="fader-knob__body"
        onPointerDown={onPointerDown}
        onClick={handleTrackClick}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 2 : 0.5;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(Math.min(max, value + step));
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(Math.max(min, value - step));
        }}
      >
        {showScale && (
          <div className="fader-knob__scale">
            {DB_TICKS.map((t) => (
              <div key={t} className="fader-knob__scale-label">
                {t > 0 ? `+${t}` : t === 0 ? "0" : `${t}`}
              </div>
            ))}
          </div>
        )}

        <div className="fader-knob__track">
          <div
            className={`fader-knob__track-led${ledClass(value)}`}
            style={{ height: `${pct}%` }}
          />

          {DB_TICKS.map((t) => {
            const tp = dbToPercent(t, min, max);
            return (
              <div
                key={t}
                className={`fader-knob__track-tick${t === 0 ? " fader-knob__track-tick--major" : ""}`}
                style={{ bottom: `${tp}%` }}
              />
            );
          })}

          <div
            className="fader-knob__cap"
            style={{ bottom: `calc(${pct}% - 8px)` }}
          >
            <div className="fader-knob__cap-grip" />
          </div>
        </div>
      </div>

      <div className="fader-knob__value">
        {value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}
      </div>
    </div>
  );
}
