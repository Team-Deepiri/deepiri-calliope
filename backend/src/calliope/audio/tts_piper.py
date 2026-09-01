"""Local Piper neural TTS via ONNX Runtime + espeak-ng (no macOS say)."""

from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path
from threading import Lock

import numpy as np

from calliope.config import get_settings

VOICE_FILES: dict[str, str] = {
    "soprano": "en_US-lessac-medium",
    "alt": "en_US-lessac-medium",
    "alto": "en_US-lessac-medium",
    "tenor": "en_US-ryan-medium",
    "bass": "en_US-ryan-medium",
}

_SESSION_LOCK = Lock()
_SESSIONS: dict[str, object] = {}


def piper_root() -> Path:
    return get_settings().data_path / "models" / "piper"


def piper_available() -> bool:
    from shutil import which

    if which("espeak-ng") is None:
        return False
    voices = piper_root() / "voices"
    return (voices / "en_US-lessac-medium.onnx").is_file() or (voices / "en_US-ryan-medium.onnx").is_file()


def _espeak_ipa(text: str, voice: str = "en-us") -> str:
    proc = subprocess.run(
        ["espeak-ng", "-q", "-v", voice, "--ipa", text],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or "espeak-ng failed")
    return (proc.stdout or "").replace("\n", " ").strip()


def _phoneme_ids(ipa: str, id_map: dict[str, list[int]]) -> list[int]:
    ids: list[int] = []
    ids.extend(id_map.get("^", [1]))
    ids.extend(id_map.get("_", [0]))
    for ch in ipa:
        mapped = id_map.get(ch)
        if not mapped:
            continue
        ids.extend(mapped)
        ids.extend(id_map.get("_", [0]))
    ids.extend(id_map.get("$", [2]))
    return ids


@lru_cache(maxsize=4)
def _load_config(model_path: str) -> dict:
    return json.loads(Path(model_path + ".json").read_text(encoding="utf-8"))


def _session(model_path: str):
    with _SESSION_LOCK:
        sess = _SESSIONS.get(model_path)
        if sess is not None:
            return sess
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 2
        sess = ort.InferenceSession(model_path, sess_options=opts, providers=["CPUExecutionProvider"])
        _SESSIONS[model_path] = sess
        return sess


def synthesize_piper(text: str, voice_name: str = "soprano", *, length_scale: float = 1.32) -> tuple[np.ndarray, int]:
    """Render neural speech. Raises if Piper voices or espeak-ng are missing."""
    stem = VOICE_FILES.get(voice_name, VOICE_FILES["soprano"])
    model_path = piper_root() / "voices" / f"{stem}.onnx"
    if not model_path.is_file():
        # Prefer any installed English voice.
        voices_dir = piper_root() / "voices"
        found = sorted(voices_dir.glob("en_US-*.onnx"))
        if not found:
            raise FileNotFoundError(f"Piper voice missing: {model_path}")
        model_path = found[0]

    cfg = _load_config(str(model_path))
    espeak_voice = str((cfg.get("espeak") or {}).get("voice") or "en-us")
    ipa = _espeak_ipa(text, espeak_voice)
    if not ipa:
        raise RuntimeError("espeak-ng produced no phonemes")
    ids = _phoneme_ids(ipa, cfg["phoneme_id_map"])
    arr = np.expand_dims(np.array(ids, dtype=np.int64), 0)
    inf = cfg.get("inference") or {}
    scales = np.array(
        [
            float(inf.get("noise_scale", 0.667)),
            float(inf.get("length_scale", 1.0)) * float(length_scale),
            float(inf.get("noise_w", 0.8)),
        ],
        dtype=np.float32,
    )
    audio = _session(str(model_path)).run(
        None,
        {
            "input": arr,
            "input_lengths": np.array([arr.shape[1]], dtype=np.int64),
            "scales": scales,
        },
    )[0].squeeze()
    y = np.asarray(audio, dtype=np.float64).ravel()
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    if peak > 1e-9:
        y = y / peak * 0.9
    sr = int((cfg.get("audio") or {}).get("sample_rate") or 22050)
    return y, sr
