# Changelog

All notable changes to the Deepiri Calliope project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v0.2.0

### Added
- AI arrangement generation and variation endpoints (`POST /v1/arrangement/generate`, `POST /v1/arrangement/variation`)
- AI mix enhancements: arrange-from-text, master-with-reference, analyze-reference, conduct endpoints
- Drum machine sample loading implementation (was TODO placeholder)
- Full Vocal AI panel with arrangement style, vocal style, genre presets, progress tracking, waveform preview
- CONDUCT FULL MASTER button wired to backend in Studio page
- Comprehensive design documentation (12 design notes covering sequencing, DSP, automation, mixer, MIDI, sampling, AI pipeline, mastering, project management, vocal production, performance, roadmap)
- `CHANGELOG.md` and `ROADMAP.md` for project tracking

### Fixed
- Drum machine sample loading: `generate_step` now loads and processes sample files via `read_audio_file`
- VoiceDSPPanel unused import in Studio.tsx
- `measure_lufs` convenience function added to loudness module

## [0.1.0] — 2026-03-15

### Added
- FastAPI backend with modular route architecture
- AI vocal synthesis engine (AIVocalSynthesizer, NeuralVocalEngine)
- Harmony engine with chord progression generation (major, minor, dorian, phrygian, lydian, mixolydian)
- Melody generator with Markov chain state machine
- Drum machine with synthesis-based kicks, snares, hihats, and 16-step sequencing
- Conductor engine for end-to-end song generation from prompt
- AIMixEngine with auto-level, auto-EQ, auto-compression, stereo width, warmth
- Auto-master with loud, balanced, and subtle mastering styles
- Full recording pipeline (session creation, file upload, processing)
- Plugin system with autotune, delay, reverb, chorus, distortion, filter, phaser, flanger
- Vocal effects presets system
- MIDI import/export
- Audio clip management with upload, analysis, feature extraction
- Stem separation infrastructure
- Looping tools (slice, detect tempo, warp)
- Monitoring system (level, VU, loudness, stereo analysis)
- Preset management for mixer, instruments, effects
- Batch processing for multi-track workflows
- WebSocket support for real-time audio streaming
- Aamati groove/mood ontology integration
- Frontend Studio UI with architect panel, vocal AI panel, mixer, piano roll, timeline
- Vocal rack DSP chain (16-stage configurable processing)
- Docker Compose setup with PostgreSQL, Ollama
- Settings system with .env configuration

### Infrastructure
- FastAPI application with CORS, request ID middleware
- SQLAlchemy async database with PostgreSQL
- Pydantic-v2 settings with environment variable support
- Path-based audio storage organization
- Provider router supporting Ollama, OpenAI, Anthropic, OpenRouter, Gemini
