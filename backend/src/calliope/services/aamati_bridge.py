from __future__ import annotations

from pathlib import Path

from calliope.config import get_settings
from calliope.services.aamati_prior import AamatiPrior, health_payload


class AamatiBridge:
    """Compatibility wrapper around the beefed-up Aamati prior + ONNX path."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._root = Path(self._settings.aamati_root)

    def health(self) -> dict:
        return health_payload(self._root)

    def align(self, text: str):
        return AamatiPrior(self._root).align(text)

    def ontology(self) -> dict:
        return AamatiPrior(self._root).groove_ontology()
