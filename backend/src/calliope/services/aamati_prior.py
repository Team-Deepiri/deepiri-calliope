"""Deep Aamati integration: mood ontology, brief alignment, optional ONNX stack."""

from __future__ import annotations

import importlib.util
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any

import numpy as np
import pandas as pd

from calliope.music.brief_analysis import BriefAnalysis, analyze_brief_text

_MOOD_ORDER = [
    "chill",
    "energetic",
    "suspenseful",
    "uplifting",
    "ominous",
    "romantic",
    "gritty",
    "dreamy",
    "frantic",
    "focused",
]

_GENRE_MOOD_BOOST: dict[str, tuple[str, ...]] = {
    "garage": ("gritty", "focused", "dreamy"),
    "house": ("energetic", "uplifting", "focused"),
    "techno": ("gritty", "ominous", "focused"),
    "dnb": ("frantic", "gritty", "energetic"),
    "hiphop": ("gritty", "focused", "energetic"),
    "ambient": ("dreamy", "chill", "ominous"),
    "jazz": ("romantic", "chill", "dreamy"),
    "pop": ("uplifting", "energetic", "romantic"),
    "metal": ("gritty", "frantic", "ominous"),
    "folk": ("romantic", "chill", "dreamy"),
    "electronic": ("focused", "dreamy", "energetic"),
}

_TEMPO_BAND = re.compile(r"(\d+)\s*[–-]\s*(\d+)")


def _load_mood_module(root: Path) -> ModuleType | None:
    path = root / "src" / "utils" / "mood_mappings.py"
    if not path.is_file():
        return None
    name = "aamati_mood_mappings_calliope"
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _parse_tempo_band(table_val: str) -> tuple[float, float] | None:
    m = _TEMPO_BAND.search(table_val.replace("—", "–"))
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def _tempo_score(bpm: float | None, band: tuple[float, float] | None) -> float:
    if bpm is None or band is None:
        return 0.35
    lo, hi = band
    mid = (lo + hi) / 2
    span = max(hi - lo, 1.0)
    dist = abs(bpm - mid) / span
    return max(0.0, 1.0 - dist)


def _energy_to_density_proxy(energy: float) -> float:
    return 5 + energy * 32


def _energy_to_dyn_proxy(energy: float) -> float:
    return 25 + energy * 95


def _parse_numeric_field(desc: dict[str, str], key: str) -> tuple[float, float] | None:
    raw = desc.get(key)
    if not raw or isinstance(raw, str) is False:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)", raw)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


@dataclass
class MoodAlignment:
    mood: str
    score: float
    emoji: str | None = None
    feature_targets: dict[str, str] = field(default_factory=dict)
    table_summary: str | None = None


@dataclass
class AamatiAlignmentResult:
    brief: BriefAnalysis
    ranked_moods: list[MoodAlignment]
    ontology_version: str = "mood_mappings.py"
    onnx_mood: str | None = None
    onnx_probabilities: dict[str, float] | None = None


