# Design Note 08 — Mixing & Mastering AI

## AI-Assisted Mixing (Genre-Aware Presets)

The AIMixEngine provides genre-aware mixing presets that adjust processing parameters based on musical style.

### Preset System
Each genre preset defines target values for:
- **LUFS target**: Loudness normalization target (-8 to -16 LUFS depending on genre)
- **EQ curve**: Genre-specific frequency balance targets (bass emphasis for EDM, vocal presence for pop, etc.)
- **Compression style**: Attack/release profiles suited to genre dynamics
- **Stereo width**: Genre-appropriate width (narrow for rock, wide for ambient)
- **Saturation amount**: Harmonic coloration (clean for classical, saturated for hip-hop)

Presets are applied as a starting point and can be overridden by specific parameters.

### Analysis-Driven Mixing
The engine first analyzes the input track for:
- Frequency balance (low/mid/high ratios)
- Dynamic range and crest factor
- Stereo correlation and width
- RMS and peak levels

Based on analysis, corrective processing is applied:
- Level correction to target LUFS
- EQ reshaping to match genre target curve
- Dynamic range compression/expansion
- Stereo field correction

## Reference Track Matching

Reference matching allows mastering a track to match the sonic characteristics of a reference recording.

### Extractable Reference Profile
For a reference track, the system analyzes:
1. **Tonal balance**: 1/3-octave spectrum, spectral centroid, spectral rolloff
2. **Loudness metrics**: Integrated LUFS, short-term LUFS, momentary LUFS, loudness range
3. **Dynamics**: Dynamic range, crest factor, RMS distribution
4. **Stereo image**: Correlation, width per frequency band, phase distribution
5. **Transient characteristics**: Transient density, transient-to-sustain ratio

### Matching Process
1. Analyze reference track to extract profile
2. Analyze target mix to determine current state
3. Calculate difference between reference and target for each metric
4. Apply corrective processing in stages:
   a. Level matching (gain to match LUFS)
   b. EQ matching (match spectral curve via multi-band EQ)
   c. Dynamics matching (compression/expansion to match DR)
   d. Stereo matching (width adjustment to match correlation profile)
5. Output mastered track with match quality metrics

## Automated Mastering with Loudness Standards

The mastering chain supports industry standards:

- **LUFS**: ITU-R BS.1770-4 compliant integrated loudness measurement
- **True Peak**: Oversampled (4x) true peak detection per BS.1770
- **Loudness Range (LRA)**: Dynamic range measurement for consistency

### Mastering Styles
| Style | Target LUFS | Compression | Limiter Ceiling | Saturation |
|-------|-------------|-------------|-----------------|------------|
| Loud | -11 LUFS | Heavy (0.5) | -0.5 dBTP | Moderate |
| Balanced | -14 LUFS | Moderate (0.4) | -0.3 dBTP | Light |
| Subtle | -16 LUFS | Light (0.2) | -0.2 dBTP | Minimal |

### Export Standards
- Streaming: -14 LUFS integrated, -1 dBTP (Spotify, Apple Music, YouTube)
- Broadcast: -23 LUFS (EBU R128, ATSC A/85)
- Podcast: -16 LUFS integrated, -1 dBTP
- CD: -9 to -12 LUFS, -0.1 dBTP
