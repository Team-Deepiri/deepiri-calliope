# Design Note 01 — Sequencing Engine Architecture

## Timeline Architecture

The Calliope sequencer uses a multi-track, clip-based, non-destructive timeline model. Each track contains an ordered list of audio or MIDI clips that reference underlying sample or note data without modifying it. The timeline is divided into bars, beats, ticks, and samples:

- **Bars**: Top-level musical measure, typically 4 beats each
- **Beats**: Quarter-note divisions at the current BPM
- **Ticks**: PPQN-based subdivision (960 ticks per quarter note default)
- **Samples**: Audio-level sample positions at the project sample rate

## Transport System

The transport engine manages playback state through a unified controller:

- **Play/Stop**: Global state with phase-accurate start/stop. Playback resumes from the playhead position.
- **Record**: Arm-enabled per-track recording. When engaged, incoming audio/MIDI is written to a new clip at the record arm position.
- **Loop**: Loop region defined by start/end markers. Looping is sample-accurate with no audible glitch at loop boundaries via crossfade.
- **Locators**: Named position markers for quick navigation and arrangement reference.

State machine transitions: Stopped -> Playing -> Paused -> Playing -> Stopped. Recording can be toggled during playback.

## Grid System

```
1 bar = 4 beats = 3840 ticks (at 960 PPQN) = (4 * 60 / BPM) seconds of audio
```

The grid serves three purposes:
1. **Snap-to-grid** for clip placement, note editing, and automation point positioning
2. **Beat-sync** for time-based effects (delays, LFOs, arpeggiator rates)
3. **Musical notation** for score view and music theory operations

Grid modes: bars, beats, sixteenths, thirty-seconds, triplets, sixty-fourths, and free (no snap).

## Clip Types

- **Audio Clip**: References a region of an audio file. Supports fade-in/out, gain envelope, time-stretch, and pitch-shift without altering the source file.
- **MIDI Clip**: Contains note events (pitch, velocity, start, duration) and continuous controller data. Editable in piano roll.
- **Automation Clip**: Breakpoint automation curves for any parameter. Can be linked to any clip or track parameter.

## Non-Destructive Editing

All edits are stored as parameter deltas relative to source media. The source files are never modified. This enables:
- Unlimited undo/redo via command stack
- Non-linear clip arrangement without data duplication
- Efficient project file storage
- Real-time preview of edits without commit
