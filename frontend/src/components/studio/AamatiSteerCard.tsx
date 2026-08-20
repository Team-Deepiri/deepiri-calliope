import type { AamatiComposeResult, AamatiSteer } from "../../api/client";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function AamatiSteerCard({
  title,
  result,
}: {
  title: string;
  result: AamatiComposeResult;
}) {
  const s: AamatiSteer = result.steer;
  const sections = result.arrangement.sections ?? [];
  return (
    <div className="aamati-steer">
      <div className="aamati-steer__head">
        <strong>{title}</strong>
        <span className="aamati-steer__src">{s.source}</span>
      </div>
      <p className="aamati-steer__mood">
        {s.mood}
        {s.mood_score > 0 ? ` · ${s.mood_score.toFixed(2)}` : ""}
      </p>
      <p className="aamati-steer__why">{s.rationale}</p>
      <dl className="aamati-steer__grid">
        <div>
          <dt>BPM</dt>
          <dd>{s.bpm}</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>
            {s.key} {s.scale_type}
          </dd>
        </div>
        <div>
          <dt>Harmony</dt>
          <dd>{s.harmony_mood}</dd>
        </div>
        <div>
          <dt>Drums</dt>
          <dd>{pct(s.drum_density)}</dd>
        </div>
        <div>
          <dt>Swing</dt>
          <dd>{pct(s.swing)}</dd>
        </div>
        <div>
          <dt>Fills</dt>
          <dd>{pct(s.fill_activity)}</dd>
        </div>
        <div>
          <dt>Bright / warm</dt>
          <dd>
            {pct(s.mix.brightness)} / {pct(s.mix.warmth)}
          </dd>
        </div>
        <div>
          <dt>Punch / LUFS</dt>
          <dd>
            {pct(s.mix.punch)} / {s.mix.target_lufs.toFixed(1)}
          </dd>
        </div>
      </dl>
      <p className="aamati-steer__form">
        {sections.map((sec) => sec.name).join(" → ") || "—"} · {result.arrangement.total_bars} bars
      </p>
    </div>
  );
}
