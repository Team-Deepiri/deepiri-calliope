"""Local DiffSinger MIDI SVS (ONNX): lyrics + notes → sung audio.

Uses the OpenCpop-format mobile export (80-bin mel, 24 kHz HiFiGAN). English is
mapped onto that phone set via espeak-ng IPA, so vowels/melody are sung even
when the accent is imperfect. Piper remains the fallback when weights are missing.
"""

from __future__ import annotations

import urllib.error
import urllib.request
from pathlib import Path
from threading import Lock

import numpy as np
from scipy.signal import resample

from calliope.audio.vocal_synth import MelodyNote, lyric_tokens
from calliope.config import get_settings

SAMPLE_RATE = 24_000
_HF_BASE = "https://huggingface.co/LogiAI10/diffsinger-mobile-onnx/resolve/main"
_ACOUSTIC = "diffsinger_acoustic.onnx"
_VOCODER = "hifigan_vocoder.onnx"

# OpenCpop MIDI vocab: PAD=0, EOS=1, UNK=2, then sorted dataset phones.
_OPENCPOP = [
    "AP",
    "SP",
    "a",
    "ai",
    "an",
    "ang",
    "ao",
    "b",
    "c",
    "ch",
    "d",
    "e",
    "ei",
    "en",
    "eng",
    "er",
    "f",
    "g",
    "h",
    "i",
    "ia",
    "ian",
    "iang",
    "iao",
    "ie",
    "in",
    "ing",
    "iong",
    "iu",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "ong",
    "ou",
    "p",
    "q",
    "r",
    "s",
    "sh",
    "t",
    "u",
    "ua",
    "uai",
    "uan",
    "uang",
    "ui",
    "un",
    "uo",
    "v",
    "van",
    "ve",
    "vn",
    "w",
    "x",
    "y",
    "z",
    "zh",
]
assert len(_OPENCPOP) == 60
_PAD, _EOS, _UNK = 0, 1, 2
_PHONE_TO_ID = {p: i + 3 for i, p in enumerate(_OPENCPOP)}
_VOWELS = {
    "a",
    "ai",
    "an",
    "ang",
    "ao",
    "e",
    "ei",
    "en",
    "eng",
    "er",
    "i",
    "ia",
    "ian",
    "iang",
    "iao",
    "ie",
    "in",
    "ing",
    "iong",
    "iu",
    "o",
    "ong",
    "ou",
    "u",
    "ua",
    "uai",
    "uan",
    "uang",
    "ui",
    "un",
    "uo",
    "v",
    "van",
    "ve",
    "vn",
}

# Longest-first IPA → OpenCpop. English onto a Mandarin singer, not a perfect G2P.
_IPA_TABLE: tuple[tuple[str, str], ...] = (
    ("aɪ", "ai"),
    ("aʊ", "ao"),
    ("eɪ", "ei"),
    ("oʊ", "ou"),
    ("əʊ", "ou"),
    ("ɔɪ", "ui"),
    ("iː", "i"),
    ("uː", "u"),
    ("ɑː", "a"),
    ("ɔː", "ao"),
    ("ɜː", "er"),
    ("tʃ", "ch"),
    ("dʒ", "zh"),
    ("ʃ", "sh"),
    ("ʒ", "sh"),
    ("θ", "s"),
    ("ð", "d"),
    ("ŋ", "eng"),
    ("ɹ", "r"),
    ("æ", "a"),
    ("ɑ", "a"),
    ("ʌ", "a"),
    ("ɔ", "ao"),
    ("ɒ", "ao"),
    ("ə", "e"),
    ("ɚ", "er"),
    ("ɜ", "er"),
    ("ɪ", "i"),
    ("ʊ", "u"),
    ("ɛ", "ei"),
    ("e", "ei"),
    ("i", "i"),
    ("u", "u"),
    ("o", "ou"),
    ("a", "a"),
    ("j", "y"),
    ("w", "w"),
    ("h", "h"),
    ("l", "l"),
    ("r", "r"),
    ("m", "m"),
    ("n", "n"),
    ("p", "p"),
    ("b", "b"),
    ("t", "t"),
    ("d", "d"),
    ("k", "k"),
    ("g", "g"),
    ("f", "f"),
    ("v", "f"),
    ("s", "s"),
    ("z", "z"),
    ("x", "x"),
)

_SESSION_LOCK = Lock()
_SESSIONS: dict[str, object] = {}


def diffsinger_root() -> Path:
    return get_settings().data_path / "models" / "diffsinger"


def diffsinger_available() -> bool:
    root = diffsinger_root()
    return (root / _ACOUSTIC).is_file() and (root / _VOCODER).is_file()


def ensure_diffsinger_models(timeout_sec: float = 180.0) -> bool:
    """Download ONNX weights into data/ if they are not already present."""
    if diffsinger_available():
        return True
    root = diffsinger_root()
    root.mkdir(parents=True, exist_ok=True)
    try:
        for name in (_ACOUSTIC, _VOCODER):
            dest = root / name
            if dest.is_file():
                continue
            tmp = dest.with_suffix(dest.suffix + ".part")
            urllib.request.urlretrieve(f"{_HF_BASE}/{name}", tmp)
            tmp.replace(dest)
    except (OSError, urllib.error.URLError, ValueError):
        return False
    return diffsinger_available()


