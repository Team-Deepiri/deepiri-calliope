"""MuseGAN: multi-track GAN for symbolic music generation.

Supports jamming, composer, and hybrid modes with chord/bar conditioning
per the MuseGAN paper (Dong et al. 2018).
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class MuseGANConfig:
    num_bars: int = 8
    beats_per_bar: int = 4
    resolution: int = 4
    num_tracks: int = 5
    latent_dim: int = 128
    chord_dim: int = 36
    gen_hidden: int = 512
    disc_hidden: int = 256
    tempo_bpm: float = 120.0
    mode: Literal["jamming", "composer", "hybrid"] = "hybrid"

    @property
    def time_steps(self) -> int:
        return self.num_bars * self.beats_per_bar * self.resolution


class TemporalGenerator:
    """Generates bar-by-bar binary pianoroll matrices from latent + chord vectors."""

    def __init__(self, latent_dim: int, chord_dim: int, hidden_dim: int, time_steps: int):
        rng = np.random.default_rng(42)
        s = 0.02
        self.time_steps = time_steps
        self.w_in = rng.normal(0, s, (hidden_dim, latent_dim + chord_dim)).astype(np.float32)
        self.b_in = np.zeros(hidden_dim, dtype=np.float32)
        self.w_h = rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32)
        self.b_h = np.zeros(hidden_dim, dtype=np.float32)
        self.w_out = rng.normal(0, s, (time_steps, hidden_dim)).astype(np.float32)
        self.b_out = np.zeros(time_steps, dtype=np.float32)
        self.w_chord_bar = rng.normal(0, s, (hidden_dim, chord_dim)).astype(np.float32)
        self.b_chord_bar = np.zeros(hidden_dim, dtype=np.float32)

    def forward(self, z: np.ndarray, chord: np.ndarray) -> np.ndarray:
        batch = z.shape[0]
        x = np.concatenate([z, chord], axis=-1)
        h = np.tanh(x @ self.w_in.T + self.b_in)
        h = np.tanh(h @ self.w_h.T + self.b_h)
        logits = h @ self.w_out.T + self.b_out
        probs = 1.0 / (1.0 + np.exp(-logits))
        return probs.reshape(batch, 1, self.time_steps)


class SpatialGenerator:
    """Generates inter-track relationships as a binary matrix."""

    def __init__(self, latent_dim: int, num_tracks: int, hidden_dim: int):
        rng = np.random.default_rng(42)
        s = 0.02
        self.num_tracks = num_tracks
        self.w_in = rng.normal(0, s, (hidden_dim, latent_dim)).astype(np.float32)
        self.b_in = np.zeros(hidden_dim, dtype=np.float32)
        self.w_h = rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32)
        self.b_h = np.zeros(hidden_dim, dtype=np.float32)
        self.w_out = rng.normal(0, s, (num_tracks * num_tracks, hidden_dim)).astype(np.float32)
        self.b_out = np.zeros(num_tracks * num_tracks, dtype=np.float32)

    def forward(self, z: np.ndarray) -> np.ndarray:
        h = np.tanh(z @ self.w_in.T + self.b_in)
        h = np.tanh(h @ self.w_h.T + self.b_h)
        logits = h @ self.w_out.T + self.b_out
        return logits.reshape(-1, self.num_tracks, self.num_tracks)


class BarGenerator:
    """Generates a single bar's pianoroll from temporal + spatial features."""

    def __init__(self, notes_per_bar: int, hidden_dim: int):
        rng = np.random.default_rng(42)
        s = 0.02
        self.notes_per_bar = notes_per_bar
        self.w_temporal = rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32)
        self.w_spatial = rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32)
        self.w_out = rng.normal(0, s, (notes_per_bar, hidden_dim)).astype(np.float32)
        self.b_out = np.zeros(notes_per_bar, dtype=np.float32)

    def forward(self, temporal_feat: np.ndarray, spatial_feat: np.ndarray) -> np.ndarray:
        batch = temporal_feat.shape[0]
        h = temporal_feat @ self.w_temporal.T + spatial_feat @ self.w_spatial.T
        h = np.tanh(h)
        logits = h @ self.w_out.T + self.b_out
        return 1.0 / (1.0 + np.exp(-logits))


