"""Trained MLP that writes a vocal melody from lyric syllables.

Pitch intervals and note durations come from a small ReLU network trained on
OpenScore Lieder (CC0 lyrics-on-notes, in each song's key) plus a lighter
cadence teacher. Weights are NumPy so Generate vocal needs no extra ML runtime.
"""

from __future__ import annotations

import os
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
N_OUTPUTS = 2
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


def _forward(x: np.ndarray, w: dict[str, np.ndarray]) -> np.ndarray:
    """Return [interval, duration_log]. Old 1-output weights pad duration_log=0."""
    h = _relu(x @ w["w1"] + w["b1"])
    h = _relu(h @ w["w2"] + w["b2"])
    y = np.asarray(h @ w["w3"] + w["b3"]).reshape(-1)
    if y.size < 2:
        return np.array([float(y[0]), 0.0], dtype=np.float32)
    return y[:2].astype(np.float32)


def predict_melody(
    flat: list[tuple[str, int, bool]],
    *,
    pool_len: int,
    n_phrases: int,
    genre_preset: str,
    arrangement_style: str,
    lo: int,
    hi: int,
    weights: dict[str, np.ndarray] | None = None,
) -> tuple[list[int], list[float]] | None:
    """Autoregressive (scale index, duration beats), or None if weights are missing."""
    from calliope.audio.lieder_melody import log_to_beats

    w = weights if weights is not None else _load_weights()
    if w is None or pool_len <= 0:
        return None
    n = len(flat)
    idx = pool_len // 2
    prev = float(idx)
    prev2 = prev
    idxs: list[int] = []
    beats: list[float] = []
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
        delta, log_dur = _forward(feat, w)
        idx = int(np.clip(idx + int(round(float(delta))), 0, pool_len - 1))
        idxs.append(idx)
        beats.append(log_to_beats(float(log_dur)))
        prev2 = prev
        prev = float(idx)
    return idxs, beats


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
    pred = predict_melody(
        flat,
        pool_len=pool_len,
        n_phrases=n_phrases,
        genre_preset=genre_preset,
        arrangement_style=arrangement_style,
        lo=lo,
        hi=hi,
    )
    return None if pred is None else pred[0]


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


def default_lieder_root() -> Path:
    env = os.environ.get("OPENSCORE_LIEDER_ROOT", "").strip()
    if env:
        return Path(env)
    try:
        from calliope.config import get_settings

        return get_settings().data_path / "openscore-lieder"
    except Exception:
        return Path("data") / "openscore-lieder"


def _teacher_rows(n_songs: int, rng: np.random.Generator) -> tuple[list[np.ndarray], list[np.ndarray]]:
    from calliope.audio.lieder_melody import INTERVAL_CLIP, duration_log
    from calliope.audio.vocal_synth import lyric_phrases, lyric_tokens

    words = (
        "love night fire rain heart light dark moon sun sky neon floating high "
        "singing river ocean baby city lonely golden silver running closer hold "
        "dream broken open silent wild forever maybe never always together "
        "hello world dancing firefly electric velvet shadow morning"
    ).split()
    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
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
            delta = float(np.clip(nxt - idx, -INTERVAL_CLIP, INTERVAL_CLIP))
            beats = 1.0 if phrase_end else 0.5
            xs.append(feat)
            ys.append(np.array([delta, duration_log(beats)], dtype=np.float32))
            prev2 = prev
            prev = float(nxt)
            idx = nxt
    return xs, ys


def train_and_save(
    path: Path | None = None,
    n_songs: int = 480,
    *,
    lieder_root: Path | None = None,
    mix_teacher: bool = True,
) -> Path:
    """Fit a 12→64→32→2 MLP (interval + duration) and write npz weights.

    Uses OpenScore Lieder when the corpus is on disk (real lyrics-on-notes,
    each song's key). Mixes in synthetic teacher songs so genre/arrangement
    features stay useful. Holds out songs for interval/duration MAE.
    """
    from sklearn.neural_network import MLPRegressor

    from calliope.audio.lieder_melody import iter_parsed_songs, lieder_feature_rows

    rng = np.random.default_rng(7)
    root = lieder_root if lieder_root is not None else default_lieder_root()
    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    hold_songs = []
    n_lieder = 0
    if root.is_dir():
        songs = iter_parsed_songs(root)
        n_lieder = len(songs)
        n_hold = min(50, len(songs) // 20) if len(songs) >= 40 else 0
        order = rng.permutation(len(songs))
        hold_idx = set(int(i) for i in order[:n_hold])
        for i, song in enumerate(songs):
            fx, fy = lieder_feature_rows(song.notes, root=song.root, scale=song.scale)
            if not fx:
                continue
            if i in hold_idx:
                hold_songs.append(song)
                continue
            xs.extend(fx)
            ys.extend(fy)
        print(f"OpenScore Lieder: {n_lieder} songs, {len(ys)} train rows, {len(hold_songs)} holdout")
    teacher_n = n_songs if n_lieder == 0 else (120 if mix_teacher else 0)
    if teacher_n:
        tx, ty = _teacher_rows(teacher_n, rng)
        xs.extend(tx)
        ys.extend(ty)
    if not xs:
        raise RuntimeError("no vocal melody training rows")
    x = np.stack(xs).astype(np.float32)
    y = np.stack(ys).astype(np.float32)
    if y.ndim == 1:
        y = np.stack([y, np.zeros_like(y)], axis=1)
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
    w = {
        "w1": mlp.coefs_[0].astype(np.float32),
        "b1": mlp.intercepts_[0].astype(np.float32),
        "w2": mlp.coefs_[1].astype(np.float32),
        "b2": mlp.intercepts_[1].astype(np.float32),
        "w3": mlp.coefs_[2].astype(np.float32),
        "b3": mlp.intercepts_[2].astype(np.float32),
    }
    metrics = evaluate_songs(hold_songs, w) if hold_songs else {}
    if metrics:
        print(
            "holdout "
            f"interval_mae={metrics['interval_mae']:.3f} "
            f"duration_mae={metrics['duration_mae']:.3f} "
            f"scale_acc={metrics['scale_acc']:.3f} "
            f"n={metrics['n_notes']}"
        )
    dest = path or WEIGHTS_PATH
    dest.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        dest,
        **w,
        n_lieder_songs=np.int32(n_lieder),
        n_examples=np.int32(len(ys)),
        n_holdout_songs=np.int32(len(hold_songs)),
        holdout_interval_mae=np.float32(metrics.get("interval_mae", -1.0)),
        holdout_duration_mae=np.float32(metrics.get("duration_mae", -1.0)),
        holdout_scale_acc=np.float32(metrics.get("scale_acc", -1.0)),
    )
    _load_weights.cache_clear()
    return dest


