# Design Note 09 — Project Management & Collaboration

## Project File Format (.calliope)

The .calliope project file is a JSON-based archive containing all project metadata, routing, and references to media files.

### File Structure
```
project.calliope/  (directory or single .zip)
├── project.json         # Project metadata, settings, references
├── audio/               # Project-local audio files
│   ├── recordings/
│   ├── samples/
│   └── exports/
├── midi/                # Exported MIDI files
└── cache/               # Transient processing cache
```

### project.json Schema
```json
{
  "version": "0.1.0",
  "metadata": {
    "name": "My Track",
    "author": "",
    "created_at": "ISO8601",
    "bpm": 128,
    "time_signature": "4/4",
    "key": "C",
    "scale": "minor"
  },
  "tracks": [...],
  "clips": [...],
  "mixer": {
    "channels": [...],
    "buses": [...],
    "vca_groups": [...],
    "sends": [...],
    "routing": [...]
  },
  "automation": [...],
  "modulation": [...],
  "plugins": [...],
  "generation_settings": {...}
}
```

Media file references are stored as relative paths within the project directory. Absolute paths are also supported but discouraged for portability.

## Version History and Snapshots

Snapshots are point-in-time copies of project.json plus changed media files.

### Auto-Save
- Periodic auto-save every 60 seconds (configurable)
- On significant events (close, transport stop, render complete)
- Limited to last N versions (default 20, configurable)

### Manual Snapshots
- Named checkpoints for major milestones
- Optional before destructive operations (clear arrangement, reset mix)
- Locked (non-prunable) to prevent auto-cleanup

### Version Browser
- Timeline view of all snapshots
- Side-by-side comparison (project.json diff)
- Restore to any point with full undo history

## Collaboration Features (Multi-User, Cloud Sync)

### Cloud Sync Architecture
```
Local Project <-> Sync Engine <-> Cloud Storage (S3/S3-compatible) <-> Remote User
```

- Real-time track-level locking
- Conflict resolution via CRDT (Conflict-free Replicated Data Types) for automation and clip data
- Changeset-based sync (send only deltas, not full file)

### User Roles
- **Owner**: Full access, can delete project, manage collaborators
- **Editor**: Can modify all project content
- **Contributor**: Can modify assigned tracks only
- **Viewer**: Read-only access

### Collaboration Workflow
1. Open project from cloud or create new
2. Lock tracks/regions for exclusive editing
3. Changes propagate in real-time to other collaborators
4. Merge/rebase for offline edits on reconnection
5. Comments and annotations on timeline positions

### Sharing
- Share via link with access level
- Public/private project settings
- Embeddable player with mixdown
- Collaborative mix review with A/B compare
