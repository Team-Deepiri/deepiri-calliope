type OrchestraStageProps = {
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
  playing: boolean;
  variant?: "panel" | "camera";
};

type MusicianKind =
  | "violin"
  | "viola"
  | "cello"
  | "bass"
  | "flute"
  | "clarinet"
  | "trumpet"
  | "horn";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const ARM_REACH = 18;

/**
 * Map a landmark into a small conducting envelope around the podium shoulder.
 * Absolute stage mapping made the arm rubber-hose to the cue diamond — we only
 * borrow direction/gesture here; the tip HUD still tracks the real fingertip.
 */
function mapArmTarget(
  lmX: number,
  lmY: number,
  shoulder: { x: number; y: number },
): { x: number; y: number } {
  const x = Number.isFinite(lmX) ? lmX : 0.5;
  const y = Number.isFinite(lmY) ? lmY : 0.55;
  const aimX = shoulder.x + (0.5 - x) * 22;
  const aimY = shoulder.y + (y - 0.58) * 18;
  const dx = aimX - shoulder.x;
  const dy = aimY - shoulder.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARM_REACH) return { x: aimX, y: aimY };
  const s = ARM_REACH / Math.max(dist, 1e-6);
  return { x: shoulder.x + dx * s, y: shoulder.y + dy * s };
}

/** Soft mid-bend for a single-stroke arm (no elbow / wrist joints). */
function armBend(
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  amount = 3.2,
): { x: number; y: number } {
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy) || 1;
  const mx = (sx + hx) * 0.5;
  const my = (sy + hy) * 0.5;
  const n1 = { x: -dy / len, y: dx / len };
  const n2 = { x: dy / len, y: -dx / len };
  const n = n1.y >= n2.y ? n1 : n2;
  return { x: mx + n.x * amount, y: my + n.y * amount };
}

/** Tapered limb polygon along a segment. */
function limbPoly(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a = `${x1 + nx * w1},${y1 + ny * w1}`;
  const b = `${x1 - nx * w1},${y1 - ny * w1}`;
  const c = `${x2 - nx * w2},${y2 - ny * w2}`;
  const d = `${x2 + nx * w2},${y2 + ny * w2}`;
  return `${a} ${b} ${c} ${d}`;
}