class Discriminator:
    """Convolutional discriminator operating on pianoroll slices."""

    def __init__(self, time_steps: int, hidden_dim: int, num_tracks: int):
        rng = np.random.default_rng(42)
        s = 0.02
        self.time_steps = time_steps
        self.w_conv1 = rng.normal(0, s, (hidden_dim, num_tracks * 4)).astype(np.float32)
        self.b_conv1 = np.zeros(hidden_dim, dtype=np.float32)
        self.w_conv2 = rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32)
        self.b_conv2 = np.zeros(hidden_dim, dtype=np.float32)
        self.w_out = rng.normal(0, s, (1, hidden_dim)).astype(np.float32)
        self.b_out = np.zeros(1, dtype=np.float32)

    def forward(self, pianoroll: np.ndarray) -> np.ndarray:
        batch = pianoroll.shape[0]
        x = pianoroll.reshape(batch, -1)
        h = np.maximum(0, x @ self.w_conv1.T + self.b_conv1)
        h = np.maximum(0, h @ self.w_conv2.T + self.b_conv2)
        logit = h @ self.w_out.T + self.b_out
        return logit

    def discriminate(self, pianoroll: np.ndarray) -> np.ndarray:
        logit = self.forward(pianoroll)
        return 1.0 / (1.0 + np.exp(-logit))


class ChordConditioner:
    """Encodes chord progression into per-bar chord vectors."""

    def __init__(self, chord_dim: int, num_bars: int):
        self.chord_dim = chord_dim
        self.num_bars = num_bars

    def encode(self, chord_sequence: list[int]) -> np.ndarray:
        vocab_size = max(chord_sequence) + 1 if chord_sequence else self.chord_dim
        one_hot = np.zeros((len(chord_sequence), vocab_size), dtype=np.float32)
        one_hot[np.arange(len(chord_sequence)), chord_sequence] = 1.0
        if one_hot.shape[1] < self.chord_dim:
            pad = np.zeros((len(chord_sequence), self.chord_dim - vocab_size), dtype=np.float32)
            one_hot = np.concatenate([one_hot, pad], axis=-1)
        elif one_hot.shape[1] > self.chord_dim:
            one_hot = one_hot[:, :self.chord_dim]
        if len(chord_sequence) < self.num_bars:
            pad = np.zeros((self.num_bars - len(chord_sequence), self.chord_dim), dtype=np.float32)
            one_hot = np.concatenate([one_hot, pad], axis=0)
        return one_hot[np.newaxis, :self.num_bars, :]