def evaluate_songs(songs: list, w: dict[str, np.ndarray]) -> dict[str, float]:
    """Autoregressive interval/duration error on held-out parsed songs."""
    from calliope.audio.lieder_melody import INTERVAL_CLIP, nearest_pool_index, voice_for_midis

    int_err: list[float] = []
    dur_err: list[float] = []
    hits = 0
    n = 0
    for song in songs:
        notes = song.notes[:80]
        if len(notes) < 6:
            continue
        voice = voice_for_midis([note.midi for note in notes])
        lo, hi = VOICE_RANGES.get(voice, VOICE_RANGES["soprano"])
        root = _NOTE_TO_MIDI.get(song.root, 67)
        intervals = _SCALES.get(song.scale, _SCALES["major"])
        pool = _scale_pitches(root, intervals, lo, hi)
        flat: list[tuple[str, int, bool]] = []
        phrase_idx = 0
        for note in notes:
            flat.append((note.tok, phrase_idx, note.phrase_end))
            if note.phrase_end:
                phrase_idx += 1
        n_phrases = max(1, 1 + sum(1 for note in notes[:-1] if note.phrase_end))
        pred = predict_melody(
            flat,
            pool_len=len(pool),
            n_phrases=n_phrases,
            genre_preset="acoustic",
            arrangement_style="through-composed",
            lo=lo,
            hi=hi,
            weights=w,
        )
        if pred is None:
            continue
        pred_idx, pred_beats = pred
        true_idx = [nearest_pool_index(note.midi, pool) for note in notes]
        mid = len(pool) // 2
        prev_t, prev_p = mid, mid
        for i, note in enumerate(notes):
            t_delta = float(np.clip(true_idx[i] - prev_t, -INTERVAL_CLIP, INTERVAL_CLIP))
            p_delta = float(pred_idx[i] - prev_p)
            int_err.append(abs(p_delta - t_delta))
            dur_err.append(abs(pred_beats[i] - float(np.clip(note.beats, 0.25, 4.0))))
            hits += int(pred_idx[i] == true_idx[i])
            n += 1
            prev_t, prev_p = true_idx[i], pred_idx[i]
    if not n:
        return {"interval_mae": -1.0, "duration_mae": -1.0, "scale_acc": -1.0, "n_notes": 0}
    return {
        "interval_mae": float(np.mean(int_err)),
        "duration_mae": float(np.mean(dur_err)),
        "scale_acc": hits / n,
        "n_notes": float(n),
    }


def ml_melody(
    flat: list[tuple[str, int, bool]],
    *,
    genre_preset: str,
    arrangement_style: str,
    voice_name: str,
) -> list[tuple[int, float]] | None:
    """Per-syllable (midi, duration_beats), or None if weights are missing."""
    palette = GENRE_PALETTE.get(genre_preset.lower(), GENRE_PALETTE["pop"])
    lo, hi = VOICE_RANGES.get(voice_name, VOICE_RANGES["soprano"])
    root = _NOTE_TO_MIDI.get(str(palette["root"]), 60)
    intervals = _SCALES.get(str(palette["scale"]), _SCALES["major"])
    pool = _scale_pitches(root, intervals, lo, hi)
    pred = predict_melody(
        flat,
        pool_len=len(pool),
        n_phrases=max(1, (flat[-1][1] + 1) if flat else 1),
        genre_preset=genre_preset.lower(),
        arrangement_style=arrangement_style,
        lo=lo,
        hi=hi,
    )
    if pred is None:
        return None
    idxs, beats = pred
    return [
        (_clamp_midi(pool[int(np.clip(i, 0, len(pool) - 1))], lo, hi), float(b))
        for i, b in zip(idxs, beats, strict=True)
    ]


def ml_melody_midis(
    flat: list[tuple[str, int, bool]],
    *,
    genre_preset: str,
    arrangement_style: str,
    voice_name: str,
) -> list[int] | None:
    notes = ml_melody(
        flat,
        genre_preset=genre_preset,
        arrangement_style=arrangement_style,
        voice_name=voice_name,
    )
    return None if notes is None else [m for m, _b in notes]


if __name__ == "__main__":
    root = default_lieder_root()
    print(f"lieder root: {root} exists={root.is_dir()}")
    out = train_and_save()
    print(f"wrote {out}")
