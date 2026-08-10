import { FIGURE_EDGES } from "../../gestures/patternConduct";
import type { PatternBeat, PatternTarget } from "../../gestures/patternConduct";
import { OrchestraStage } from "./OrchestraStage";

function pct(v: number, fallback: number): number {
  return Number.isFinite(v) ? v * 100 : fallback * 100;
}

function mirrorX(x: number, fallback = 0.5): number {
  return pct(1 - (Number.isFinite(x) ? x : fallback), 0.5);
}

export type ConductOverlayProps = {
  conductMode: "pattern" | "free";
  playing: boolean;
  bass: number;
  mid: number;
  treble: number;
  dynamics: number;
  pulse: boolean;
  beat: boolean;
  tipX: number;
  tipY: number;
  wristX: number;
  wristY: number;
  nextBeat: PatternBeat;
  /** 0 = primary ictus, 1 = mid-path cue within the beat. */
  cuePhase: number;
  targets: PatternTarget[];
  pathEdges: Array<[PatternBeat, PatternBeat]>;
};

function midpoint(
  a: PatternTarget,
  b: PatternTarget,
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Full-bleed conducting overlay for the camera stage:
 * hall + orchestra backdrop, pattern cues above the orchestra, tip cursor.
 */
export function ConductOverlay({
  conductMode,
  playing,
  bass,
  mid,
  treble,
  dynamics,
  pulse,
  beat,
  tipX,
  tipY,
  wristX,
  wristY,
  nextBeat,
  cuePhase,
  targets,
  pathEdges,
}: ConductOverlayProps) {
  const midCues = pathEdges
    .map(([a, b], i) => {
      const pa = targets.find((t) => t.beat === a);
      const pb = targets.find((t) => t.beat === b);
      if (!pa || !pb) return null;
      const m = midpoint(pa, pb);
      const lit =
        conductMode === "pattern" &&
        a === nextBeat &&
        cuePhase >= 0.45;
      return { key: `mid-${a}-${b}-${i}`, ...m, lit, from: a, to: b };
    })
    .filter(Boolean) as Array<{
    key: string;
    x: number;
    y: number;
    lit: boolean;
    from: PatternBeat;
    to: PatternBeat;
  }>;

  return (
    <div
      className={
        "gestures-conduct-overlay" +
        (playing ? " gestures-conduct-overlay--live" : "") +
        (pulse || beat ? " gestures-conduct-overlay--pulse" : "")
      }
      aria-hidden
    >
      <OrchestraStage
        variant="panel"
        bass={bass}
        mid={mid}
        treble={treble}
        dynamics={dynamics}
        pulse={pulse}
        beat={beat}
        tipX={tipX}
        tipY={tipY}
        wristX={wristX}
        wristY={wristY}
        playing={playing}
      />

      {conductMode === "pattern" && (
        <div className="gestures-pattern-hud">
          <svg className="gestures-pattern-path" viewBox="0 0 100 100" preserveAspectRatio="none">
            {FIGURE_EDGES.map(([a, b]) => {
              const pa = targets.find((t) => t.beat === a);
              const pb = targets.find((t) => t.beat === b);
              if (!pa || !pb) return null;
              return (
                <line
                  key={`mesh-${a}-${b}`}
                  x1={(1 - pa.x) * 100}
                  y1={pa.y * 100}
                  x2={(1 - pb.x) * 100}
                  y2={pb.y * 100}
                  stroke="rgba(148, 163, 184, 0.16)"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
              );
            })}
            {pathEdges.map(([a, b]) => {
              const pa = targets.find((t) => t.beat === a);
              const pb = targets.find((t) => t.beat === b);
              if (!pa || !pb) return null;
              return (
                <line
                  key={`path-${a}-${b}`}
                  x1={(1 - pa.x) * 100}
                  y1={pa.y * 100}
                  x2={(1 - pb.x) * 100}
                  y2={pb.y * 100}
                  stroke="rgba(251, 191, 36, 0.62)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {targets.map((t) => {
            const isLit = t.beat === nextBeat && cuePhase < 0.45;
            return (
              <span
                key={t.beat}
                className={
                  "gestures-pattern-node gestures-pattern-node--waypoint" +
                  (isLit ? " gestures-pattern-node--active" : "") +
                  (isLit && pulse ? " gestures-pattern-node--ictus" : "")
                }
                style={{
                  left: `${mirrorX(t.x)}%`,
                  top: `${pct(t.y, 0.5)}%`,
                }}
              >
                {t.label}
              </span>
            );
          })}

          {midCues.map((c) => (
            <span
              key={c.key}
              className={
                "gestures-pattern-node gestures-pattern-node--mid" +
                (c.lit ? " gestures-pattern-node--active gestures-pattern-node--mid-active" : "")
              }
              style={{
                left: `${mirrorX(c.x)}%`,
                top: `${pct(c.y, 0.5)}%`,
              }}
            />
          ))}
        </div>
      )}

      <span
        className={"gestures-baton-tip" + (beat ? " gestures-baton-tip--beat" : "")}
        style={{
          left: `${mirrorX(tipX, 0.5)}%`,
          top: `${pct(tipY, 0.5)}%`,
        }}
      />
    </div>
  );
}