class MuseGAN:
    """Multi-track GAN for symbolic music with jamming/composer/hybrid modes."""

    def __init__(self, config: MuseGANConfig | None = None):
        self.config = config or MuseGANConfig()
        self.tempo_sec_per_step = 60.0 / self.config.tempo_bpm / self.config.resolution

        self.temporal_gen = TemporalGenerator(
            self.config.latent_dim, self.config.chord_dim,
            self.config.gen_hidden, self.config.time_steps,
        )
        self.spatial_gen = SpatialGenerator(
            self.config.latent_dim, self.config.num_tracks, self.config.gen_hidden,
        )
        self.bar_gen = BarGenerator(84, self.config.gen_hidden)
        self.discriminators = [
            Discriminator(self.config.time_steps, self.config.disc_hidden, self.config.num_tracks)
            for _ in range(self.config.num_tracks)
        ]
        self.chord_conditioner = ChordConditioner(self.config.chord_dim, self.config.num_bars)

    def _latent_sample(self, batch: int = 1) -> np.ndarray:
        return np.random.randn(batch, self.config.latent_dim).astype(np.float32)

    def generate_tracks(
        self,
        chord_sequence: list[int] | None = None,
        batch: int = 1,
    ) -> np.ndarray:
        """Generate multi-track pianoroll. Returns shape (batch, tracks, time_steps, 84)."""
        if chord_sequence is None:
            chord_sequence = [0] * self.config.num_bars

        z = self._latent_sample(batch)
        chords = self.chord_conditioner.encode(chord_sequence)

        if self.config.mode == "jamming":
            return self._generate_jamming(z, chords)
        elif self.config.mode == "composer":
            return self._generate_composer(z, chords)
        else:
            return self._generate_hybrid(z, chords)

    def _generate_jamming(self, z: np.ndarray, chords: np.ndarray) -> np.ndarray:
        batch = z.shape[0]
        tracks = np.zeros((batch, self.config.num_tracks, self.config.time_steps, 84), dtype=np.float32)

        for t in range(self.config.num_tracks):
            z_t = z + 0.1 * np.random.randn(*z.shape).astype(np.float32)
            z_tiled = np.tile(z_t[:, np.newaxis, :], (1, self.config.num_bars, 1))
            chords_tiled = np.tile(chords, (batch, 1, 1))
            temporal_in = np.concatenate([z_tiled, chords_tiled], axis=-1)

            for bar in range(self.config.num_bars):
                temp_feat = temporal_in[:, bar, :]
                spatial_feat = z_t
                bar_pr = self.bar_gen.forward(temp_feat, spatial_feat)
                start = bar * self.config.time_steps // self.config.num_bars
                end = (bar + 1) * self.config.time_steps // self.config.num_bars
                tracks[:, t, start:end, :] = bar_pr[:, np.newaxis, :]

        return tracks

    def _generate_composer(self, z: np.ndarray, chords: np.ndarray) -> np.ndarray:
        batch = z.shape[0]
        spatial = self.spatial_gen.forward(z)
        tracks = np.zeros((batch, self.config.num_tracks, self.config.time_steps, 84), dtype=np.float32)

        for t in range(self.config.num_tracks):
            z_tiled = np.tile(z[:, np.newaxis, :], (1, self.config.num_bars, 1))
            chords_tiled = np.tile(chords, (batch, 1, 1))
            temporal_in = np.concatenate([z_tiled, chords_tiled], axis=-1)

            for bar in range(self.config.num_bars):
                temp_feat = temporal_in[:, bar, :]
                weight = np.broadcast_to(spatial[:, t:t + 1, :], (batch, self.config.gen_hidden))
                spatial_feat = weight @ self.spatial_gen.w_h.T
                bar_pr = self.bar_gen.forward(temp_feat, spatial_feat)
                start = bar * self.config.time_steps // self.config.num_bars
                end = (bar + 1) * self.config.time_steps // self.config.num_bars
                tracks[:, t, start:end, :] = bar_pr[:, np.newaxis, :]

        return tracks

    def _generate_hybrid(self, z: np.ndarray, chords: np.ndarray) -> np.ndarray:
        batch = z.shape[0]
        spatial = self.spatial_gen.forward(z)

        z_global = np.tile(z[:, np.newaxis, :], (1, self.config.num_tracks, 1))
        z_local = z_global + 0.3 * np.random.randn(*z_global.shape).astype(np.float32)

        tracks = np.zeros((batch, self.config.num_tracks, self.config.time_steps, 84), dtype=np.float32)

        for t in range(self.config.num_tracks):
            z_t = z_local[:, t, :]
            z_tiled = np.tile(z_t[:, np.newaxis, :], (1, self.config.num_bars, 1))
            chords_tiled = np.tile(chords, (batch, 1, 1))
            temporal_in = np.concatenate([z_tiled, chords_tiled], axis=-1)

            for bar in range(self.config.num_bars):
                temp_feat = temporal_in[:, bar, :]
                spatial_feat = z_t + spatial[:, t, :] * 0.5
                bar_pr = self.bar_gen.forward(temp_feat, spatial_feat)
                start = bar * self.config.time_steps // self.config.num_bars
                end = (bar + 1) * self.config.time_steps // self.config.num_bars
                tracks[:, t, start:end, :] = bar_pr[:, np.newaxis, :]

        return tracks

    def discriminate_tracks(self, pianoroll: np.ndarray) -> list[np.ndarray]:
        """Run each track through its discriminator."""
        return [disc.discriminate(pianoroll[:, i:i + 1].reshape(pianoroll.shape[0], -1))
                for i, disc in enumerate(self.discriminators)]

    def to_midi_notes(
        self, pianoroll: np.ndarray, threshold: float = 0.5, track_names: list[str] | None = None,
    ) -> list[list[tuple[int, int, float, float]]]:
        """Convert pianoroll to list of (pitch, track, start_time, duration) per batch."""
        if track_names is None:
            track_names = [f"Track {i}" for i in range(self.config.num_tracks)]

        results: list[list[tuple[int, int, float, float]]] = []
        for b in range(pianoroll.shape[0]):
            batch_notes: list[tuple[int, int, float, float]] = []
            for t in range(self.config.num_tracks):
                pr = pianoroll[b, t] > threshold
                for pitch in range(pr.shape[1]):
                    onsets = np.where(np.diff(np.pad(pr[:, pitch].astype(int), (1, 0))) == 1)[0]
                    offsets = np.where(np.diff(np.pad(pr[:, pitch].astype(int), (0, 1))) == -1)[0]
                    for onset, offset in zip(onsets, offsets):
                        start_time = onset * self.tempo_sec_per_step
                        duration = (offset - onset) * self.tempo_sec_per_step
                        batch_notes.append((pitch + 36, t, start_time, duration))
            results.append(batch_notes)

        return results
