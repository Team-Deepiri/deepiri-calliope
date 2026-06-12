"""MusicVAE: hierarchical VAE with bidirectional RNN encoder + conductor RNN + decoder RNN."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Any

from calliope.audio.midi_representations import NoteToken, encode_note_sequence, decode_token_sequence, VOCAB_SIZE


@dataclass
class VAEConfig:
    latent_dim: int = 512
    encoder_dim: int = 1024
    decoder_dim: int = 1024
    conductor_dim: int = 512
    num_encoder_layers: int = 2
    num_decoder_layers: int = 2
    num_conductor_steps: int = 16
    vocab_size: int = VOCAB_SIZE
    max_seq_len: int = 2048
    kl_beta: float = 1.0
    kl_anneal_steps: int = 40000
    temperature: float = 1.0


class EncoderRNN:
    """Bidirectional RNN encoder for MusicVAE."""

    def __init__(self, input_dim: int, hidden_dim: int, num_layers: int = 2):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers

        rng = np.random.default_rng(42)
        s = 0.02
        self.w_ih_f = [rng.normal(0, s, (hidden_dim, input_dim if l == 0 else hidden_dim)).astype(np.float32) for l in range(num_layers)]
        self.w_hh_f = [rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32) for l in range(num_layers)]
        self.b_h_f = [np.zeros(hidden_dim, dtype=np.float32) for _ in range(num_layers)]

        self.w_ih_b = [rng.normal(0, s, (hidden_dim, input_dim if l == 0 else hidden_dim)).astype(np.float32) for l in range(num_layers)]
        self.w_hh_b = [rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32) for l in range(num_layers)]
        self.b_h_b = [np.zeros(hidden_dim, dtype=np.float32) for _ in range(num_layers)]

    def _rnn_step(self, x: np.ndarray, h: np.ndarray, w_ih: list, w_hh: list, b_h: list) -> np.ndarray:
        for l in range(self.num_layers):
            h[l] = np.tanh(x @ w_ih[l].T + h[l] @ w_hh[l].T + b_h[l])
            x = h[l]
        return h

    def forward(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        seq_len, batch, _ = x.shape
        h_f = [np.zeros((batch, self.hidden_dim), dtype=np.float32) for _ in range(self.num_layers)]
        h_b = [np.zeros((batch, self.hidden_dim), dtype=np.float32) for _ in range(self.num_layers)]

        for t in range(seq_len):
            h_f = self._rnn_step(x[t], h_f, self.w_ih_f, self.w_hh_f, self.b_h_f)

        for t in range(seq_len - 1, -1, -1):
            h_b = self._rnn_step(x[t], h_b, self.w_ih_b, self.w_hh_b, self.b_h_b)

        h_final = np.concatenate([h_f[-1], h_b[-1]], axis=-1)
        return h_final, h_final


class ConductorRNN:
    """Conductor RNN that generates latent codes for hierarchical decoder steps."""

    def __init__(self, latent_dim: int, conductor_dim: int, num_steps: int = 16):
        self.latent_dim = latent_dim
        self.conductor_dim = conductor_dim
        self.num_steps = num_steps

        rng = np.random.default_rng(42)
        s = 0.02
        self.w_in = rng.normal(0, s, (conductor_dim, latent_dim)).astype(np.float32)
        self.b_in = np.zeros(conductor_dim, dtype=np.float32)
        self.w_hh = rng.normal(0, s, (conductor_dim, conductor_dim)).astype(np.float32)
        self.b_h = np.zeros(conductor_dim, dtype=np.float32)
        self.w_out = rng.normal(0, s, (latent_dim * 2, conductor_dim)).astype(np.float32)
        self.b_out = np.zeros(latent_dim * 2, dtype=np.float32)

    def forward(self, z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        batch = z.shape[0]
        h = np.tanh(z @ self.w_in.T + self.b_in)
        means = []
        stds = []

        for _ in range(self.num_steps):
            h = np.tanh(h @ self.w_hh.T + self.b_h)
            params = h @ self.w_out.T + self.b_out
            mean, logvar = np.split(params, 2, axis=-1)
            std = np.exp(0.5 * logvar)
            means.append(mean)
            stds.append(std)

        return np.stack(means, axis=1), np.stack(stds, axis=1)


class DecoderRNN:
    """Autoregressive decoder RNN conditioned on conductor latent codes."""

    def __init__(self, input_dim: int, hidden_dim: int, vocab_size: int, num_layers: int = 2):
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.vocab_size = vocab_size
        self.num_layers = num_layers

        rng = np.random.default_rng(42)
        s = 0.02
        self.w_ih = [rng.normal(0, s, (hidden_dim, input_dim if l == 0 else hidden_dim)).astype(np.float32) for l in range(num_layers)]
        self.w_hh = [rng.normal(0, s, (hidden_dim, hidden_dim)).astype(np.float32) for l in range(num_layers)]
        self.b_h = [np.zeros(hidden_dim, dtype=np.float32) for _ in range(num_layers)]

        self.w_out = rng.normal(0, s, (vocab_size, hidden_dim)).astype(np.float32)
        self.b_out = np.zeros(vocab_size, dtype=np.float32)
        self.embedding = rng.normal(0, s, (vocab_size, input_dim)).astype(np.float32)

    def forward_step(self, token: int, h: list[np.ndarray], c: np.ndarray | None = None) -> tuple[np.ndarray, list[np.ndarray]]:
        x = self.embedding[token][np.newaxis, :]
        if c is not None:
            x = x + c

        for l in range(self.num_layers):
            h[l] = np.tanh(x @ self.w_ih[l].T + h[l] @ self.w_hh[l].T + self.b_h[l])
            x = h[l]

        logits = x @ self.w_out.T + self.b_out
        return logits[0], h

    def forward(self, tokens: np.ndarray, conductor_codes: np.ndarray | None = None) -> np.ndarray:
        batch, seq = tokens.shape
        h = [np.zeros((batch, self.hidden_dim), dtype=np.float32) for _ in range(self.num_layers)]
        logits_list: list[np.ndarray] = []

        for t in range(seq):
            x = self.embedding[tokens[:, t]]
            if conductor_codes is not None:
                step_idx = min(t, conductor_codes.shape[1] - 1)
                x = x + conductor_codes[:, step_idx, :]

            for l in range(self.num_layers):
                h[l] = np.tanh(x @ self.w_ih[l].T + h[l] @ self.w_hh[l].T + self.b_h[l])
                x = h[l]

            logits = x @ self.w_out.T + self.b_out
            logits_list.append(logits)

        return np.stack(logits_list, axis=1)


class MusicVAE:
    """Hierarchical VAE with bidirectional RNN encoder, conductor RNN, and autoregressive decoder."""

    def __init__(self, config: VAEConfig | None = None):
        self.config = config or VAEConfig()
        self.step = 0

        self.encoder = EncoderRNN(self.config.vocab_size, self.config.encoder_dim, self.config.num_encoder_layers)
        self.conductor = ConductorRNN(self.config.latent_dim, self.config.conductor_dim, self.config.num_conductor_steps)
        self.decoder = DecoderRNN(
            self.config.vocab_size, self.config.decoder_dim,
            self.config.vocab_size, self.config.num_decoder_layers
        )

        rng = np.random.default_rng(42)
        s = 0.02
        self.mean_proj = rng.normal(0, s, (self.config.latent_dim, self.config.encoder_dim * 2)).astype(np.float32)
        self.mean_bias = np.zeros(self.config.latent_dim, dtype=np.float32)
        self.logvar_proj = rng.normal(0, s, (self.config.latent_dim, self.config.encoder_dim * 2)).astype(np.float32)
        self.logvar_bias = np.zeros(self.config.latent_dim, dtype=np.float32)

    def _kl_beta(self) -> float:
        if self.step < self.config.kl_anneal_steps:
            return self.config.kl_beta * (self.step / self.config.kl_anneal_steps)
        return self.config.kl_beta

    def encode(self, tokens: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        seq_len = tokens.shape[1]
        x = np.eye(self.config.vocab_size, dtype=np.float32)[tokens]
        x = x.transpose(1, 0, 2)

        encoded = self.encoder.forward(x)[0]
        mean = encoded @ self.mean_proj.T + self.mean_bias
        logvar = encoded @ self.logvar_proj.T + self.logvar_bias
        return mean, logvar

    def _reparameterize(self, mean: np.ndarray, logvar: np.ndarray) -> np.ndarray:
        std = np.exp(0.5 * logvar)
        eps = np.random.randn(*std.shape).astype(np.float32)
        return mean + eps * std

    def decode(self, z: np.ndarray) -> np.ndarray:
        cond_means, cond_stds = self.conductor.forward(z)
        eps = np.random.randn(*cond_stds.shape).astype(np.float32)
        conductor_codes = cond_means + eps * cond_stds

        batch_size = z.shape[0]
        start_tokens = np.full((batch_size, 1), 1, dtype=np.int32)
        return self.decoder.forward(start_tokens, conductor_codes)

    def sample(self, num_samples: int = 1, temperature: float = 1.0) -> list[list[int]]:
        z = np.random.randn(num_samples, self.config.latent_dim).astype(np.float32)
        cond_means, cond_stds = self.conductor.forward(z)
        eps = np.random.randn(*cond_stds.shape).astype(np.float32)
        conductor_codes = cond_means + eps * cond_stds

        results: list[list[int]] = []
        for i in range(num_samples):
            tokens: list[int] = [1]
            h = [np.zeros((1, self.config.decoder_dim), dtype=np.float32) for _ in range(self.config.num_decoder_layers)]

            for t in range(self.config.max_seq_len):
                step_idx = min(t, conductor_codes.shape[1] - 1)
                c = conductor_codes[i:i+1, step_idx]

                logits, h = self.decoder.forward_step(tokens[-1], h, c)
                logits = logits / temperature
                probs = np.exp(logits - np.max(logits))
                probs = probs / np.sum(probs)

                next_token = int(np.random.choice(self.config.vocab_size, p=probs))
                tokens.append(next_token)
                if next_token == 2:
                    break

            results.append(tokens)

        return results

    def interpolate(self, tokens_a: np.ndarray, tokens_b: np.ndarray, steps: int = 10) -> list[list[int]]:
        mean_a, logvar_a = self.encode(tokens_a)
        mean_b, logvar_b = self.encode(tokens_b)
        z_a = self._reparameterize(mean_a, logvar_a)
        z_b = self._reparameterize(mean_b, logvar_b)

        results: list[list[int]] = []
        for i in range(steps):
            alpha = i / (steps - 1)
            z = (1 - alpha) * z_a + alpha * z_b
            cond_means, cond_stds = self.conductor.forward(z)
            eps = np.random.randn(*cond_stds.shape).astype(np.float32)
            conductor_codes = cond_means + eps * cond_stds

            tokens: list[int] = [1]
            h = [np.zeros((1, self.config.decoder_dim), dtype=np.float32) for _ in range(self.config.num_decoder_layers)]

            for t in range(self.config.max_seq_len):
                step_idx = min(t, conductor_codes.shape[1] - 1)
                c = conductor_codes[0:1, step_idx]
                logits, h = self.decoder.forward_step(tokens[-1], h, c)
                probs = np.exp(logits - np.max(logits))
                probs = probs / np.sum(probs)
                next_token = int(np.random.choice(self.config.vocab_size, p=probs))
                tokens.append(next_token)
                if next_token == 2:
                    break

            results.append(tokens)

        return results

    def train_step(
        self, tokens: np.ndarray
    ) -> dict[str, float]:
        mean, logvar = self.encode(tokens)
        z = self._reparameterize(mean, logvar)

        cond_means, cond_stds = self.conductor.forward(z)
        eps = np.random.randn(*cond_stds.shape).astype(np.float32)
        conductor_codes = cond_means + eps * cond_stds

        logits = self.decoder.forward(tokens[:, :-1], conductor_codes)

        log_probs = logits - np.log(np.sum(np.exp(logits), axis=-1, keepdims=True))
        recon_loss = -np.mean(log_probs[np.arange(logits.shape[0])[:, None], np.arange(logits.shape[1]), tokens[:, 1:]])

        kl_loss = -0.5 * np.mean(1 + logvar - mean ** 2 - np.exp(logvar))
        beta = self._kl_beta()
        loss = recon_loss + beta * kl_loss

        self.step += 1
        return {
            "loss": float(loss),
            "recon_loss": float(recon_loss),
            "kl_loss": float(kl_loss),
            "kl_beta": float(beta),
        }

    def encode_notes(self, notes: list[NoteToken], encoding: str = "remi") -> np.ndarray:
        from calliope.audio.midi_representations import encode_note_sequence
        tokens = encode_note_sequence(notes, encoding)
        arr = np.full((1, self.config.max_seq_len), 0, dtype=np.int32)
        arr[0, :min(len(tokens), self.config.max_seq_len)] = tokens[:self.config.max_seq_len]
        mean, _ = self.encode(arr)
        return mean

    def decode_to_notes(self, z: np.ndarray, encoding: str = "remi") -> list[NoteToken]:
        tokens_list = self.sample(num_samples=1)
        return decode_token_sequence(tokens_list[0], encoding)
