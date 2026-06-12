# Design Note 06 — Sampling & Audio Editing

## Sample Browser and Management

The sample browser provides file system navigation, preview, and import capabilities.

### Database Index
- Scans configured sample directories recursively
- Indexes: file path, format, duration, sample rate, bit depth, channels, BPM (detected), key (detected), tags
- Search: Full-text search on filename and tags, filter by format/duration/BPM/key
- Watches: File system watcher for automatic re-indexing

### Preview
- Click-to-preview with adjustable volume
- Sync preview to project tempo (auto time-stretch)
- Preview in context (with current project playing)

### Import Workflow
1. Drag from browser or use file dialog
2. Optional: apply normalization, fade, trim on import
3. Choose import destination (new track, existing clip, sampler)
4. Import options: copy to project directory or reference in-place

## Audio Clip Editing

### Slicing
Slice audio clips at:
- Transient positions (onset detection)
- Beat/grid positions (BPM-aware)
- Manual slice tool (click to add slice)
- Equal divisions (by count or time)

Slices can be:
- Moved independently on timeline
- Triggered as individual hit points
- Converted to sampler regions

### Time-Stretching
Algorithms (selectable per clip):
- **Elastique Pro** (licensed): Highest quality, all modes
- **Rubber Band Library**: Open-source, good quality
- **WSOLA**: Low CPU, real-time safe
- **Phase Vocoder**: Best for monophonic/pitched material

Modes: Tempo-matching (preserve pitch), Pitch-shift (preserve tempo), both.

### Pitch-Shifting
- Semitone stepping (+/- 24 semitones)
- Cent fine-tuning (+/- 100 cents)
- Formant preservation for vocal material
- High-quality mode (offline), draft mode (real-time)

### Fades and Crossfades
- Fade-in/out per clip edge
- Equal power, equal gain, and logarithmic curve shapes
- Crossfade between overlapping clips on same track

## Comping System for Vocal Takes

The comping system manages multiple takes on a single track:
1. **Take lane**: Each recording pass creates a new take lane
2. **Comp sections**: User selects best sections from each lane
3. **Crossfades**: Automatic crossfades at comp splice points
4. **Comp history**: Previous comps preserved as comp groups

Workflow:
1. Record multiple takes (auto-incrementing lane creation)
2. Play through and click to select sections per lane
3. Fine-tune splice points with crossfade editing
4. Render comp to single audio clip or keep as active comp group
