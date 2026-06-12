"""RL-based composer using Q-learning for stepwise note selection.

State: current pitch, interval context, chord, bar position.
Actions: pitch bend, hold, or step to new scale degree.
Reward: harmonic fit, voice leading, rhythmic interest.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RLComposerConfig:
    n_notes: int = 128
    n_beats: int = 16
    scale_degrees: int = 7
    n_actions: int = 5
    learning_rate: float = 0.1
    discount_factor: float = 0.9
    exploration_rate: float = 0.3
    exploration_decay: float = 0.995
    min_exploration: float = 0.01


class StateEncoder:
    """Encodes musical state as feature vector for Q-learning."""

    def __init__(self, config: RLComposerConfig):
        self.config = config

    def encode(
        self, current_pitch: int, prev_pitch: int, chord_root: int,
        chord_type: int, bar_position: float, is_downbeat: bool,
    ) -> np.ndarray:
        state = np.zeros(16, dtype=np.float32)
        state[0] = current_pitch / self.config.n_notes
        state[1] = prev_pitch / self.config.n_notes
        state[2] = (current_pitch - prev_pitch) / 24.0
        state[3] = chord_root / 12.0
        state[4] = chord_type / 6.0
        state[5] = bar_position
        state[6] = float(is_downbeat)

        in_scale = self._in_scale(current_pitch, chord_root)
        state[7] = float(in_scale)
        state[8] = abs((current_pitch - chord_root) % 12) / 12.0
        state[9] = float(self._is_consonant(current_pitch, chord_root))

        return state

    @staticmethod
    def _in_scale(pitch: int, root: int) -> bool:
        degree = (pitch - root) % 12
        major_scale = {0, 2, 4, 5, 7, 9, 11}
        return degree in major_scale

    @staticmethod
    def _is_consonant(pitch: int, root: int) -> bool:
        interval = (pitch - root) % 12
        return interval in {0, 4, 5, 7, 9}


class QNetwork:
    """Simple linear Q-function approximator."""

    def __init__(self, state_dim: int, n_actions: int):
        rng = np.random.default_rng(42)
        s = 0.02
        self.w = rng.normal(0, s, (n_actions, state_dim)).astype(np.float32)
        self.b = np.zeros(n_actions, dtype=np.float32)

    def predict(self, state: np.ndarray) -> np.ndarray:
        return state @ self.w.T + self.b

    def update(self, state: np.ndarray, action: int, target: float, lr: float) -> float:
        q_current = self.predict(state)[action]
        grad = state * (target - q_current)
        self.w[action] += lr * grad
        self.b[action] += lr * (target - q_current)
        return float(abs(target - q_current))


class RewardFunction:
    """Computes reward for a musical action."""

    def __init__(self):
        self.consonance_intervals = {0: 1.0, 3: 0.3, 4: 0.8, 5: 0.9, 7: 1.0, 8: 0.4, 9: 0.7, 12: 1.0}

    def compute(
        self, pitch: int, prev_pitch: int, chord_root: int, chord_type: int,
        bar_position: float, is_downbeat: bool,
    ) -> float:
        reward = 0.0

        interval = abs(pitch - prev_pitch)
        if interval <= 2:
            reward += 1.0
        elif interval <= 5:
            reward += 0.5
        elif interval <= 7:
            reward += 0.2
        elif interval <= 12:
            reward -= 2.0
        else:
            reward -= 5.0

        degree = (pitch - chord_root) % 12
        reward += self.consonance_intervals.get(degree, -1.0) * 2.0

        if is_downbeat and self._is_chord_tone(degree, chord_type):
            reward += 3.0

        if not is_downbeat and bar_position > 0.5:
            reward += 0.5

        if self._is_chord_tone(degree, chord_type):
            reward += 1.0

        return reward

    @staticmethod
    def _is_chord_tone(degree: int, chord_type: int) -> bool:
        if chord_type == 0:
            return degree in {0, 4, 7}
        elif chord_type == 1:
            return degree in {0, 3, 7}
        elif chord_type == 2:
            return degree in {0, 4, 7, 10}
        return degree in {0, 4, 7}


class RLComposer:
    """RL agent for stepwise musical composition using Q-learning."""

    def __init__(self, config: RLComposerConfig | None = None):
        self.config = config or RLComposerConfig()
        self.state_encoder = StateEncoder(self.config)
        self.q_network = QNetwork(16, self.config.n_actions)
        self.reward_fn = RewardFunction()
        self.exploration_rate = self.config.exploration_rate
        self.prev_pitch = 60
        self.current_pitch = 60
        self.composition: list[tuple[int, float, float]] = []

    def _map_action(self, action: int, current_pitch: int, scale_root: int) -> int:
        scale = [0, 2, 4, 5, 7, 9, 11]
        if action == 0:
            return current_pitch
        elif action == 1:
            idx = min(scale, key=lambda x: abs(x - (current_pitch - scale_root) % 12))
            octave_offset = (current_pitch - scale_root) // 12
            return scale_root + octave_offset * 12 + ((idx + 1) % 12)
        elif action == 2:
            idx = min(scale, key=lambda x: abs(x - (current_pitch - scale_root) % 12))
            octave_offset = (current_pitch - scale_root) // 12
            return scale_root + octave_offset * 12 + ((idx - 1) % 12)
        elif action == 3:
            return current_pitch + 12
        elif action == 4:
            return current_pitch - 12
        return current_pitch

    def compose_step(
        self, chord_root: int, chord_type: int, bar_position: float,
        is_downbeat: bool, learn: bool = True,
    ) -> tuple[int, float]:
        """Select next note using epsilon-greedy Q-learning.

        Args:
            chord_root: MIDI pitch of chord root.
            chord_type: 0=major, 1=minor, 2=dominant7.
            bar_position: position within bar (0-1).
            is_downbeat: whether this is a downbeat.
            learn: whether to update Q-values.

        Returns:
            (selected_pitch, reward) tuple.
        """
        state = self.state_encoder.encode(
            self.current_pitch, self.prev_pitch, chord_root,
            chord_type, bar_position, is_downbeat,
        )

        if np.random.random() < self.exploration_rate:
            action = int(np.random.randint(self.config.n_actions))
        else:
            q_values = self.q_network.predict(state)
            action = int(np.argmax(q_values))

        next_pitch = self._map_action(action, self.current_pitch, chord_root)
        next_pitch = np.clip(next_pitch, 24, 107).astype(int)

        reward = self.reward_fn.compute(
            next_pitch, self.current_pitch, chord_root,
            chord_type, bar_position, is_downbeat,
        )

        if learn:
            next_state = self.state_encoder.encode(
                next_pitch, self.current_pitch, chord_root,
                chord_type, (bar_position + 0.25) % 1.0,
                (bar_position + 0.25) % 1.0 < 0.1,
            )
            next_q = np.max(self.q_network.predict(next_state))
            target = reward + self.config.discount_factor * next_q
            self.q_network.update(state, action, target, self.config.learning_rate)

        self.prev_pitch = self.current_pitch
        self.current_pitch = next_pitch

        if learn:
            self.exploration_rate = max(
                self.config.min_exploration,
                self.exploration_rate * self.config.exploration_decay,
            )

        return next_pitch, reward

    def compose(
        self,
        chord_progression: list[tuple[int, int]],
        beats: int = 16,
        learn: bool = True,
    ) -> list[tuple[int, float, float]]:
        """Compose a full melody over a chord progression.

        Args:
            chord_progression: list of (chord_root, chord_type) per beat.
            beats: number of beats to compose.
            learn: whether to enable Q-learning updates.

        Returns:
            list of (pitch, beat_position, duration) notes.
        """
        notes: list[tuple[int, float, float]] = []
        self.current_pitch = 60
        self.prev_pitch = 60

        for beat in range(beats):
            chord_idx = beat % len(chord_progression)
            chord_root, chord_type = chord_progression[chord_idx]
            bar_position = (beat % 4) / 4.0
            is_downbeat = beat % 4 == 0

            pitch, _ = self.compose_step(chord_root, chord_type, bar_position, is_downbeat, learn)
            duration = 0.5 if np.random.random() < 0.3 else 1.0
            notes.append((pitch, float(beat), duration))

        self.composition = notes
        return notes

    def reset(self) -> None:
        self.current_pitch = 60
        self.prev_pitch = 60
        self.composition = []
