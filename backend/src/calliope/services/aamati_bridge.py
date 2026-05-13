from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

from calliope.config import get_settings


def _load_mood_mappings_module(root: Path) -> ModuleType | None:
    path = root / "src" / "utils" / "mood_mappings.py"
    if not path.is_file():
        return None
    spec = importlib.util.spec_from_file_location("aamati_mood_mappings", path)
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class AamatiBridge:
    """Lightweight bridge to Aamati ML utilities without vendoring the full tree into this repo."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._root = Path(self._settings.aamati_root)

    def health(self) -> dict:
        mod = _load_mood_mappings_module(self._root)
        labels_ok = bool(mod and getattr(mod, "MOOD_LABELS", None))
        return {
            "aamati_path": str(self._root),
            "mood_labels_loaded": labels_ok,
            "detail": None if labels_ok else "mood_mappings not readable at expected path",
        }
