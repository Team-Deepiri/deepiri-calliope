type OrchestraStageProps = {
  bass: number;
  mid: number;
  treble: number;
  dynamics: number;
  pulse: boolean;
  beat: boolean;
  tipX: number;
  tipY: number;
  playing: boolean;
  variant?: "panel" | "camera";
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Arc of player marks along a horseshoe row. */
function playerMarks(
  cy: number,
  count: number,
  span: number,
  yCurve: number,
  x0 = 12,
): Array<{ x: number; y: number }> {
  const marks: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = x0 + t * span;
    const dip = Math.sin(t * Math.PI) * yCurve;
    marks.push({ x, y: cy + dip });
  }
  return marks;
}

/**
 * Depth-layered stage: orchestra in the far band, open mid-air for the
 * conducting figure, quiet podium conductor in the foreground.
 */
export function OrchestraStage({
  bass,
  mid,
  treble,
  dynamics,
  pulse,
  beat,
  tipX,
  tipY,
  playing,
  variant = "panel",
}: OrchestraStageProps) {
  const dyn = clamp01(dynamics);
  const b = clamp01(bass);
  const m = clamp01(mid);
  const t = clamp01(treble);
  const accent = pulse || beat;
  const camera = variant === "camera";

  const batonX = (1 - (Number.isFinite(tipX) ? tipX : 0.5)) * 200;
  const batonY = (Number.isFinite(tipY) ? tipY : 0.5) * 120;

  // Podium conductor sits low; arm still reaches into the cue well.
  const shoulder = { x: 100, y: 104 };
  const elbow = {
    x: shoulder.x + (batonX - shoulder.x) * 0.42,
    y: shoulder.y + (batonY - shoulder.y) * 0.42,
  };

  // Far band only — leaves the middle third open for the pattern HUD.
  const trebleRow = playerMarks(10, 15, 176, 6);
  const midRow = playerMarks(18, 13, 176, 7);
  const bassRow = playerMarks(26, 11, 176, 6);

  const sectionOpacity = (level: number) =>
    0.18 + level * 0.42 + dyn * 0.1 + (camera ? 0 : 0.04);
  const sectionScale = (level: number) => 0.88 + level * 0.22 + (accent ? 0.05 : 0);

  const scaleAround = (cx: number, cy: number, s: number) =>
    `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;

  return (
    <svg
      className={
        "gestures-orchestra-stage" +
        (camera ? " gestures-orchestra-stage--camera" : "") +
        (playing ? " gestures-orchestra-stage--live" : "") +
        (accent ? " gestures-orchestra-stage--pulse" : "")
      }
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="gestures-stage-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(251, 191, 36, 0.07)" />
          <stop offset="28%" stopColor="rgba(15, 23, 42, 0.2)" />
          <stop offset="55%" stopColor="rgba(15, 23, 42, 0.08)" />
          <stop offset="100%" stopColor="rgba(2, 6, 23, 0.65)" />
        </linearGradient>
        <radialGradient id="gestures-stage-spot" cx="50%" cy="22%" r="48%">
          <stop offset="0%" stopColor="rgba(253, 230, 138, 0.16)" />
          <stop offset="50%" stopColor="rgba(251, 191, 36, 0.04)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </radialGradient>
        {/* Soft well behind the conducting figure */}
        <radialGradient id="gestures-cue-well" cx="50%" cy="52%" r="42%">
          <stop offset="0%" stopColor="rgba(15, 23, 42, 0.35)" />
          <stop offset="70%" stopColor="rgba(15, 23, 42, 0.12)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </radialGradient>
      </defs>

      <rect width="200" height="120" fill="url(#gestures-stage-wash)" />
      <rect width="200" height="120" fill="url(#gestures-stage-spot)" />
      <ellipse cx="100" cy="58" rx="62" ry="38" fill="url(#gestures-cue-well)" />

      <g
        className="gestures-orch-section gestures-orch-section--treble"
        opacity={sectionOpacity(t)}
        transform={scaleAround(100, 12, sectionScale(t))}
      >
        {trebleRow.map((p, i) => (
          <g key={`tr-${i}`} transform={`translate(${p.x}, ${p.y})`}>
            <rect x="-0.9" y="-3.8" width="1.8" height="4" rx="0.7" fill="rgba(129, 140, 248, 0.75)" />
            <circle cy="-4.8" r="1.05" fill="rgba(199, 210, 254, 0.85)" />
          </g>
        ))}
      </g>

      <g
        className="gestures-orch-section gestures-orch-section--mid"
        opacity={sectionOpacity(m)}
        transform={scaleAround(100, 20, sectionScale(m))}
      >
        {midRow.map((p, i) => (
          <g key={`md-${i}`} transform={`translate(${p.x}, ${p.y})`}>
            <rect x="-1" y="-4.2" width="2" height="4.4" rx="0.7" fill="rgba(52, 211, 153, 0.72)" />
            <circle cy="-5.2" r="1.1" fill="rgba(167, 243, 208, 0.85)" />
          </g>
        ))}
      </g>

      <g
        className="gestures-orch-section gestures-orch-section--bass"
        opacity={sectionOpacity(b)}
        transform={scaleAround(100, 28, sectionScale(b))}
      >
        {bassRow.map((p, i) => (
          <g key={`bs-${i}`} transform={`translate(${p.x}, ${p.y})`}>
            <rect x="-1.1" y="-4.5" width="2.2" height="4.8" rx="0.75" fill="rgba(249, 115, 22, 0.72)" />
            <circle cy="-5.6" r="1.15" fill="rgba(253, 186, 116, 0.85)" />
          </g>
        ))}
      </g>

      {/* Quiet podium figure — atmosphere, not competing with cues */}
      <g className="gestures-conductor" opacity={0.55}>
        <ellipse
          cx="100"
          cy="114"
          rx="22"
          ry="4"
          fill="rgba(15, 23, 42, 0.5)"
          stroke="rgba(251, 191, 36, 0.12)"
          strokeWidth="0.5"
        />
        <line
          x1="97"
          y1="110"
          x2="95"
          y2="116"
          stroke="rgba(226, 232, 240, 0.4)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <line
          x1="103"
          y1="110"
          x2="105"
          y2="116"
          stroke="rgba(226, 232, 240, 0.4)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M95 110 Q100 107 105 110 L104 100 Q100 97 96 100 Z"
          fill="rgba(30, 41, 59, 0.55)"
          stroke="rgba(248, 250, 252, 0.25)"
          strokeWidth="0.6"
        />
        <circle cx="100" cy="94" r="2.8" fill="rgba(241, 245, 249, 0.45)" />
        <path
          d="M96 102 Q90 105 87 109"
          fill="none"
          stroke="rgba(226, 232, 240, 0.3)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </g>

      {/* Baton arm stays brighter — this is the mirror of you */}
      <g className="gestures-conductor__lead" opacity={0.92}>
        <path
          d={`M${shoulder.x} ${shoulder.y} Q${elbow.x} ${elbow.y} ${batonX} ${batonY}`}
          fill="none"
          stroke="rgba(248, 250, 252, 0.7)"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="gestures-conductor__arm"
        />
        <line
          x1={batonX}
          y1={batonY}
          x2={batonX + (batonX - shoulder.x) * 0.07}
          y2={batonY + (batonY - shoulder.y) * 0.07 - 1.5}
          stroke="rgba(251, 191, 36, 0.95)"
          strokeWidth="1.35"
          strokeLinecap="round"
          className="gestures-conductor__baton"
        />
        <circle
          cx={batonX}
          cy={batonY}
          r={accent ? 2.1 : 1.4}
          fill={accent ? "#fff" : "rgba(251, 191, 36, 0.9)"}
          className="gestures-conductor__tip"
        />
      </g>
    </svg>
  );
}
