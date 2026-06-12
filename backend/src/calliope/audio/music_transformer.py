"""MusicTransformer with relative position attention (skewing procedure from Huang et al.)."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Any

from calliope.audio.midi_representations import (
    NoteToken, encode_note_sequence, decode_token_sequence, VOCAB_SIZE, PAD_TOKEN, SOS_TOKEN, EOS_TOKEN
)


@dataclass
class TransformerConfig:
    vocab_size: int = VOCAB_SIZE
    d_model: int = 512
    num_layers: int = 6
    num_heads: int = 8
    d_ff: int = 2048
    max_seq_len: int = 2048
    dropout: float = 0.1
    temperature: float = 1.0
    top_k: int = 40
    top_p: float = 0.9


class RelativePositionAttention:
    """Relative position attention with skewing (Huang et al. MusicTransformer)."""

    def __init__(self, d_model: int, num_heads: int, max_len: int, dropout: float = 0.1):
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        self.max_len = max_len
        self.dropout = dropout

        scale = 1.0 / np.sqrt(self.d_k)
        self.scale = scale

        rng = np.random.default_rng(42)
        self.w_q = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)
        self.w_k = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)
        self.w_v = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)
        self.w_o = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)

        self.embedding_bias = rng.normal(0, 0.02, (max_len, max_len)).astype(np.float32)
        self.pos_embedding = rng.normal(0, 0.02, (max_len, d_model)).astype(np.float32)

    def _skew(self, x: np.ndarray) -> np.ndarray:
        n_heads, n_q, n_k = x.shape
        x_pad = np.pad(x, ((0, 0), (0, 0), (0, 1)), mode="constant")
        x_reshaped = x_pad.reshape(n_heads, n_k + 1, n_q)
        return x_reshaped[:, :n_k, :]

    def forward(self, x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        batch, seq, _ = x.shape

        q = x @ self.w_q
        k = x @ self.w_k
        v = x @ self.w_v

        q = q.reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        k = k.reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        v = v.reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)

        content_attn = q @ k.transpose(0, 1, 3, 2) * self.scale

        pe = self.pos_embedding[:seq, :] @ self.w_k
        pe = pe.reshape(seq, self.num_heads, self.d_k).transpose(1, 0, 2)
        q_heads = q[0] if batch == 1 else q[:, :, 0, :].mean(axis=0)  # simplified relative
        pos_attn = q_heads @ pe.transpose(0, 2, 1)
        pos_attn = pos_attn.transpose(0, 2, 1)
        pos_attn = self._skew(pos_attn)

        if pos_attn.shape[-1] != content_attn.shape[-1]:
            pos_attn = pos_attn[:, :, :content_attn.shape[-1]]

        attn = content_attn + pos_attn[np.newaxis, :, :, :]

        if mask is not None:
            attn = np.where(mask[:, np.newaxis, np.newaxis, :] == 0, -1e9, attn)

        attn_weights = np.exp(attn - np.max(attn, axis=-1, keepdims=True))
        attn_weights /= np.sum(attn_weights, axis=-1, keepdims=True)

        out = attn_weights @ v
        out = out.transpose(0, 2, 1, 3).reshape(batch, seq, self.d_model)
        out = out @ self.w_o
        return out


class CausalSelfAttention:
    """Causal self-attention with future masking."""

    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        self.dropout = dropout
        self.scale = 1.0 / np.sqrt(self.d_k)

        rng = np.random.default_rng(42)
        self.w_q = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)
        self.w_k = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)
        self.w_v = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)
        self.w_o = rng.normal(0, 0.02, (d_model, d_model)).astype(np.float32)

    def forward(self, x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        batch, seq, _ = x.shape

        q = x @ self.w_q
        k = x @ self.w_k
        v = x @ self.w_v

        q = q.reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        k = k.reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)
        v = v.reshape(batch, seq, self.num_heads, self.d_k).transpose(0, 2, 1, 3)

        attn = q @ k.transpose(0, 1, 3, 2) * self.scale

        causal = np.triu(np.ones((seq, seq), dtype=np.float32) * -1e9, k=1)
        attn = attn + causal[np.newaxis, np.newaxis, :, :]

        if mask is not None:
            attn = np.where(mask[:, np.newaxis, np.newaxis, :] == 0, -1e9, attn)

        attn_weights = np.exp(attn - np.max(attn, axis=-1, keepdims=True))
        attn_weights /= np.sum(attn_weights, axis=-1, keepdims=True)

        out = attn_weights @ v
        out = out.transpose(0, 2, 1, 3).reshape(batch, seq, self.d_model)
        out = out @ self.w_o
        return out


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x ** 3)))


class TransformerLayer:
    def __init__(self, d_model: int, num_heads: int, d_ff: int, max_len: int, dropout: float = 0.1):
        self.attention = RelativePositionAttention(d_model, num_heads, max_len, dropout)
        rng = np.random.default_rng(42)
        self.ff_w1 = rng.normal(0, 0.02, (d_model, d_ff)).astype(np.float32)
        self.ff_b1 = np.zeros(d_ff, dtype=np.float32)
        self.ff_w2 = rng.normal(0, 0.02, (d_ff, d_model)).astype(np.float32)
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
        attn_out = self.attention.forward(x, mask)
        x = self._layer_norm(x + attn_out, self.ln1_scale, self.ln1_bias)
        ff = _gelu(x @ self.ff_w1 + self.ff_b1)
        ff_out = ff @ self.ff_w2 + self.ff_b2
        x = self._layer_norm(x + ff_out, self.ln2_scale, self.ln2_bias)
        return x


class MusicTransformerModel:
    """MusicTransformer with relative position attention. Huang et al. 2018."""

    def __init__(self, config: TransformerConfig | None = None):
        self.config = config or TransformerConfig()
        rng = np.random.default_rng(42)
        self.token_embedding = rng.normal(0, 0.02, (self.config.vocab_size, self.config.d_model)).astype(np.float32)
        self.pos_encoding = rng.normal(0, 0.02, (self.config.max_seq_len, self.config.d_model)).astype(np.float32)
        self.layers = [
            TransformerLayer(
                self.config.d_model, self.config.num_heads, self.config.d_ff,
                self.config.max_seq_len, self.config.dropout
            )
            for _ in range(self.config.num_layers)
        ]
        self.output_proj = rng.normal(0, 0.02, (self.config.d_model, self.config.vocab_size)).astype(np.float32)
        self.output_bias = np.zeros(self.config.vocab_size, dtype=np.float32)

    def forward(self, token_ids: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        batch, seq = token_ids.shape
        x = self.token_embedding[token_ids]
        x = x + self.pos_encoding[np.newaxis, :seq, :]

        for layer in self.layers:
            x = layer.forward(x, mask)

        logits = x @ self.output_proj + self.output_bias
        return logits

    def generate(
        self,
        seed_tokens: list[int] | None = None,
        max_length: int = 256,
        temperature: float = 1.0,
        top_k: int = 40,
        top_p: float = 0.9,
    ) -> list[int]:
        if seed_tokens is None:
            seed_tokens = [SOS_TOKEN]
        generated = list(seed_tokens)

        for _ in range(max_length):
            seq = np.array([generated[-self.config.max_seq_len:]], dtype=np.int32)
            logits = self.forward(seq)
            next_logits = logits[0, -1, :]

            next_logits = next_logits / temperature
            exp_logits = np.exp(next_logits - np.max(next_logits))
            probs = exp_logits / np.sum(exp_logits)

            if top_k > 0:
                indices = np.argpartition(probs, -top_k)[-top_k:]
                mask = np.zeros_like(probs)
                mask[indices] = 1.0
                probs = probs * mask
                probs = probs / np.sum(probs)

            if top_p < 1.0:
                sorted_idx = np.argsort(probs)[::-1]
                cumsum = np.cumsum(probs[sorted_idx])
                cutoff = np.searchsorted(cumsum, top_p) + 1
                mask = np.zeros_like(probs)
                mask[sorted_idx[:cutoff]] = 1.0
                probs = probs * mask
                probs = probs / np.sum(probs)

            next_token = int(np.random.choice(len(probs), p=probs))
            generated.append(next_token)
            if next_token == EOS_TOKEN:
                break

        return generated

    def preprocess_midi(self, notes: list[NoteToken], encoding: str = "remi") -> np.ndarray:
        tokens = encode_note_sequence(notes, encoding)
        max_seq = min(len(tokens), self.config.max_seq_len)
        arr = np.full((1, self.config.max_seq_len), PAD_TOKEN, dtype=np.int32)
        arr[0, :max_seq] = tokens[:max_seq]
        return arr

    def generate_from_notes(
        self,
        seed_notes: list[NoteToken],
        encoding: str = "remi",
        max_new_tokens: int = 256,
    ) -> list[NoteToken]:
        seed_tokens = encode_note_sequence(seed_notes, encoding)
        full_tokens = self.generate(seed_tokens, max_length=max_new_tokens)
        return decode_token_sequence(full_tokens, encoding)