def ipa_to_opencpop(ipa: str) -> list[str]:
    text = (ipa or "").replace("ˈ", "").replace("ˌ", "").replace("ː", "")
    text = "".join(ch for ch in text if ch.isalpha() or ch in "ʃʒθðŋɹæɑʌɔɒəɚɜɪʊɛ ")
    out: list[str] = []
    i = 0
    while i < len(text):
        if text[i] in " \n\t":
            i += 1
            continue
        matched = None
        for src, dst in _IPA_TABLE:
            if text.startswith(src, i):
                matched = (len(src), dst)
                break
        if matched is None:
            i += 1
            continue
        out.append(matched[1])
        i += matched[0]
    return out


def encode_phones(phones: list[str]) -> list[int]:
    return [_PHONE_TO_ID.get(p, _UNK) for p in phones]


def _fit_midi(midi: int) -> int:
    """Keep pitch class inside the OpenCpop singer's range."""
    m = int(midi)
    while m < 55:
        m += 12
    while m > 81:
        m -= 12
    return int(np.clip(m, 48, 84))


def _phones_for_token(token: str) -> list[str]:
    from calliope.audio.tts_piper import _espeak_ipa

    try:
        ipa = _espeak_ipa(token, "en-us")
    except (OSError, RuntimeError):
        ipa = token
    phones = ipa_to_opencpop(ipa)
    return phones or ["a"]


def melody_to_ds_inputs(
    lyrics: str,
    melody: list[MelodyNote],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    tokens = lyric_tokens(lyrics)
    notes = list(melody)
    n = min(len(tokens), len(notes), 48)
    phones: list[str] = ["SP"]
    midis: list[int] = [60]
    durs: list[float] = [0.12]
    slurs: list[int] = [0]
    for i in range(n):
        midi, _start, dur = notes[i]
        midi = _fit_midi(midi)
        unit = _phones_for_token(tokens[i])
        note_dur = max(0.16, float(dur))
        n_ph = len(unit)
        if n_ph == 1:
            phone_durs = [note_dur]
        else:
            head = [0.055] * (n_ph - 1)
            phone_durs = head + [max(0.12, note_dur - sum(head))]
        for j, ph in enumerate(unit):
            phones.append(ph)
            midis.append(midi)
            durs.append(phone_durs[j])
            slurs.append(1 if j > 0 and ph in _VOWELS else 0)
    phones.append("SP")
    midis.append(midis[-1] if midis else 60)
    durs.append(0.16)
    slurs.append(0)
    return (
        np.array([encode_phones(phones)], dtype=np.int64),
        np.array([midis], dtype=np.int64),
        np.array([durs], dtype=np.float32),
        np.array([slurs], dtype=np.int64),
    )


def _session(path: Path):
    key = str(path)
    with _SESSION_LOCK:
        sess = _SESSIONS.get(key)
        if sess is not None:
            return sess
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 2
        sess = ort.InferenceSession(key, sess_options=opts, providers=["CPUExecutionProvider"])
        _SESSIONS[key] = sess
        return sess


def _resample(y: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64).ravel()
    if src_sr == dst_sr or y.size == 0:
        return y
    dst_n = max(1, int(round(y.size * dst_sr / max(src_sr, 1))))
    out = resample(y, dst_n)
    return np.asarray(out, dtype=np.float64).ravel()


def _f0_from_notes(midis: np.ndarray, durs: np.ndarray, n_frames: int) -> np.ndarray:
    durs = np.maximum(np.asarray(durs, dtype=np.float64).ravel(), 1e-3)
    midis = np.asarray(midis, dtype=np.float64).ravel()
    ends = np.cumsum(durs)
    total = float(ends[-1])
    t = (np.arange(n_frames, dtype=np.float64) + 0.5) * (total / max(n_frames, 1))
    idx = np.searchsorted(ends, t, side="right")
    idx = np.clip(idx, 0, midis.size - 1)
    hz = 440.0 * (2.0 ** ((midis[idx] - 69.0) / 12.0))
    vib = 2.0 ** (0.28 * np.sin(2.0 * np.pi * 5.4 * t) / 12.0)
    return (hz * vib).astype(np.float32)[None]


def synthesize_diffsinger(
    lyrics: str,
    melody: list[MelodyNote],
    *,
    sr: int = 48_000,
    voice_name: str = "soprano",
) -> np.ndarray | None:
    if not (lyrics or "").strip() or not melody:
        return None
    if not diffsinger_available() and not ensure_diffsinger_models():
        return None
    root = diffsinger_root()
    tokens, pitch_midi, midi_dur, is_slur = melody_to_ds_inputs(lyrics, melody)
    if voice_name in {"tenor", "bass"}:
        pitch_midi = np.clip(pitch_midi - 5, 48, 76)
    try:
        acoustic = _session(root / _ACOUSTIC)
        vocoder = _session(root / _VOCODER)
        _decoder, mel = acoustic.run(
            None,
            {
                "txt_tokens": tokens,
                "pitch_midi": pitch_midi,
                "midi_dur": midi_dur,
                "is_slur": is_slur,
            },
        )
        mel = np.asarray(mel, dtype=np.float32)
        f0 = _f0_from_notes(pitch_midi[0], midi_dur[0], mel.shape[1])
        wav = vocoder.run(None, {"mel_out": mel, "f0": f0})[0]
    except (ValueError, RuntimeError, OSError):
        return None
    y = np.asarray(wav, dtype=np.float64).ravel()
    if y.size < SAMPLE_RATE // 5:
        return None
    peak = float(np.max(np.abs(y)))
    if peak < 1e-4:
        return None
    y = y / peak * 0.88
    y = _resample(y, SAMPLE_RATE, sr)
    peak = float(np.max(np.abs(y)))
    if peak > 1e-9:
        y = y / peak * 0.88
    return y.astype(np.float64)