class AamatiPrior:
    """Scores Aamati moods against Calliope brief analysis + exposes MOOD_FEATURE_MAP."""

    def __init__(self, root: Path | None = None) -> None:
        from calliope.config import get_settings

        self._root = Path(root) if root is not None else Path(get_settings().aamati_root)
        self._mod = _load_mood_module(self._root)

    @property
    def root(self) -> Path:
        return self._root

    @property
    def available(self) -> bool:
        return self._mod is not None

    def groove_ontology(self) -> dict[str, Any]:
        if not self._mod:
            return {"ok": False, "detail": "mood_mappings.py not found"}
        return {
            "ok": True,
            "moods": list(_MOOD_ORDER),
            "mood_feature_map": dict(getattr(self._mod, "MOOD_FEATURE_MAP", {})),
            "emoji_map": dict(getattr(self._mod, "EMOJI_MAP", {})),
            "mood_data_table": dict(getattr(self._mod, "MOOD_DATA_TABLE", {})),
        }

    def _score_one(self, mood: str, brief: BriefAnalysis) -> float:
        if not self._mod:
            return 0.0
        table: dict = getattr(self._mod, "MOOD_DATA_TABLE", {})
        desc = table.get(mood)
        if not isinstance(desc, dict):
            return 0.0

        score = 0.0
        bpm = float(brief.tempo_bpm) if brief.tempo_bpm else None
        band = _parse_tempo_band(str(desc.get("Tempo (BPM)", "")))
        score += 1.15 * _tempo_score(bpm, band)

        den = _parse_numeric_field(desc, "Density")
        if den:
            proxy = _energy_to_density_proxy(brief.energy)
            lo, hi = den
            mid = (lo + hi) / 2
            span = max(hi - lo, 1.0)
            score += 0.55 * max(0.0, 1.0 - abs(proxy - mid) / span)

        dyn = _parse_numeric_field(desc, "Dynamic Range")
        if dyn:
            proxy = _energy_to_dyn_proxy(brief.energy)
            lo, hi = dyn
            mid = (lo + hi) / 2
            span = max(hi - lo, 1.0)
            score += 0.45 * max(0.0, 1.0 - abs(proxy - mid) / span)

        nrg = _parse_numeric_field(desc, "Energy")
        if nrg:
            proxy = 4 + brief.energy * 12
            lo, hi = nrg
            mid = (lo + hi) / 2
            span = max(hi - lo, 1.0)
            score += 0.4 * max(0.0, 1.0 - abs(proxy - mid) / span)

        sync = _parse_numeric_field(desc, "Syncopation")
        if sync:
            proxy = brief.swing_bias * 0.1
            lo, hi = sync
            mid = (lo + hi) / 2
            span = max(hi - lo, 0.02)
            score += 0.35 * max(0.0, 1.0 - abs(proxy - mid) / span)

        for g in brief.genres:
            boosts = _GENRE_MOOD_BOOST.get(g)
            if boosts and mood in boosts:
                score += 0.45

        if brief.valence < 0.45 and mood in ("ominous", "suspenseful", "gritty"):
            score += 0.2
        if brief.valence > 0.58 and mood in ("uplifting", "romantic", "dreamy"):
            score += 0.2
        if brief.swing_bias > 0.58 and mood in ("dreamy", "romantic", "chill"):
            score += 0.15
        if brief.swing_bias < 0.42 and mood in ("focused", "energetic", "frantic"):
            score += 0.12

        return float(score)

    def align(self, text: str) -> AamatiAlignmentResult:
        brief = analyze_brief_text(text)
        ranked: list[MoodAlignment] = []
        if not self._mod:
            return AamatiAlignmentResult(brief=brief, ranked_moods=[])

        emoji = dict(getattr(self._mod, "EMOJI_MAP", {}))
        mf = dict(getattr(self._mod, "MOOD_FEATURE_MAP", {}))
        table = dict(getattr(self._mod, "MOOD_DATA_TABLE", {}))

        for mood in _MOOD_ORDER:
            s = self._score_one(mood, brief)
            targets = dict(mf.get(mood, {}))
            row = table.get(mood)
            summary = None
            if isinstance(row, dict):
                summary = str(row.get("Desc", ""))[:320]
            ranked.append(
                MoodAlignment(
                    mood=mood,
                    score=s,
                    emoji=emoji.get(mood),
                    feature_targets=targets,
                    table_summary=summary,
                )
            )

        ranked.sort(key=lambda x: x.score, reverse=True)

        onnx_mood, onnx_probs = _try_onnx_predict(self._root, brief, ranked[0].mood if ranked else "focused")

        return AamatiAlignmentResult(
            brief=brief,
            ranked_moods=ranked,
            onnx_mood=onnx_mood,
            onnx_probabilities=onnx_probs,
        )

    def build_llm_injection(self, brief: BriefAnalysis, top_k: int = 3) -> str:
        """Rich text block appended to LLM user payloads."""
        if not self._mod:
            return ""
        prior = self.align(brief.raw_text)
        top = prior.ranked_moods[:top_k]
        lines = [
            "[Aamati groove ontology — prior]\n",
            "Ranked moods from deterministic alignment to Aamati MOOD_DATA_TABLE + genre heuristics:",
        ]
        for m in top:
            tgt = ", ".join(f"{k}={v}" for k, v in m.feature_targets.items()) if m.feature_targets else ""
            em = m.emoji or ""
            lines.append(f"  - {em} {m.mood} (score {m.score:.2f}) :: {tgt}")
            if m.table_summary:
                lines.append(f"    Notes: {m.table_summary}")
        if prior.onnx_mood:
            lines.append(f"\nAamati ONNX groove classifier (when encoder artifacts present): {prior.onnx_mood}")
            if prior.onnx_probabilities:
                top_p = sorted(prior.onnx_probabilities.items(), key=lambda kv: kv[1], reverse=True)[:4]
                lines.append("  Top probs: " + ", ".join(f"{k}:{v:.2f}" for k, v in top_p))
        lines.append(
            "\nUse these targets as *soft constraints* for groove, fills, FX, and timing feel. "
            "If the producer brief conflicts, explain the musical tradeoff explicitly."
        )
        return "\n".join(lines) + "\n"


