"""PopMAG: multi-track transformer with MuMIDI-style encoding.

Bar-level and position-level encoding with chord awareness
per the PopMAG paper (Ren et al. 2020).
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PopMAGConfig:
    max_bars: int = 64
    beats_per_bar: int = 4
    positions_per_beat: int = 4
    num_tracks: int = 8
    pitch_range: int = 128
    d_model: int = 512
    num_layers: int = 6
    num_heads: int = 8
    d_ff: int = 2048
    dropout: float = 0.1
    temperature: float = 1.0
    top_k: int = 40

    @property
    def num_positions(self) -> int:
        return self.beats_per_bar * self.positions_per_beat

    @property
    def vocab_size(self) -> int:
        bar_tokens = 2
        pos_tokens = self.num_positions
        track_tokens = self.num_tracks
        pitch_tokens = self.pitch_range
        dur_tokens = 64
        return bar_tokens + pos_tokens + track_tokens + pitch_tokens + dur_tokens

    @property
    def bar_offset(self) -> int:
        return 0

    @property
    def pos_offset(self) -> int:
        return self.bar_offset + 2

    @property
    def track_offset(self) -> int:
        return self.pos_offset + self.num_positions

    @property
    def pitch_offset(self) -> int:
        return self.track_offset + self.num_tracks

    @property
    def dur_offset(self) -> int:
        return self.pitch_offset + self.pitch_range


class MultiHeadAttention:
    """Multi-head scaled dot-product attention for PopMAG."""

    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        self.dropout = dropout
        self.scale = 1.0 / np.sqrt(self.d_k)

        rng = np.random.default_rng(42)
        s = 0.02
        self.w_q = rng.normal(0, s, (d_model, d_model)).astype(np.float32)
        self.w_k = rng.normal(0, s, (d_model, d_model)).astype(np.float32)
        self.w_v = rng.normal(0, s, (d_model, d_model)).astype(np.float32)
        self.w_o = rng.normal(0, s, (d_model, d_model)).astype(np.float32)

    def forward(self, x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        batch, seq, _ = x.shape

        q = (x @ self.w_q).reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        k = (x @ self.w_k).reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        v = (x @ self.w_v).reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)

        attn = q @ k.transpose(0, 1, 3, 2) * self.scale

        if mask is not None:
            attn = np.where(mask[:, np.newaxis, np.newaxis, :] == 0, -1e9, attn)

        causal = np.triu(np.ones((seq, seq), dtype=np.float32) * -1e9, k=1)
        attn = attn + causal[np.newaxis, np.newaxis, :, :]

        weights = np.exp(attn - np.max(attn, axis=-1, keepdims=True))
        weights /= np.sum(weights, axis=-1, keepdims=True)

        out = (weights @ v).transpose(0, 2, 1, 3).reshape(batch, seq, self.d_model)
        return out @ self.w_o


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x ** 3)))


class TransformerLayer:
    """Transformer layer with pre-norm architecture."""

    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout: float = 0.1):
        self.attention = MultiHeadAttention(d_model, num_heads, dropout)

        rng = np.random.default_rng(42)
        s = 0.02
        self.ff_w1 = rng.normal(0, s, (d_model, d_ff)).astype(np.float32)
        self.ff_b1 = np.zeros(d_ff, dtype=np.float32)
        self.ff_w2 = rng.normal(0, s, (d_ff, d_model)).astype(np.float32)
        self.ff_b2 = np.zeros(d_model, dtype=np.float32)
        self.ln1_scale = np.ones(d_model, dtype=np.float32)
        self.ln1_bias = np.zeros(d_model, dtype=np.float32)
        self.ln2_scale = np.ones(d_model, dtype=np.float32)
        self.ln2_bias = np.zeros(d_model, dtype=np.float32)

    def _layer_norm(self, x: np.ndarray, scale: np.ndarray, bias: np.ndarray) -> np.ndarray:
        mean = x.mean(axis=-1, keepdims=True)
        var = x.var(axis=-1, keepdims=True)
        return (x - mean) / np.sqrt(var + 1e-6) * scale + bias

    def forward(self, x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        x = self._layer_norm(x + self.attention.forward(x, mask), self.ln1_scale, self.ln1_bias)
        ff = _gelu(x @ self.ff_w1 + self.ff_b1)
        x = self._layer_norm(x + (ff @ self.ff_w2 + self.ff_b2), self.ln2_scale, self.ln2_bias)
        return x


class BarPositionEncoder:
    """Encodes bar, position, and track information for MuMIDI-style tokens."""

    def __init__(self, config: PopMAGConfig):
        self.config = config
        rng = np.random.default_rng(42)
        s = 0.02
        self.bar_embed = rng.normal(0, s, (config.max_bars, config.d_model)).astype(np.float32)
        self.pos_embed = rng.normal(0, s, (config.num_positions, config.d_model)).astype(np.float32)
        self.track_embed = rng.normal(0, s, (config.num_tracks, config.d_model)).astype(np.float32)
        self.chord_embed = rng.normal(0, s, (config.d_model, config.d_model)).astype(np.float32)

    def encode_position(self, bar: int, position: int, track: int) -> np.ndarray:
        return self.bar_embed[min(bar, self.config.max_bars - 1)] + \
               self.pos_embed[min(position, self.config.num_positions - 1)] + \
               self.track_embed[min(track, self.config.num_tracks - 1)]

    def embed_chord(self, chord_vec: np.ndarray) -> np.ndarray:
        return chord_vec @ self.chord_embed.T


class PopMAGModel:
    """Multi-track transformer with MuMIDI-style bar/position/chord encoding."""

    def __init__(self, config: PopMAGConfig | None = None):
        self.config = config or PopMAGConfig()
        self.position_encoder = BarPositionEncoder(self.config)

        rng = np.random.default_rng(42)
        s = 0.02
        self.token_embedding = rng.normal(
            0, s, (self.config.vocab_size, self.config.d_model),
        ).astype(np.float32)
        self.layers = [
            TransformerLayer(self.config.d_model, self.config.num_heads, self.config.d_ff)
            for _ in range(self.config.num_layers)
        ]
        self.output_proj = rng.normal(0, s, (self.config.d_model, self.config.vocab_size)).astype(np.float32)
        self.output_bias = np.zeros(self.config.vocab_size, dtype=np.float32)

    def _mu_midi_encode(
        self, bar: int, position: int, track: int, pitch: int, duration: int,
    ) -> list[int]:
        return [
            self.config.bar_offset,
            self.config.pos_offset + position,
            self.config.track_offset + track,
            self.config.pitch_offset + pitch,
            self.config.dur_offset + min(duration, 63),
        ]

    def encode_bar(
        self, bar_idx: int, chord_vec: np.ndarray,
        track_notes: list[list[tuple[int, int, int, int]]],
    ) -> np.ndarray:
        """Encode a bar into MuMIDI-style token sequence with chord conditioning."""
        tokens: list[int] = []
        for track_id, notes in enumerate(track_notes):
            for pitch, position, duration, velocity in notes:
                bar_tokens = self._mu_midi_encode(bar_idx, position, track_id, pitch, duration)
                tokens.extend(bar_tokens)

        if not tokens:
            tokens = self._mu_midi_encode(bar_idx, 0, 0, 60, 4)

        seq = np.array(tokens[:self.config.d_model], dtype=np.int32)
        x = self.token_embedding[seq]
        chord_cond = self.position_encoder.embed_chord(chord_vec)

        pos_enc = np.array([
            self.position_encoder.encode_position(
                bar_idx, i % self.config.num_positions,
                (i // self.config.num_positions) % self.config.num_tracks,
            )
            for i in range(len(seq))
        ], dtype=np.float32)

        return x + pos_enc + chord_cond[:len(seq), np.newaxis]

    def forward(self, x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        for layer in self.layers:
            x = layer.forward(x, mask)
        logits = x @ self.output_proj + self.output_bias
        return logits

    def generate_bar(
        self, bar_idx: int, chord_vec: np.ndarray, temperature: float = 1.0,
    ) -> list[tuple[int, int, int, int]]:
        """Generate one bar of multi-track music. Returns list of (track, pitch, position, duration)."""
        dummy = [(60, 0, 4, 80)]
        encoded = self.encode_bar(bar_idx, chord_vec, [dummy])
        logits = self.forward(encoded[np.newaxis, :])[0] / temperature

        probs = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
        probs /= np.sum(probs, axis=-1, keepdims=True)

        tokens = [
            int(np.random.choice(self.config.vocab_size, p=probs[i]))
            for i in range(len(logits))
        ]

        return self._decode_to_notes(tokens)

    def generate_full(
        self, chord_progression: list[np.ndarray], temperature: float = 1.0,
    ) -> list[list[tuple[int, int, int, int]]]:
        """Generate full multi-track sequence across all bars. Returns per-bar note lists."""
        bars: list[list[tuple[int, int, int, int]]] = []
        for bar_idx in range(min(len(chord_progression), self.config.max_bars)):
            bar_notes = self.generate_bar(bar_idx, chord_progression[bar_idx], temperature)
            bars.append(bar_notes)
        return bars

    def _decode_to_notes(self, tokens: list[int]) -> list[tuple[int, int, int, int]]:
        notes: list[tuple[int, int, int, int]] = []
        i = 0
        while i + 4 < len(tokens):
            if tokens[i] == self.config.bar_offset:
                pos = tokens[i + 1] - self.config.pos_offset
                track = tokens[i + 2] - self.config.track_offset
                pitch = tokens[i + 3] - self.config.pitch_offset
                dur = tokens[i + 4] - self.config.dur_offset
                if 0 <= pos < self.config.num_positions and 0 <= track < self.config.num_tracks:
                    if 0 <= pitch < self.config.pitch_range:
                        notes.append((track, pitch, pos, dur))
                i += 5
            else:
                i += 1
        return notes

    def sample(self, num_bars: int = 8, temperature: float = 1.0) -> list[list[tuple[int, int, int, int]]]:
        """Sample a random multi-track sequence."""
        chords = [np.random.randn(self.config.d_model).astype(np.float32) * 0.1
                  for _ in range(num_bars)]
        return self.generate_full(chords, temperature)
