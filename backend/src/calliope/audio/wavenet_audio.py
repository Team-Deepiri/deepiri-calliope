"""WaveNet: causal dilated convolutional network for audio generation.

Residual blocks with gated activation units, skip connections,
and causal dilated convolutions implemented in numpy.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Any


@dataclass
class WaveNetConfig:
    num_blocks: int = 4
    num_layers_per_block: int = 10
    residual_channels: int = 256
    skip_channels: int = 256
    filter_width: int = 2
    quantization_channels: int = 256
    sample_rate: int = 48000
    temperature: float = 1.0


class CausalConv1D:
    """1D causal convolution with dilation. No future context leakage."""

    def __init__(self, in_channels: int, out_channels: int, kernel_size: int, dilation: int = 1):
        self.in_channels = in_channels
        self.out_channels = out_channels
        self.kernel_size = kernel_size
        self.dilation = dilation
        self.receptive_field = (kernel_size - 1) * dilation + 1

        rng = np.random.default_rng(42)
        s = 0.02
        shape = (out_channels, in_channels, kernel_size)
        self.weight = rng.normal(0, s, shape).astype(np.float32)
        self.bias = np.zeros(out_channels, dtype=np.float32)

    def forward(self, x: np.ndarray) -> np.ndarray:
        """Causal convolution.

        Args:
            x: (batch, channels, time) input tensor.

        Returns:
            (batch, out_channels, time) output (left-padded to same length).
        """
        batch, channels, time = x.shape
        pad = (self.kernel_size - 1) * self.dilation

        x_pad = np.pad(x, ((0, 0), (0, 0), (pad, 0)), mode="constant")

        out = np.zeros((batch, self.out_channels, time), dtype=np.float32)

        for t in range(time):
            for c_out in range(self.out_channels):
                acc = self.bias[c_out]
                for c_in in range(channels):
                    for k in range(self.kernel_size):
                        idx = t + pad - k * self.dilation
                        acc += self.weight[c_out, c_in, k] * x_pad[:, c_in, idx]
                out[:, c_out, t] = acc

        return out


class GatedActivation:
    """Gated activation unit: tanh(W_f * x) * sigmoid(W_g * x)."""

    def __init__(self, channels: int, kernel_size: int, dilation: int):
        self.conv_f = CausalConv1D(channels, channels, kernel_size, dilation)
        self.conv_g = CausalConv1D(channels, channels, kernel_size, dilation)

    def forward(self, x: np.ndarray) -> np.ndarray:
        return np.tanh(self.conv_f.forward(x)) * scipy_sigmoid(self.conv_g.forward(x))


def scipy_sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -15, 15)))


class ResidualBlock:
    """WaveNet residual block with gated activation, skip connection, and 1x1 convs."""

    def __init__(self, residual_channels: int, skip_channels: int, kernel_size: int, dilation: int):
        self.gated = GatedActivation(residual_channels, kernel_size, dilation)

        rng = np.random.default_rng(42)
        s = 0.02
        self.res_w = rng.normal(0, s, (residual_channels, residual_channels)).astype(np.float32)
        self.res_b = np.zeros(residual_channels, dtype=np.float32)
        self.skip_w = rng.normal(0, s, (skip_channels, residual_channels)).astype(np.float32)
        self.skip_b = np.zeros(skip_channels, dtype=np.float32)

    def forward(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Forward pass.

        Args:
            x: (batch, channels, time) input.

        Returns:
            (residual_out, skip_out) tuple.
        """
        gated_out = self.gated.forward(x)

        res_out = gated_out.transpose(0, 2, 1) @ self.res_w.T + self.res_b
        res_out = res_out.transpose(0, 2, 1)
        res_out = (res_out + x) * 0.7071

        skip_out = gated_out.transpose(0, 2, 1) @ self.skip_w.T + self.skip_b
        skip_out = skip_out.transpose(0, 2, 1)

        return res_out, skip_out