def _try_onnx_predict(root: Path, brief: BriefAnalysis, top_mood: str) -> tuple[str | None, dict[str, float] | None]:
    onnx_path = root / "models" / "trained" / "groove_mood_model.onnx"
    enc_path = root / "categorical_encoder.pkl"
    lab_path = root / "label_encoder.pkl"
    if not (onnx_path.is_file() and enc_path.is_file() and lab_path.is_file()):
        return None, None
    try:
        import joblib
        import onnxruntime as ort

        encoder = joblib.load(enc_path)
        label_encoder = joblib.load(lab_path)
        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        inp_name = sess.get_inputs()[0].name
    except Exception:
        return None, None

    mod = _load_mood_module(root)
    if not mod:
        return None, None
    mf = dict(getattr(mod, "MOOD_FEATURE_MAP", {}))
    cat = mf.get(top_mood, {})
    timing_feel = str(cat.get("timing_feel", "mid"))
    rhythmic_density = str(cat.get("rhythmic_density", "medium"))
    dynamic_intensity = str(cat.get("dynamic_intensity", "varied"))
    fill_activity = str(cat.get("fill_activity", "moderate"))
    fx_character = str(cat.get("fx_character", "dry, punchy, sharp"))

    tempo = float(brief.tempo_bpm or 120.0)
    swing = float(brief.swing_bias * 0.35)
    density = float(8 + brief.complexity * 28)
    dynamic_range = float(30 + brief.energy * 90)
    energy = float(4 + brief.energy * 11)
    mean_note_length = float(0.35 + brief.swing_bias * 0.25)
    std_note_length = float(0.12 + brief.complexity * 0.2)
    velocity_mean = float(55 + brief.energy * 35)
    velocity_std = float(10 + brief.complexity * 22)
    pitch_mean = float(58 + brief.valence * 12)
    pitch_range = float(16 + brief.complexity * 18)
    avg_polyphony = float(3 + brief.complexity * 6)
    syncopation = float(0.02 + brief.swing_bias * 0.06)
    onset_entropy = float(2.0 + brief.complexity * 1.8)
    instrument_count = float(3 + round(brief.complexity * 6))

    row = pd.DataFrame(
        [
            {
                "timing_feel": timing_feel,
                "rhythmic_density": rhythmic_density,
                "dynamic_intensity": dynamic_intensity,
                "fill_activity": fill_activity,
                "fx_character": fx_character,
                "tempo": tempo,
                "swing": swing,
                "density": density,
                "dynamic_range": dynamic_range,
                "energy": energy,
                "mean_note_length": mean_note_length,
                "std_note_length": std_note_length,
                "velocity_mean": velocity_mean,
                "velocity_std": velocity_std,
                "pitch_mean": pitch_mean,
                "pitch_range": pitch_range,
                "avg_polyphony": avg_polyphony,
                "syncopation": syncopation,
                "onset_entropy": onset_entropy,
                "instrument_count": instrument_count,
            }
        ]
    )

    try:
        cat_mx = encoder.transform(row[["timing_feel", "rhythmic_density", "dynamic_intensity", "fill_activity", "fx_character"]])
        num_mx = row[
            [
                "tempo",
                "swing",
                "density",
                "dynamic_range",
                "energy",
                "mean_note_length",
                "std_note_length",
                "velocity_mean",
                "velocity_std",
                "pitch_mean",
                "pitch_range",
                "avg_polyphony",
                "syncopation",
                "onset_entropy",
                "instrument_count",
            ]
        ].values.astype(np.float32)
        x = np.hstack([cat_mx, num_mx]).astype(np.float32)
        out_label, out_prob = sess.run(None, {inp_name: x})
        pred_idx = int(np.array(out_label).ravel()[0])
        mood_name = str(label_encoder.inverse_transform([pred_idx])[0])
        probs: dict[str, float] = {}
        try:
            prob_obj = out_prob[0] if isinstance(out_prob, (list, tuple)) else out_prob
            if hasattr(prob_obj, "tolist"):
                arr = np.array(prob_obj.tolist(), dtype=float).ravel()
                names = list(label_encoder.classes_)
                for i, p in enumerate(arr):
                    if i < len(names):
                        probs[str(names[i])] = float(p)
        except Exception:
            probs = {mood_name: 1.0}
        return mood_name, probs or {mood_name: 1.0}
    except Exception:
        return None, None


def health_payload(root: Path) -> dict[str, Any]:
    prior = AamatiPrior(root)
    onnx_path = root / "models" / "trained" / "groove_mood_model.onnx"
    enc = (root / "categorical_encoder.pkl").is_file()
    lab = (root / "label_encoder.pkl").is_file()
    return {
        "aamati_path": str(root),
        "mood_mappings_loaded": prior.available,
        "mood_labels_loaded": prior.available,
        "onnx_model_present": onnx_path.is_file(),
        "onnx_ready": onnx_path.is_file() and enc and lab,
        "detail": None if prior.available else "mood_mappings.py not readable",
    }
