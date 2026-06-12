# Roadmap

Deepiri Calliope — Autonomous Music Production Suite

## Current Capabilities (v0.1.0 — v0.2.0)

- **AI Music Generation**: Conductor-based song generation from text prompts, harmony engine with multiple scale types, melody generation with Markov chains, drum machine with Euclidean patterns
- **AI Mixing & Mastering**: Automatic leveling, EQ, compression, stereo enhancement, saturation. Loud, balanced, and subtle mastering styles. Reference track matching.
- **Vocal Production**: Neural vocal synthesis, 16-stage vocal DSP chain, autotune with formant preservation, vocal doubling modes
- **Audio Processing**: Sample-accurate audio I/O (WAV, MP3, FLAC, OGG, M4A), stem separation infrastructure, spectrum analysis, loudness metering (LUFS)
- **Studio UI**: Timeline view, mixer console (with routing, buses, VCA), piano roll, vocal rack editor, plugin chain editor, audio clip manager
- **API**: FastAPI with 25+ route modules, provider-agnostic LLM routing, WebSocket streaming

## Q3 2026 Milestones (v0.3.0 — v0.4.0)

### Core Audio Engine
- [ ] Real-time audio playback engine with ASIO/CoreAudio/WASAPI support
- [ ] Low-latency buffer management (256 sample target at 48kHz)
- [ ] Non-destructive clip editing with fade, slip, time-stretch, pitch-shift
- [ ] Disk streaming for large audio projects
- [ ] Plugin delay compensation (PDC)

### MIDI & Sequencing
- [ ] Full piano roll editor with velocity, CC lanes, aftertouch
- [ ] MIDI FX chain: arpeggiator, chord generator, scale mapper
- [ ] Real-time MIDI input recording with quantization
- [ ] Step sequencer with per-step parameter locking

### Mixing & Routing
- [ ] Fully functional mixer with 4-band parametric EQ, compressor, gate
- [ ] Sidechain routing with visual configuration
- [ ] VCA groups with mute/solo follow
- [ ] Send/return FX buses
- [ ] Automation curves (breakpoint, LFO, audio-rate)

### AI Features
- [ ] Prompt-based arrangement generation with real-time preview
- [ ] AI drum pattern suggestion from genre analysis
- [ ] Auto-mix presets per genre (EDM, hip-hop, rock, pop, jazz, classical)
- [ ] Vocal synthesis optimization for real-time monitoring

### Infrastructure
- [ ] Project save/load (.calliope format)
- [ ] Snapshot and version history system
- [ ] User account system with authentication
- [ ] Plugin hosting: CLAP support
- [ ] Test coverage: 70%+ on audio engine

## Q4 2026 Milestones (v0.5.0 — v0.6.0)

### Advanced Production Tools
- [ ] Sample browser with database indexing, preview, BPM/key detection
- [ ] Audio recording with punch-in/out, comping
- [ ] Elastique Pro time-stretching integration
- [ ] Multi-track recording (16+ simultaneous inputs)
- [ ] MIDI learn for hardware controller mapping
- [ ] VST3 plugin hosting

### Mixing & Mastering
- [ ] Surround mixing: Quad (4.0) and 5.1 support
- [ ] AI mastering assistant with multi-reference matching
- [ ] True peak limiting with inter-sample peak detection
- [ ] Loudness normalization for streaming platform targets
- [ ] Batch export with format conversion

### Collaboration & Cloud
- [ ] Real-time multi-user project editing (CRDT-based)
- [ ] Cloud project storage with S3 backend
- [ ] User roles: owner, editor, contributor, viewer
- [ ] Shareable project links with access control
- [ ] Collaboration history with merge/rebase

### AI Innovation
- [ ] Real-time voice conversion with pre-trained RVC models
- [ ] Multi-language vocal synthesis (Japanese, Mandarin, Spanish, French)
- [ ] AI stem separation (production quality)
- [ ] Genre style transfer (apply genre characteristics to any mix)

## 2027 Vision (v1.0.0+)

### Professional DAW Capabilities
- [ ] Dolby Atmos 7.1.4 mixing with binaural monitoring
- [ ] macOS Audio Unit (AU) hosting
- [ ] Video scoring and synchronization
- [ ] Score view with traditional notation
- [ ] Live performance mode (clip launching, scene triggering)
- [ ] Python plugin API and scripting

### Advanced AI
- [ ] AI co-producer: Real-time arrangement suggestions from context
- [ ] Generative sound design: text-to-synth-patch, text-to-sample
- [ ] Automatic mixing from raw multi-stem uploads
- [ ] Source separation: full de-mixing of any recording
- [ ] Vocal cloning with ethical consent verification
- [ ] Real-time neural effects (reverb, compression, EQ)

### Ecosystem
- [ ] Open plugin SDK for third-party Calliope plugins
- [ ] Sound content marketplace (sample packs, presets, vocal models)
- [ ] Community preset sharing platform
- [ ] Tutorial system with interactive lessons
- [ ] Educational edition for music production courses

### Platform
- [ ] iOS/Android companion app for remote recording and control
- [ ] Cloud rendering farm for AI inference offload
- [ ] Hardware integration (control surfaces, audio interfaces)
- [ ] VST3/AU plugin export from Calliope instrument presets
- [ ] Collaboration API for third-party integrations

## Non-Goals (Explicitly Out of Scope)

- Audio hardware driver development (we use standard ASIO/CoreAudio/WASAPI)
- DAW competition feature parity (we focus on AI-augmented workflow, not replacing every DAW feature)
- Built-in sample/preset market (we enable third-party marketplaces)
- Music notation engraving (basic score view, not Dorico-level)
- Video editing (basic video sync for scoring, not NLE)
