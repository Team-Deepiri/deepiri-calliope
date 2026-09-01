"""Trained MLP that writes a vocal melody from lyric syllables.

Timing stays rule-based (bpm / arrangement). Pitch is a small ReLU network
trained on cadence-aware teacher melodies, then saved as NumPy weights so
Generate vocal can run it with no extra ML runtime.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np

from calliope.audio.vocal_synth import (
    GENRE_PALETTE,
    VOICE_RANGES,
    _NOTE_TO_MIDI,
    _SCALES,
    _clamp_midi,
    _scale_pitches,
)

WEIGHTS_PATH = Path(__file__).resolve().parent / "weights" / "vocal_melody_mlp.npz"
N_FEATURES = 12
_VOWEL_ID = {"a": 0.0, "e": 0.2, "i": 0.4, "o": 0.6, "u": 0.8, "y": 1.0}
_GENRES = tuple(sorted(GENRE_PALETTE))
_ARRANGEMENTS = (
    "verse-chorus",
    "verse-chorus-bridge",
    "through-composed",
    "strophic",
    "freeform",
)


def weights_available() -> bool:
    return WEIGHTS_PATH.is_file()


def melody_model_id() -> str:
    return "vocal_mlp" if weights_available() else "heuristic"


def _vowel_feat(tok: str) -> float:
    for ch in tok.lower():
        if ch in _VOWEL_ID:
            return _VOWEL_ID[ch]
    return 0.5


def syllable_features(
    *,
    tok: str,
    i: int,
    n: int,
    phrase_idx: int,
    n_phrases: int,
    phrase_end: bool,
    phrase_start: bool,
    genre_preset: str,
    arrangement_style: str,
    prev_idx: float,
    prev2_idx: float,
    pool_len: int,
    lo: int,
    hi: int,
) -> np.ndarray:
    g = _GENRES.index(genre_preset) / max(len(_GENRES) - 1, 1) if genre_preset in _GENRES else 0.0
    try:
        a = _ARRANGEMENTS.index(arrangement_style) / max(len(_ARRANGEMENTS) - 1, 1)
    except ValueError:
        a = 0.0
    return np.array(
        [
            i / max(n - 1, 1),
            phrase_idx / max(n_phrases - 1, 1),
            1.0 if phrase_end else 0.0,
            1.0 if phrase_start else 0.0,
            _vowel_feat(tok),
            min(len(tok), 8) / 8.0,
            g,
            a,
            prev_idx / max(pool_len - 1, 1),
            prev2_idx / max(pool_len - 1, 1),
            (lo + hi) / 2.0 / 80.0,
            1.0 if phrase_idx >= max(1, n_phrases // 2) else 0.0,
        ],
        dtype=np.float32,
    )


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0)


@lru_cache(maxsize=1)
def _load_weights() -> dict[str, np.ndarray] | None:
    if not WEIGHTS_PATH.is_file():
        return None
    data = np.load(WEIGHTS_PATH)
    return {k: data[k] for k in data.files}


def _forward(x: np.ndarray, w: dict[str, np.ndarray]) -> float:
    h = _relu(x @ w["w1"] + w["b1"])
    h = _relu(h @ w["w2"] + w["b2"])
    y = h @ w["w3"] + w["b3"]
    return float(np.asarray(y).reshape(-1)[0])


def predict_scale_indices(
    flat: list[tuple[str, int, bool]],
    *,
    pool_len: int,
    n_phrases: int,
    genre_preset: str,
    arrangement_style: str,
    lo: int,
    hi: int,
) -> list[int] | None:
    """Autoregressive scale-index sequence, or None if weights are missing."""
    w = _load_weights()
    if w is None or pool_len <= 0:
        return None
    n = len(flat)
    prev = pool_len / 2.0
    prev2 = prev
    out: list[int] = []
    for i, (tok, phrase_idx, phrase_end) in enumerate(flat):
        feat = syllable_features(
            tok=tok,
            i=i,
            n=n,
            phrase_idx=phrase_idx,
            n_phrases=n_phrases,
            phrase_end=phrase_end,
            phrase_start=i == 0 or phrase_idx != flat[i - 1][1],
            genre_preset=genre_preset,
            arrangement_style=arrangement_style,
            prev_idx=prev,
            prev2_idx=prev2,
            pool_len=pool_len,
            lo=lo,
            hi=hi,
        )
        idx = int(np.clip(round(_forward(feat, w)), 0, pool_len - 1))
        out.append(idx)
        prev2 = prev
        prev = float(idx)
    return out


def teacher_next_index(
    idx: int,
    *,
    i: int,
    pool_len: int,
    phrase_end: bool,
    later_section: bool,
    rng: np.random.Generator,
) -> int:
    """Cadence-aware teacher the MLP imitates."""
    if phrase_end:
        tonic = 0 if later_section else pool_len // 2
        step = int(np.sign(tonic - idx) or -1)
        if abs(tonic - idx) > 1 and rng.random() < 0.7:
            return int(np.clip(idx + step * rng.integers(1, 3), 0, pool_len - 1))
        return int(np.clip(tonic + rng.integers(-1, 2), 0, pool_len - 1))
    roll = rng.random()
    if later_section and roll < 0.2:
        delta = rng.integers(1, 4)
    elif roll < 0.55:
        delta = 1 if (i % 3) != 2 else -1
    elif roll < 0.75:
        delta = 0
    elif roll < 0.9:
        delta = 2 if rng.random() < 0.5 else -2
    else:
        delta = 3 if rng.random() < 0.5 else -3
    return int(np.clip(idx + delta, 0, pool_len - 1))


def train_and_save(path: Path | None = None, n_songs: int = 480) -> Path:
    """Fit a 12→64→32→1 MLP on teacher melodies and write npz weights."""
    from sklearn.neural_network import MLPRegressor

    from calliope.audio.vocal_synth import lyric_phrases, lyric_tokens

    rng = np.random.default_rng(7)
    words = (
        "love night fire rain heart light dark moon sun sky neon floating high "
        "singing river ocean baby city lonely golden silver running closer hold "
        "dream broken open silent wild forever maybe never always together "
        "hello world dancing firefly electric velvet shadow morning"
    ).split()
    xs: list[np.ndarray] = []
    ys: list[float] = []
    voices = list(VOICE_RANGES)
    arrangements = list(_ARRANGEMENTS)
    for _ in range(n_songs):
        n_words = int(rng.integers(4, 14))
        lyrics = " ".join(rng.choice(words) for _ in range(n_words))
        if rng.random() < 0.45:
            cut = max(2, n_words // 2)
            lyrics = " ".join(lyrics.split()[:cut]) + ", " + " ".join(lyrics.split()[cut:])
        genre = str(rng.choice(_GENRES))
        arrange = str(rng.choice(arrangements))
        voice = str(rng.choice(voices))
        palette = GENRE_PALETTE[genre]
        lo, hi = VOICE_RANGES[voice]
        root = _NOTE_TO_MIDI.get(str(palette["root"]), 60)
        intervals = _SCALES.get(str(palette["scale"]), _SCALES["major"])
        pool = _scale_pitches(root, intervals, lo, hi)
        phrases = lyric_phrases(lyrics) or [lyric_tokens(lyrics)]
        flat: list[tuple[str, int, bool]] = []
        for pi, toks in enumerate(phrases):
            for ti, tok in enumerate(toks):
                flat.append((tok, pi, ti == len(toks) - 1))
        if not flat:
            continue
        n_phrases = max(1, len(phrases))
        idx = len(pool) // 2
        prev = float(idx)
        prev2 = prev
        n = len(flat)
        for i, (tok, phrase_idx, phrase_end) in enumerate(flat):
            later = phrase_idx >= max(1, n_phrases // 2)
            feat = syllable_features(
                tok=tok,
                i=i,
                n=n,
                phrase_idx=phrase_idx,
                n_phrases=n_phrases,
                phrase_end=phrase_end,
                phrase_start=i == 0 or phrase_idx != flat[i - 1][1],
                genre_preset=genre,
                arrangement_style=arrange,
                prev_idx=prev,
                prev2_idx=prev2,
                pool_len=len(pool),
                lo=lo,
                hi=hi,
            )
            nxt = teacher_next_index(
                idx, i=i, pool_len=len(pool), phrase_end=phrase_end, later_section=later, rng=rng
            )
            xs.append(feat)
            ys.append(float(nxt))
            prev2 = prev
            prev = float(nxt)
            idx = nxt
    x = np.stack(xs).astype(np.float32)
    y = np.asarray(ys, dtype=np.float32)
    mlp = MLPRegressor(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        max_iter=250,
        random_state=7,
        early_stopping=True,
        n_iter_no_change=20,
    )
    mlp.fit(x, y)
    dest = path or WEIGHTS_PATH
    dest.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        dest,
        w1=mlp.coefs_[0].astype(np.float32),
        b1=mlp.intercepts_[0].astype(np.float32),
        w2=mlp.coefs_[1].astype(np.float32),
        b2=mlp.intercepts_[1].astype(np.float32),
        w3=mlp.coefs_[2].astype(np.float32),
        b3=mlp.intercepts_[2].astype(np.float32),
    )
    _load_weights.cache_clear()
    return dest


def ml_melody_midis(
    flat: list[tuple[str, int, bool]],
    *,
    genre_preset: str,
    arrangement_style: str,
    voice_name: str,
) -> list[int] | None:
    palette = GENRE_PALETTE.get(genre_preset.lower(), GENRE_PALETTE["pop"])
    lo, hi = VOICE_RANGES.get(voice_name, VOICE_RANGES["soprano"])
    root = _NOTE_TO_MIDI.get(str(palette["root"]), 60)
    intervals = _SCALES.get(str(palette["scale"]), _SCALES["major"])
    pool = _scale_pitches(root, intervals, lo, hi)
    idxs = predict_scale_indices(
        flat,
        pool_len=len(pool),
        n_phrases=max(1, (flat[-1][1] + 1) if flat else 1),
        genre_preset=genre_preset.lower(),
        arrangement_style=arrangement_style,
        lo=lo,
        hi=hi,
    )
    if idxs is None:
        return None
    return [_clamp_midi(pool[int(np.clip(i, 0, len(pool) - 1))], lo, hi) for i in idxs]


if __name__ == "__main__":
    out = train_and_save()
    print(f"wrote {out}")