class WaveNet:
    """WaveNet causal dilated convolutional network for raw audio generation."""

    def __init__(self, config: WaveNetConfig | None = None):
        self.config = config or WaveNetConfig()
        self._build_network()

    def _build_network(self) -> None:
        rng = np.random.default_rng(42)
        s = 0.02

        self.input_conv = CausalConv1D(
            self.config.quantization_channels, self.config.residual_channels,
            kernel_size=2, dilation=1,
        )

        self.blocks: list[list[ResidualBlock]] = []
        for b in range(self.config.num_blocks):
            block_layers: list[ResidualBlock] = []
            for l in range(self.config.num_layers_per_block):
                dilation = 2 ** l
                block = ResidualBlock(
                    self.config.residual_channels, self.config.skip_channels,
                    self.config.filter_width, dilation,
                )
                block_layers.append(block)
            self.blocks.append(block_layers)

        total_layers = self.config.num_blocks * self.config.num_layers_per_block
        receptive = sum((self.config.filter_width - 1) * (2 ** (l % self.config.num_layers_per_block))
                        for l in range(total_layers)) + 1
        self.receptive_field = receptive

        self.skip_w = rng.normal(0, s, (self.config.skip_channels, self.config.skip_channels)).astype(np.float32)
        self.skip_b = np.zeros(self.config.skip_channels, dtype=np.float32)
        self.out_w = rng.normal(0, s, (self.config.quantization_channels, self.config.skip_channels)).astype(np.float32)
        self.out_b = np.zeros(self.config.quantization_channels, dtype=np.float32)

    def forward(self, x: np.ndarray) -> np.ndarray:
        """Forward pass through full WaveNet.

        Args:
            x: (batch, channels, time) one-hot encoded audio.

        Returns:
            (batch, quantization_channels, time) logits.
        """
        batch, channels, time = x.shape
        current = self.input_conv.forward(x)
        skip_accum = np.zeros((batch, self.config.skip_channels, time), dtype=np.float32)

        for block in self.blocks:
            for layer in block:
                current, skip_out = layer.forward(current)
                skip_accum += skip_out

        skip_accum = np.tanh(skip_accum.transpose(0, 2, 1) @ self.skip_w.T + self.skip_b)
        skip_accum = skip_accum.transpose(0, 2, 1)

        out = skip_accum.transpose(0, 2, 1) @ self.out_w.T + self.out_b
        return out.transpose(0, 2, 1)

    def generate(
        self, num_samples: int = 48000, seed: np.ndarray | None = None,
    ) -> np.ndarray:
        """Autoregressively generate audio samples.

        Args:
            num_samples: number of samples to generate.
            seed: optional (receptive_field,) initial context.

        Returns:
            (num_samples,) generated audio as float32 in [-1, 1].
        """
        ctx_len = self.receptive_field
        if seed is not None and len(seed) >= ctx_len:
            context = seed[-ctx_len:].copy()
        else:
            context = np.zeros(ctx_len, dtype=np.float32)

        generated: list[float] = []
        for _ in range(num_samples):
            x_onehot = np.zeros((1, self.config.quantization_channels, ctx_len), dtype=np.float32)
            for t in range(ctx_len):
                idx = int((context[t] + 1.0) * 0.5 * (self.config.quantization_channels - 1))
                idx = np.clip(idx, 0, self.config.quantization_channels - 1)
                x_onehot[0, idx, t] = 1.0

            logits = self.forward(x_onehot)
            next_logits = logits[0, :, -1] / self.config.temperature

            exp_l = np.exp(next_logits - np.max(next_logits))
            probs = exp_l / np.sum(exp_l)
            sample = int(np.random.choice(self.config.quantization_channels, p=probs))

            sample_val = (sample / (self.config.quantization_channels - 1)) * 2.0 - 1.0
            generated.append(sample_val)

            context = np.concatenate([context[1:], np.array([sample_val])])

        return np.array(generated, dtype=np.float32)

    def receptive_field_size(self) -> int:
        return self.receptive_field