function playerMarks(
  cy: number,
  count: number,
  span: number,
  yCurve: number,
  x0 = 14,
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

const INSTRUMENT_FILL = "rgba(196, 168, 120, 0.72)";
const BODY_FILL = "rgba(22, 28, 40, 0.92)";
const HEAD_FILL = "rgba(232, 210, 180, 0.78)";
const SHIRT_FILL = "rgba(244, 244, 248, 0.55)";

function MusicianSilhouette({
  x,
  y,
  kind,
  scale = 1,
}: {
  x: number;
  y: number;
  kind: MusicianKind;
  scale?: number;
}) {
  const s = scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* chair seat hint */}
      <ellipse cx="0" cy="3.6" rx="2.4" ry="0.7" fill="rgba(8, 12, 22, 0.45)" />
      {/* torso */}
      <path
        d="M-1.8 1.2 Q0 -0.4 1.8 1.2 L1.5 3.4 Q0 4.1 -1.5 3.4 Z"
        fill={BODY_FILL}
      />
      <path d="M-1.1 1.4 L1.1 1.4 L0.9 2.6 L-0.9 2.6 Z" fill={SHIRT_FILL} opacity={0.7} />
      {/* head */}
      <circle cx="0" cy="-0.85" r="1.15" fill={HEAD_FILL} />
      {/* legs tucked */}
      <path
        d="M-1.3 3.3 Q-1.6 5.2 -0.4 5.6 M1.3 3.3 Q1.6 5.2 0.4 5.6"
        fill="none"
        stroke={BODY_FILL}
        strokeWidth="1.05"
        strokeLinecap="round"
      />

      {kind === "violin" || kind === "viola" ? (
        <g>
          <ellipse
            cx="1.6"
            cy="0.2"
            rx={kind === "viola" ? 1.5 : 1.25}
            ry={kind === "viola" ? 0.7 : 0.58}
            fill={INSTRUMENT_FILL}
            transform="rotate(-28 1.6 0.2)"
          />
          <line
            x1="0.4"
            y1="-0.3"
            x2="3.1"
            y2="1.35"
            stroke={INSTRUMENT_FILL}
            strokeWidth="0.35"
            strokeLinecap="round"
          />
          <line
            x1="0.2"
            y1="-0.6"
            x2="1.4"
            y2="0.9"
            stroke="rgba(232, 210, 180, 0.55)"
            strokeWidth="0.45"
            strokeLinecap="round"
          />
        </g>
      ) : null}

      {kind === "cello" ? (
        <g>
          <ellipse cx="2.1" cy="2.4" rx="1.55" ry="2.6" fill={INSTRUMENT_FILL} />
          <line
            x1="2.1"
            y1="-0.2"
            x2="2.1"
            y2="5.2"
            stroke="rgba(120, 90, 50, 0.7)"
            strokeWidth="0.35"
          />
          <line
            x1="0.5"
            y1="0.4"
            x2="2.4"
            y2="1.6"
            stroke="rgba(232, 210, 180, 0.5)"
            strokeWidth="0.4"
            strokeLinecap="round"
          />
        </g>
      ) : null}

      {kind === "bass" ? (
        <g>
          <ellipse cx="2.4" cy="1.8" rx="1.7" ry="3.1" fill={INSTRUMENT_FILL} />
          <line
            x1="2.4"
            y1="-1.2"
            x2="2.4"
            y2="5.4"
            stroke="rgba(90, 70, 40, 0.75)"
            strokeWidth="0.4"
          />
        </g>
      ) : null}

      {kind === "flute" || kind === "clarinet" ? (
        <line
          x1="-0.2"
          y1="-0.2"
          x2={kind === "flute" ? 3.4 : 2.6}
          y2="0.55"
          stroke={kind === "flute" ? "rgba(210, 215, 225, 0.75)" : "rgba(40, 90, 70, 0.8)"}
          strokeWidth={kind === "flute" ? 0.45 : 0.7}
          strokeLinecap="round"
        />
      ) : null}

      {kind === "trumpet" || kind === "horn" ? (
        <g>
          <path
            d={
              kind === "trumpet"
                ? "M0.4 0.3 L2.6 0.55 Q3.2 0.2 3.4 0.7 L2.7 0.95 Z"
                : "M0.5 0.4 Q1.6 -0.6 2.8 0.5 Q1.8 1.5 0.6 0.9 Z"
            }
            fill="rgba(201, 162, 74, 0.85)"
          />
        </g>
      ) : null}
    </g>
  );
}

