# Design Note 03 — Automation & Modulation System

## Breakpoint Automation Curves

Automation data is stored as a series of breakpoints (time, value, curve_shape). Between breakpoints, the value is interpolated according to the curve shape:

- **Step**: Instant jump at next breakpoint
- **Linear**: Straight line between points
- **Log/Exp**: Logarithmic/exponential curves for natural parameter sweeps
- **S-Curve**: Smooth bezier-like transition (cubic hermite interpolation)
- **Hold**: Maintain value until next point, then jump

Automation lanes are per-parameter-per-track. Parameters include volume, pan, send levels, plugin parameters, and any exposed parameter in the modulation matrix.

## LFO Modulation Matrix

The modulation matrix allows any LFO to modulate any parameter with configurable depth, offset, and polarity.

### LFO Waveforms
- Sine, Triangle, Saw (up/down), Square, Random (sample & hold), Random (smooth)
- Phase offset, rate sync (free Hz or beat-synced divisions), symmetry control
- Bipolar/unipolar output mode

### Matrix Routing
```
Source (LFO 1-8) -> Amount -> Destination (any parameter)
```

Each routing has:
- Depth: 0-100% modulation amount
- Polarity: Unipolar (0 to +100%) or Bipolar (-100% to +100%)
- Offset: Shifts the modulation range
- Bypass: Enable/disable individual routing

## Parameter Modulation Routing

Audio-rate modulation is supported for effects requiring sample-accurate modulation (FM, AM, ring modulation, filter FM). These routings are compiled into the DSP graph at initialization time and processed as part of the audio callback.

## Sidechain Integration

Sidechain routing is handled at the track level:
1. **Source**: Any track or bus can be selected as sidechain source
2. **Detection**: Envelope follower with configurable attack/release
3. **Destination**: Compressors, gates, duckers, or any parameter via modulation matrix
4. **Filtering**: Optional high-pass/low-pass filter on sidechain input

Sidechain latency is compensated automatically (lookahead + PDC).
