# Design Note 05 — MIDI & Sequencing

## MIDI Engine Architecture

The MIDI engine processes incoming and sequencer-generated MIDI events through a multi-stage pipeline:

```
MIDI Input -> MIDI FX (per-track chain) -> Sequencer -> Instrument -> Audio Output
```

The engine uses sample-accurate event timing. All MIDI events are timestamped with their exact sample position within the audio buffer.

### Event Types
- **Note On/Off**: Pitch (0-127), Velocity (0-127), Channel (1-16)
- **Continuous Controller (CC)**: 128 controllers per channel, 0-127 range
- **Pitch Bend**: 14-bit resolution (-8192 to +8191)
- **Channel Aftertouch**: Single value per channel
- **Polyphonic Aftertouch**: Per-note pressure value
- **Program Change**: 128 programs per bank
- **MIDI Clock**: 24 pulses per quarter note for sync
- **MIDI Time Code (MTC)**: SMPTE-based positional reference

## Piano Roll Features

The piano roll is the primary editor for MIDI clips.

### Note Editing
- **Drag to create/move/resize**: Notes snap to current grid setting
- **Velocity strip**: Visual velocity editing per note or multi-select
- **CC lanes**: Expandable lanes for any CC number, drawn with breakpoint automation
- **Aftertouch editing**: Polyphonic aftertouch per-note editing via secondary curve
- **Note scaling**: Alt-drag from note edges for time-stretch
- **Legato tool**: Auto-extend/reduce notes to touch adjacent notes
- **Paint tool**: Click-and-drag to paint note patterns

### Visualization
- Key labels with scale highlighting
- Note velocity color mapping (cold-to-hot gradient)
- MIDI clip overview/minimap
- Ghost notes from other clips/tracks

## MIDI FX

MIDI FX process incoming MIDI data before it reaches the instrument. They are chained per-track.

### Arpeggiator
- Modes: Up, Down, Up/Down, Random, Chord, As Played
- Rate: Note divisions (1/1 to 1/64, triplet, dotted)
- Octave range: 1-8 octaves
- Pattern: Custom step sequencer for gate/velocity
- Swing: 0-100% shuffle feel

### Chord Generator
- Input single note -> output full chord (major, minor, 7th, sus, etc.)
- Intelligent voicing based on current scale/key
- Inversion control
- Spread voicing across multiple octaves

### Scale Mapper
- Map any input note to nearest note in selected scale
- Custom scale editor (user-defined intervals)
- Root note transposition
- Pass-through range limiting

### Additional MIDI FX
- Velocity processor (scale, randomize, humanize)
- MIDI delay/echo (with feedback and decay)
- Note repeater (stutter effect)
- Transposer (interval-based or scale-based)
