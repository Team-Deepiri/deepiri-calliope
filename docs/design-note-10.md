# Design Note 10 — Vocal Production Suite

## Neural Vocal Synthesis Roadmap

| Feature | Status | Target |
|---------|--------|--------|
| Text-to-speech synthesis | Beta | Current |
| Singing voice synthesis (SVS) | Beta | Current |
| Voice model training | Planning | Q3 2026 |
| Real-time voice conversion | Planning | Q4 2026 |
| Multi-language support | Research | 2027 |
| Emotion/expression control | Research | 2027 |

### Current Implementation
- **AIVocalSynthesizer**: Text-driven singing synthesis with MIDI-compatible phoneme timing. Accepts lyrics string and (note, start, duration) tuples. Outputs raw vocal waveform.
- **NeuralVocalEngine**: Post-processing engine with:
  - Neural auto-tune (formant-preserving pitch correction)
  - Vocal doubling (wide, centered, layered modes)
  - Timbre shaping (brightness, breathiness, pressure)
  - Prosody modulation (dynamics, vibrato, glide)

## Voice Unit DSP Chain (16-Stage Chain)

The vocal processing chain processes audio through 16 configurable DSP stages:

```
1.  Pre-gain trim
2.  De-esser (frequency-dependent compressor)
3.  Gate (noise gate with hysteresis)
4.  EQ (4-band parametric)
5.  Compressor (vocal-optimized: fast attack, soft knee)
6.  Multiband compressor (3-band: low, mid, high)
7.  Saturation (tube/tape emulation)
8.  Harmonic exciter
9.  De-esser (post-compression cleanup)
10. Limiter (brickwall)
11. Reverb (convolution + algorithmic)
12. Delay (ping-pong, tempo-synced)
13. Chorus/Flanger
14. Doubler (detuned parallel voice)
15. EQ (final corrective)
16. Post-gain trim
```

Each stage has wet/dry mix control and bypass. Presets can store and recall complete chain configurations.

## Vocal Comping and Tuning Workflow

### Comping Workflow
1. Record multiple takes (automatic lane creation)
2. Select best sections per lane via click-and-select
3. Automatic crossfade creation at splice points
4. Render comp to consolidated vocal track
5. Preserve original takes for re-comping

### Tuning Workflow
1. **Pitch detection**: Monophonic pitch tracking via autocorrelation + spectral methods
2. **Note segmentation**: Detect note boundaries from pitch and amplitude
3. **Correction modes**:
   - **Automatic**: Snap to nearest scale note with configurable retune speed
   - **Manual**: Draw pitch curve correction in editor
   - **Formant shift**: Preserve formants during pitch correction
4. **Vibrato editing**: Add/modify/remove vibrato depth, rate, and shape
5. **Timing correction**: Quantize note onsets to grid with configurable strength

### Tuning GUI
- Pitch contour display (fundamental frequency over time)
- Note segmentation overlay with detected note labels
- Target scale visualization
- Correction curve (original vs corrected)
- Per-note editing: pitch, onset, duration, vibrato
- Formant and timbre adjustment per segment
