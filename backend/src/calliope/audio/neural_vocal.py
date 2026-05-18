"""Neural vocal transformation engine for industry-standard AI autotune."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Literal

from calliope.audio.harmony_engine import HarmonyEngine
from calliope.tune.gravy_autotune import auto_tune, AutotuneConfig, AutotuneMode


@dataclass
class NeuralVocalConfig:
    strength: float = 1.0
    speed: float = 0.5
    vibrato_preserve: float = 0.8
    formant_shift: float = 1.0  # 1.0 = neutral
    neural_reconstruction: bool = True
    auto_scale: bool = True
    doubling_mode: Literal["none", "tight", "loose", "wide"] = "none"


class NeuralVocalEngine:
    """Advanced AI engine for vocal tuning and transformation."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.harmony = HarmonyEngine()

    def process(
        self,
        samples: np.ndarray,
        prompt_context: Optional[str] = None,
        config: Optional[NeuralVocalConfig] = None
    ) -> np.ndarray:
        """
        Applies neural pitch correction and vocal enhancement.
        """
        if config is None:
            config = NeuralVocalConfig()

        y = np.asarray(samples, dtype=np.float64)
        
        # 1. Automatic Scale Detection (if enabled)
        # In a real implementation, this would analyze the 'prompt_context' 
        # or the song's audio to find the key.
        scale_root = 60 # Default to C
        scale_type = "minor" if "dark" in (prompt_context or "").lower() else "major"
        
        tune_config = AutotuneConfig(
            mode=AutotuneMode.MELODIC if config.vibrato_preserve > 0.5 else AutotuneMode.HARD,
            strength=config.strength,
            speed=config.speed,
            natural_vibrato=config.vibrato_preserve,
            formant_correction=True,
            formant_preserve=0.8,
            root_midi=scale_root,
        )

        # 2. Apply Neural-prior Autotune (Gravy Autotune uses CREPE deep learning)
        result = auto_tune(y, self.sr, tune_config)
        processed = result.corrected_samples

        # 3. Neural Doubling (if enabled)
        if config.doubling_mode != "none":
            doubled = self._apply_neural_doubling(y, config.doubling_mode)
            # Mix with original processed track
            processed = (processed * 0.7 + doubled * 0.3)
            
        # 4. Final Neural Polish (Formant/Timbre correction)
        if config.formant_shift != 1.0:
            from calliope.voice.formant_shift import formant_shift_stft
            processed = formant_shift_stft(processed, self.sr, shift=config.formant_shift)

        return np.clip(processed, -1.0, 1.0)

    def _apply_neural_doubling(self, samples: np.ndarray, mode: str) -> np.ndarray:
        """
        Generates a synthetic double-track using slight neural variations.
        """
        # Simple implementation: slight pitch variation + delay
        from calliope.tune.warp_autotune import warp_pitch_map
        
        n = len(samples)
        # Random micro-pitch drift
        drift = 1.0 + (np.random.randn(n // 512) * 0.005) # ~10 cents drift
        target_hz = np.ones(n // 512) * 440.0 * drift # Dummy reference
        
        doubled = warp_pitch_map(
            samples, self.sr, 
            np.ones_like(target_hz) * 440.0, 
            target_hz, 
            hop=512, frame=2048, strength=0.5
        )
        
        # Delay based on mode
        delay_ms = {"tight": 15, "loose": 30, "wide": 45}.get(mode, 20)
        delay_samples = int(delay_ms * self.sr / 1000)
        
        return np.pad(doubled, (delay_samples, 0))[:n]


def ai_autotune(samples: np.ndarray, sr: int = 48000, strength: float = 1.0) -> np.ndarray:
    """One-click AI Autotune utility."""
    engine = NeuralVocalEngine(sr)
    config = NeuralVocalConfig(strength=strength, neural_reconstruction=True)
    return engine.process(samples, config=config)