/**
 * Concert-hall stage: pattern cues sit in the open air above the orchestra;
 * musicians occupy the mid risers; conductor works from the front podium.
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
  wristX,
  wristY,
  playing,
  variant = "panel",
}: OrchestraStageProps) {
  const dyn = clamp01(dynamics);
  const b = clamp01(bass);
  const m = clamp01(mid);
  const t = clamp01(treble);
  const accent = pulse || beat;
  const camera = variant === "camera";

  // Smaller podium figure, anchored near the bottom of the stage.
  const fig = { cx: 100, cy: 112, s: 0.68 };
  const shoulder = { x: 105.2, y: 98.2 };
  const hand = mapArmTarget(wristX, wristY, shoulder);
  const bend = armBend(shoulder.x, shoulder.y, hand.x, hand.y);

  // Baton aims with the tip→wrist gesture, but stays short on the hand — the
  // separate tip HUD cursor still tracks the real fingertip for cue hits.
  const tipLmX = Number.isFinite(tipX) ? tipX : 0.5;
  const tipLmY = Number.isFinite(tipY) ? tipY : 0.5;
  const wristLmX = Number.isFinite(wristX) ? wristX : 0.5;
  const wristLmY = Number.isFinite(wristY) ? wristY : 0.55;
  const dirLmX = tipLmX - wristLmX;
  const dirLmY = tipLmY - wristLmY;
  const dirLmLen = Math.hypot(dirLmX, dirLmY);
  const batonDir =
    dirLmLen > 0.01
      ? { x: -dirLmX / dirLmLen, y: dirLmY / dirLmLen }
      : { x: 0.15, y: -0.99 };
  const BATON_LEN = 7.5;
  const grip = {
    x: hand.x + batonDir.x * 0.7,
    y: hand.y + batonDir.y * 0.7,
  };
  const batonEnd = {
    x: grip.x + batonDir.x * BATON_LEN,
    y: grip.y + batonDir.y * BATON_LEN,
  };

  // Mid-stage risers — below the cue airspace, above the podium.
  // Keep rows inside the widened floor with a little margin for instruments.
  const winds = playerMarks(49, 11, 160, 4.5, 20).map((p, i) => ({
    ...p,
    kind: (i % 3 === 0 ? "flute" : i % 3 === 1 ? "clarinet" : "trumpet") as MusicianKind,
  }));
  const stringsBack = playerMarks(57, 14, 162, 5, 19).map((p, i) => ({
    ...p,
    kind: (i < 4 || i > 9 ? "viola" : "violin") as MusicianKind,
  }));
  const stringsFront = playerMarks(66, 12, 160, 5.5, 20).map((p, i) => ({
    ...p,
    kind: (i < 3 || i > 8 ? "cello" : "violin") as MusicianKind,
  }));
  const basses = playerMarks(75, 7, 146, 3.5, 27).map((p) => ({
    ...p,
    kind: "bass" as MusicianKind,
  }));

  const sectionOpacity = (level: number) =>
    0.42 + level * 0.48 + dyn * 0.08 + (camera ? 0 : 0.02);
  const sectionScale = (level: number) => 0.94 + level * 0.1 + (accent ? 0.03 : 0);

  const scaleAround = (cx: number, cy: number, s: number) =>
    `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;

  const coat = "rgba(18, 22, 34, 0.92)";
  const skin = "rgba(232, 210, 180, 0.88)";
  const shirt = "rgba(248, 250, 252, 0.92)";

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
        <linearGradient id="gestures-hall-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1520" />
          <stop offset="22%" stopColor="#241c28" />
          <stop offset="55%" stopColor="#1a2230" />
          <stop offset="100%" stopColor="#0a0e16" />
        </linearGradient>
        <linearGradient id="gestures-curtain" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a1828" />
          <stop offset="55%" stopColor="#2a0e18" />
          <stop offset="100%" stopColor="#1a0810" />
        </linearGradient>
        <linearGradient id="gestures-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(92, 64, 42, 0.55)" />
          <stop offset="100%" stopColor="rgba(28, 18, 12, 0.85)" />
        </linearGradient>
        <radialGradient id="gestures-house-light" cx="50%" cy="18%" r="55%">
          <stop offset="0%" stopColor="rgba(255, 214, 150, 0.22)" />
          <stop offset="45%" stopColor="rgba(251, 191, 36, 0.06)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </radialGradient>
        <radialGradient id="gestures-cue-air" cx="50%" cy="18%" r="38%">
          <stop offset="0%" stopColor="rgba(15, 23, 42, 0.28)" />
          <stop offset="70%" stopColor="rgba(15, 23, 42, 0.08)" />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </radialGradient>
        <linearGradient id="gestures-screen-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(28, 36, 52, 0.92)" />
          <stop offset="45%" stopColor="rgba(12, 16, 28, 0.94)" />
          <stop offset="100%" stopColor="rgba(8, 10, 18, 0.96)" />
        </linearGradient>
        <linearGradient id="gestures-screen-bezel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3d48" />
          <stop offset="40%" stopColor="#1c1e26" />
          <stop offset="100%" stopColor="#0e1016" />
        </linearGradient>
        <linearGradient id="gestures-baton-wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c4a574" />
          <stop offset="70%" stopColor="#e8d4a8" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>
      </defs>

      <rect width="200" height="120" fill="url(#gestures-hall-wash)" />
      <rect width="200" height="120" fill="url(#gestures-house-light)" />

      {/* Proscenium: thin top valance + side legs (behind the cue screen) */}
      <path
        d="M0 0 Q100 3.5 200 0 L200 5 Q100 7.5 0 5 Z"
        fill="rgba(90, 28, 48, 0.88)"
      />
      <path d="M0 0 L16 0 L11 120 L0 120 Z" fill="url(#gestures-curtain)" opacity={0.85} />
      <path d="M200 0 L184 0 L189 120 L200 120 Z" fill="url(#gestures-curtain)" opacity={0.85} />

      {/* Cue screen hangs in front of the valance so beat 4 stays clear */}
      <g className="gestures-cue-screen" opacity={0.97}>
        <line
          x1="70"
          y1="4.5"
          x2="68"
          y2="8"
          stroke="rgba(160, 150, 140, 0.5)"
          strokeWidth="0.65"
        />
        <line
          x1="130"
          y1="4.5"
          x2="132"
          y2="8"
          stroke="rgba(160, 150, 140, 0.5)"
          strokeWidth="0.65"
        />
        <ellipse cx="100" cy="42" rx="42" ry="2.2" fill="rgba(0, 0, 0, 0.35)" />
        <rect
          x="46"
          y="5.5"
          width="108"
          height="35"
          rx="2.8"
          fill="url(#gestures-screen-bezel)"
          stroke="rgba(200, 180, 150, 0.28)"
          strokeWidth="0.6"
        />
        <rect
          x="49.5"
          y="8.2"
          width="101"
          height="29.5"
          rx="1.6"
          fill="url(#gestures-screen-glass)"
          stroke="rgba(120, 140, 180, 0.18)"
          strokeWidth="0.45"
        />
        <path
          d="M52 10 L148 10 L145 15 L55 15 Z"
          fill="rgba(255, 255, 255, 0.06)"
        />
        <rect
          x="49.5"
          y="8.2"
          width="101"
          height="29.5"
          rx="1.6"
          fill={playing ? "rgba(251, 191, 36, 0.06)" : "rgba(99, 120, 180, 0.04)"}
        />
        <circle cx="52" cy="38.5" r="0.55" fill={playing ? "#6ee7b7" : "rgba(100, 116, 139, 0.7)"} />
        <circle cx="55.2" cy="38.5" r="0.55" fill="rgba(251, 191, 36, 0.55)" />
      </g>

      {/* Perspective stage floor / risers — wide enough for full orchestra rows */}
      <path
        d="M10 44 L190 44 L196 90 L4 90 Z"
        fill="url(#gestures-floor)"
        opacity={0.88}
      />
      <path
        d="M16 51 L184 51 L190 72 L10 72 Z"
        fill="rgba(60, 42, 28, 0.35)"
      />
      <path
        d="M22 58 L178 58 L184 68 L16 68 Z"
        fill="rgba(50, 34, 22, 0.4)"
      />
      <ellipse cx="100" cy="88" rx="58" ry="5.5" fill="rgba(255, 200, 120, 0.06)" />

      {/* Orchestra — mid band, under the cue airspace */}
      <g
        className="gestures-orch-section gestures-orch-section--treble"
        opacity={sectionOpacity(t)}
        transform={scaleAround(100, 50, sectionScale(t))}
      >
        {winds.map((p, i) => (
          <MusicianSilhouette key={`w-${i}`} x={p.x} y={p.y} kind={p.kind} scale={0.92} />
        ))}
      </g>

      <g
        className="gestures-orch-section gestures-orch-section--mid"
        opacity={sectionOpacity(m)}
        transform={scaleAround(100, 58, sectionScale(m))}
      >
        {stringsBack.map((p, i) => (
          <MusicianSilhouette key={`sb-${i}`} x={p.x} y={p.y} kind={p.kind} scale={0.98} />
        ))}
        {stringsFront.map((p, i) => (
          <MusicianSilhouette key={`sf-${i}`} x={p.x} y={p.y} kind={p.kind} scale={1.05} />
        ))}
      </g>

      <g
        className="gestures-orch-section gestures-orch-section--bass"
        opacity={sectionOpacity(b)}
        transform={scaleAround(100, 72, sectionScale(b))}
      >
        {basses.map((p, i) => (
          <MusicianSilhouette key={`bs-${i}`} x={p.x} y={p.y} kind={p.kind} scale={1.12} />
        ))}
      </g>

      {/* Music stands (subtle) */}
      <g opacity={0.35}>
        {[48, 72, 100, 128, 152].map((x) => (
          <g key={`st-${x}`}>
            <line x1={x} y1={62} x2={x} y2={70} stroke="rgba(180, 160, 130, 0.5)" strokeWidth="0.4" />
            <rect x={x - 2.2} y={60.2} width="4.4" height="2.2" rx="0.3" fill="rgba(30, 24, 18, 0.7)" />
          </g>
        ))}
      </g>

      {/* Smaller podium conductor — arm stays local; tip HUD does the tracking */}
      <g
        className="gestures-conductor"
        opacity={0.95}
        transform={`translate(${fig.cx} ${fig.cy}) scale(${fig.s}) translate(${-fig.cx} ${-fig.cy})`}
      >
        <ellipse cx="100" cy="116" rx="22" ry="3" fill="rgba(0, 0, 0, 0.45)" />
        <path
          d="M82 112 L118 112 L115 115.5 L85 115.5 Z"
          fill="rgba(55, 38, 24, 0.85)"
          stroke="rgba(201, 162, 74, 0.25)"
          strokeWidth="0.4"
        />
        <path
          d="M96.5 108 L95.2 115 M103.5 108 L104.8 115"
          fill="none"
          stroke={coat}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M93.5 108 Q100 105.8 106.5 108 L105.8 98 Q100 95.2 94.2 98 Z"
          fill={coat}
        />
        <path
          d="M96.5 98.8 L100 105.5 L103.5 98.8 Z"
          fill={shirt}
          opacity={0.85}
        />
        <path
          d="M96.6 98.5 L99.3 105 M103.4 98.5 L100.7 105"
          fill="none"
          stroke="rgba(248, 250, 252, 0.2)"
          strokeWidth="0.4"
        />
        <circle cx="100" cy="92.6" r="2.7" fill={skin} />
        <path
          d="M97.5 91.2 Q100 89.4 102.5 91.2 Q100 92 97.5 91.2"
          fill="rgba(28, 24, 22, 0.85)"
        />
        <polygon
          points={limbPoly(94.5, 99.4, 89.2, 107.8, 1.35, 0.95)}
          fill={coat}
        />
        <rect
          x="86.2"
          y="105.6"
          width="3.6"
          height="2.9"
          rx="0.25"
          fill="rgba(248, 245, 235, 0.55)"
          transform="rotate(-16 88 107)"
        />

        {/* Single-stroke arm + short baton (no elbow/wrist joint clutter) */}
        <g className="gestures-conductor__lead" opacity={0.98}>
          <path
            d={`M${shoulder.x} ${shoulder.y} Q${bend.x} ${bend.y} ${hand.x} ${hand.y}`}
            fill="none"
            stroke={coat}
            strokeWidth="2.6"
            strokeLinecap="round"
            className="gestures-conductor__arm"
          />
          <circle cx={hand.x} cy={hand.y} r="1.7" fill={skin} />
          <line
            x1={grip.x}
            y1={grip.y}
            x2={batonEnd.x}
            y2={batonEnd.y}
            stroke="url(#gestures-baton-wood)"
            strokeWidth="1.1"
            strokeLinecap="round"
            className="gestures-conductor__baton"
          />
          <circle
            cx={batonEnd.x}
            cy={batonEnd.y}
            r={accent ? 1.1 : 0.7}
            fill={accent ? "#fff" : "rgba(255, 248, 230, 0.95)"}
            className="gestures-conductor__tip"
          />
        </g>
      </g>

      {/* Side legs only — frames the stage edges without covering the cue screen */}
      <path d="M0 0 L14 0 L10 120 L0 120 Z" fill="url(#gestures-curtain)" opacity={0.92} />
      <path d="M200 0 L186 0 L190 120 L200 120 Z" fill="url(#gestures-curtain)" opacity={0.92} />
    </svg>
  );
}
