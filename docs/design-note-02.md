# Design Note 02 — Audio Engine & DSP Pipeline

## Real-Time Audio Engine Design

The audio engine operates on a pull-based callback model. The master thread requests buffers from the audio driver (ASIO/CoreAudio/WASAPI) which triggers a processing chain:

```
Audio Driver -> Master Mix -> Track Mixes -> Clip Processors -> Plugin Chain -> Output
```

Each processing stage operates on fixed-size buffers (default 256 samples at 48kHz, ~5.3ms latency). The engine maintains strict adherence to real-time constraints — no blocking I/O, memory allocation, or file access in the audio thread.

## Buffer Management

The engine uses a double-buffer (ping-pong) system:
- **Write buffer**: Filled by the non-real-time thread (UI, file loading, AI processing)
- **Read buffer**: Consumed by the real-time audio thread
- Buffer swap occurs at safe points (buffer boundary, no plugin processing active)

Buffer sizes are configurable: 32, 64, 128, 256, 512, 1024 samples. Smaller buffers reduce latency but increase CPU load and risk of xruns.

## Plugin Architecture

### VST/AU/CLAP Compatibility Roadmap

Current state: Native DSP modules built into the engine.

| Phase | Format | Timeline |
|-------|--------|----------|
| 1 | Native Calliope DSP (built-in) | Current |
| 2 | CLAP (CLever Audio Plugin) | Q3 2026 |
| 3 | VST3 (via Steinberg SDK) | Q4 2026 |
| 4 | AU (macOS Audio Units) | Q1 2027 |

Plugin hosting architecture:
- **Plugin Bridge**: Isolated process per plugin for crash protection
- **Parameter Model**: Float-normalized parameters (0.0-1.0) with host-side automation
- **MIDI/Note Events**: Passed through plugin chain alongside audio buffers
- **Preset System**: XML-based preset format for cross-format compatibility

## Latency Compensation

The engine tracks plugin-reported latency and compensates via:
1. Automatic delay compensation (ADC) on all tracks
2. Lookahead for sidechain/compression scenarios
3. PDC (Plugin Delay Compensation) reporting for external sync

Total round-trip latency = driver buffer + plugin chain + safety buffer (configurable, default +2ms).
