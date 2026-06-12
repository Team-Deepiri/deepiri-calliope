# Design Note 04 — Mixer Architecture

## Channel Strip Design

Each mixer channel contains a linear DSP chain:

```
Input -> Trim -> Phase Invert -> Gate -> EQ -> Compressor -> Insert Slots -> Send Levels -> Fader -> Pan -> Output
```

### Channel Components
- **EQ**: 4-band parametric (low-shelf, peaking x2, high-shelf) with variable Q, frequency, and gain. Optional linear-phase mode.
- **Dynamics**: Compressor with threshold, ratio, attack, release, knee, gain makeup. Sidechain input.
- **Insert Slots**: 8 slots per channel, pre/post fader configurable per slot. Supports plugin chain.
- **Sends**: 8 stereo sends with pre/post fader switching per send. Each send routes to an FX bus.
- **Fader**: 64-bit float logarithmic fader with -inf to +12dB range.

## Bus/Group Routing

Buses are special mixer channels that combine multiple source channels:
- **Audio Buses**: Sum multiple tracks into a group for collective processing
- **FX Buses**: Return from send effects (reverb, delay, chorus)
- **Master Bus**: Final stereo output bus with master processing chain

Bus topology is fully flexible — any bus can feed into any other bus (direct acyclic graph, cycle detection enforced).

## VCA Groups

VCA (Voltage Controlled Amplifier) groups allow controlling the volume of multiple channels from a single fader without affecting their individual signal paths. Unlike buses, VCA groups do not sum audio — they only control gain staging.

- One channel can belong to multiple VCA groups (gain is multiplicative)
- VCA fader position is relative to the channel's own fader
- Mute groups: Muting a VCA mutes all assigned channels
- Solo groups: Soloing a VCA solos all assigned channels

## Surround/Atmos Roadmap

| Feature | Timeline |
|---------|----------|
| Stereo | Current |
| Quad (4.0) | Q4 2026 |
| 5.1 Surround | Q1 2027 |
| 7.1.4 Dolby Atmos | 2027 |
| Binaural monitoring | 2027 |

Plan: Audio engine uses channel-count-agnostic internal routing. Pan controls expand to multi-dimensional panners (VBAP, binaural) as channel count increases.
