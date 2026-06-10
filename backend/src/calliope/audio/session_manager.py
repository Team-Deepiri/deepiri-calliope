"""Session save/load functionality for projects."""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from dataclasses import dataclass, asdict, field

from calliope.config import get_settings


RECENT_PROJECTS_FILE = "recent_projects.json"
MAX_RECENT_PROJECTS = 20


@dataclass
class VocalRackState:
    enabled: bool = True
    hpf: bool = True
    hpf_freq: float = 0.1
    de_ess: bool = True
    de_ess_threshold: float = 0.5
    compress: bool = True
    comp_threshold: float = 0.4
    comp_ratio: float = 0.5
    comp_attack: float = 0.3
    comp_release: float = 0.5
    eq: bool = True
    eq_low: float = 0.5
    eq_mid: float = 0.5
    eq_high: float = 0.5
    de_reverb: bool = True
    reverb_type: str = "plate"
    reverb_size: float = 0.5
    reverb_damping: float = 0.5
    reverb_mix: float = 0.25
    formant: bool = False
    formant_shift: float = 0.0
    formant_preserve: float = 0.5
    tune: bool = False
    tune_speed: float = 0.5
    tune_scale: str = "major"
    pitch_shift: float = 0.0


@dataclass
class PluginChainState:
    id: str
    plugin_name: str
    enabled: bool
    mix: float
    parameters: dict[str, float]


@dataclass
class ClipState:
    id: str
    name: str
    clip_type: Literal["audio", "midi", "automation"]
    start_bar: float
    duration_bars: float
    start_offset: float = 0.0
    gain: float = 0.0
    muted: bool = False
    color: str = "#8b5cf6"
    source_id: str = ""
    pitch_shift: int = 0
    time_stretch: float = 1.0
    fade_in: float = 0.0
    fade_out: float = 0.0


@dataclass
class AutomationPoint:
    position_bars: float
    value: float
    interpolation: Literal["step", "linear", "bezier"] = "linear"


@dataclass
class AutomationLane:
    id: str
    target_param: str
    points: list[AutomationPoint] = field(default_factory=list)
    armed: bool = False
    min: float = 0.0
    max: float = 1.0


@dataclass
class TrackState:
    id: str
    name: str
    track_type: Literal["audio", "midi", "group", "instrument"]
    volume: float = 0.0
    pan: float = 0.0
    muted: bool = False
    solo: bool = False
    armed: bool = False
    automation_armed: bool = False
    group_id: str | None = None
    group_expanded: bool = True
    plugin_chain: list[PluginChainState] = field(default_factory=list)
    clips: list[ClipState] = field(default_factory=list)
    automation_lanes: list[AutomationLane] = field(default_factory=list)
    routing_id: str | None = None
    color: str = "#8b5cf6"
    height: int = 80


@dataclass
class ArrangementMarker:
    id: str
    name: str
    bar: float
    color: str = "#8b5cf6"


@dataclass
class AudioGraphState:
    nodes: dict[str, dict] = field(default_factory=dict)
    edges: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class StudioSession:
    id: str
    name: str
    created_at: str
    updated_at: str
    bpm: int
    key: str
    vocal_rack: VocalRackState
    plugin_chain: list[PluginChainState]
    autotune_config: dict
    recordings: list[str]
    audio_clips: list[str]
    prompt: str
    generation_settings: dict
    tracks: list[TrackState] = field(default_factory=list)
    graph: AudioGraphState = field(default_factory=AudioGraphState)
    arrangement_markers: list[ArrangementMarker] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    description: str = ""


PROJECT_TEMPLATES: dict[str, dict[str, Any]] = {
    "empty": {
        "name": "Empty Project",
        "description": "Start from scratch with a blank canvas",
        "bpm": 120,
        "key": "C",
        "tracks": [],
    },
    "vocal_track": {
        "name": "Vocal Track",
        "description": "Pre-configured vocal production session",
        "bpm": 120,
        "key": "C",
        "tracks": [
            {"name": "Beat", "track_type": "audio", "color": "#8b5cf6", "volume": -6.0},
            {"name": "Bass", "track_type": "instrument", "color": "#ef4444", "volume": -8.0},
            {"name": "Vocals", "track_type": "audio", "color": "#10b981", "volume": -3.0, "armed": True},
            {"name": "Harmony", "track_type": "audio", "color": "#3b82f6", "volume": -9.0},
        ],
    },
    "full_band": {
        "name": "Full Band",
        "description": "Full band template with drums, bass, guitars, keys, and vocals",
        "bpm": 120,
        "key": "C",
        "tracks": [
            {"name": "Drums", "track_type": "audio", "color": "#8b5cf6", "volume": -6.0},
            {"name": "Percussion", "track_type": "audio", "color": "#a78bfa", "volume": -10.0},
            {"name": "Bass", "track_type": "instrument", "color": "#ef4444", "volume": -6.0},
            {"name": "Rhythm Guitar", "track_type": "audio", "color": "#3b82f6", "volume": -8.0},
            {"name": "Lead Guitar", "track_type": "audio", "color": "#60a5fa", "volume": -10.0},
            {"name": "Keys", "track_type": "instrument", "color": "#f59e0b", "volume": -10.0},
            {"name": "Lead Vocal", "track_type": "audio", "color": "#10b981", "volume": -4.0, "armed": True},
            {"name": "Backing Vocals", "track_type": "audio", "color": "#34d399", "volume": -12.0},
        ],
    },
    "edm": {
        "name": "EDM",
        "description": "Electronic dance music template with synths, drums, and bass",
        "bpm": 128,
        "key": "F",
        "tracks": [
            {"name": "Kick", "track_type": "audio", "color": "#ef4444", "volume": -4.0},
            {"name": "Clap/Snare", "track_type": "audio", "color": "#f97316", "volume": -8.0},
            {"name": "Hi-Hats", "track_type": "audio", "color": "#eab308", "volume": -14.0},
            {"name": "Percussion", "track_type": "audio", "color": "#a78bfa", "volume": -12.0},
            {"name": "Sub Bass", "track_type": "instrument", "color": "#ef4444", "volume": -5.0},
            {"name": "Lead Synth", "track_type": "instrument", "color": "#3b82f6", "volume": -8.0},
            {"name": "Pad", "track_type": "instrument", "color": "#8b5cf6", "volume": -12.0},
            {"name": "FX", "track_type": "audio", "color": "#06b6d4", "volume": -16.0},
            {"name": "Vocal Chop", "track_type": "audio", "color": "#10b981", "volume": -10.0},
        ],
    },
    "lo-fi": {
        "name": "Lo-Fi",
        "description": "Lo-fi hip hop template with warm, vintage vibes",
        "bpm": 85,
        "key": "G",
        "tracks": [
            {"name": "Drums", "track_type": "audio", "color": "#8b5cf6", "volume": -8.0},
            {"name": "Bass", "track_type": "instrument", "color": "#ef4444", "volume": -8.0},
            {"name": "Keys", "track_type": "instrument", "color": "#f59e0b", "volume": -10.0},
            {"name": "Guitar", "track_type": "audio", "color": "#3b82f6", "volume": -12.0},
            {"name": "FX/Samples", "track_type": "audio", "color": "#06b6d4", "volume": -14.0},
        ],
    },
    "hip-hop": {
        "name": "Hip Hop",
        "description": "Hip hop / trap production template",
        "bpm": 140,
        "key": "C",
        "tracks": [
            {"name": "Kick", "track_type": "audio", "color": "#ef4444", "volume": -4.0},
            {"name": "Snare", "track_type": "audio", "color": "#f97316", "volume": -6.0},
            {"name": "Hi-Hats", "track_type": "audio", "color": "#eab308", "volume": -12.0},
            {"name": "808 Bass", "track_type": "instrument", "color": "#ef4444", "volume": -3.0},
            {"name": "Melody", "track_type": "instrument", "color": "#3b82f6", "volume": -8.0},
            {"name": "Pad", "track_type": "instrument", "color": "#8b5cf6", "volume": -14.0},
            {"name": "Lead Vocal", "track_type": "audio", "color": "#10b981", "volume": -3.0, "armed": True},
        ],
    },
}


class SessionManager:
    """Manages project sessions with save/load functionality."""

    def __init__(self):
        self._settings = get_settings()
        self._sessions_dir = self._settings.data_path / "sessions"
        self._projects_dir = self._settings.data_path / "projects"
        self._sessions_dir.mkdir(parents=True, exist_ok=True)
        self._projects_dir.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, StudioSession] = {}
        self._load_all_sessions()

    def _recent_projects_path(self) -> Path:
        return self._sessions_dir / RECENT_PROJECTS_FILE

    def _load_recent_projects(self) -> list[dict]:
        path = self._recent_projects_path()
        if path.exists():
            try:
                with open(path, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_recent_projects(self, projects: list[dict]) -> None:
        path = self._recent_projects_path()
        with open(path, "w") as f:
            json.dump(projects, f, indent=2)

    def _touch_recent(self, session_id: str) -> None:
        recent = self._load_recent_projects()
        recent = [p for p in recent if p["id"] != session_id]
        session = self._sessions.get(session_id)
        if session:
            recent.insert(0, {
                "id": session.id,
                "name": session.name,
                "bpm": session.bpm,
                "key": session.key,
                "track_count": len(session.tracks),
                "updated_at": session.updated_at,
            })
            recent = recent[:MAX_RECENT_PROJECTS]
            self._save_recent_projects(recent)

    def list_recent_projects(self, limit: int = 10) -> list[dict]:
        return self._load_recent_projects()[:limit]

    def _project_file_path(self, session_id: str) -> Path:
        return self._projects_dir / f"{session_id}.calliope"

    def _load_all_sessions(self) -> None:
        for file in list(self._sessions_dir.glob("*.json")) + list(self._projects_dir.glob("*.calliope")):
            try:
                with open(file, "r") as f:
                    data = json.load(f)
                    if "bpm" not in data:
                        continue
                    session = self._deserialize_session(data)
                    self._sessions[session.id] = session
            except Exception:
                pass

    def _serialize_session(self, session: StudioSession) -> dict:
        return {
            "format": "calliope-project",
            "version": 1,
            "id": session.id,
            "name": session.name,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "bpm": session.bpm,
            "key": session.key,
            "description": session.description,
            "tags": session.tags,
            "vocal_rack": asdict(session.vocal_rack),
            "plugin_chain": [asdict(p) for p in session.plugin_chain],
            "autotune_config": session.autotune_config,
            "recordings": session.recordings,
            "audio_clips": session.audio_clips,
            "prompt": session.prompt,
            "generation_settings": session.generation_settings,
            "tracks": [self._serialize_track(t) for t in session.tracks],
            "graph": asdict(session.graph),
            "arrangement_markers": [asdict(m) for m in session.arrangement_markers],
        }

    def _serialize_track(self, track: TrackState) -> dict:
        return {
            "id": track.id,
            "name": track.name,
            "track_type": track.track_type,
            "volume": track.volume,
            "pan": track.pan,
            "muted": track.muted,
            "solo": track.solo,
            "armed": track.armed,
            "automation_armed": track.automation_armed,
            "group_id": track.group_id,
            "group_expanded": track.group_expanded,
            "color": track.color,
            "height": track.height,
            "routing_id": track.routing_id,
            "plugin_chain": [asdict(p) for p in track.plugin_chain],
            "clips": [asdict(c) for c in track.clips],
            "automation_lanes": [
                {
                    "id": lane.id,
                    "target_param": lane.target_param,
                    "armed": lane.armed,
                    "min": lane.min,
                    "max": lane.max,
                    "points": [asdict(p) for p in lane.points],
                }
                for lane in track.automation_lanes
            ],
        }

    def _deserialize_session(self, data: dict) -> StudioSession:
        v = data.get("vocal_rack", {})
        if isinstance(v, dict):
            vocal_rack = VocalRackState(**v)
        else:
            vocal_rack = v

        return StudioSession(
            id=data["id"],
            name=data.get("name", "Untitled"),
            created_at=data.get("created_at", datetime.utcnow().isoformat()),
            updated_at=data.get("updated_at", datetime.utcnow().isoformat()),
            bpm=data.get("bpm", 120),
            key=data.get("key", "C"),
            description=data.get("description", ""),
            tags=data.get("tags", []),
            vocal_rack=vocal_rack,
            plugin_chain=[PluginChainState(**p) for p in data.get("plugin_chain", [])],
            autotune_config=data.get("autotune_config", {}),
            recordings=data.get("recordings", []),
            audio_clips=data.get("audio_clips", []),
            prompt=data.get("prompt", ""),
            generation_settings=data.get("generation_settings", {}),
            tracks=[self._deserialize_track(t) for t in data.get("tracks", [])],
            graph=AudioGraphState(**data.get("graph", {})),
            arrangement_markers=[ArrangementMarker(**m) for m in data.get("arrangement_markers", [])],
        )

    def _deserialize_track(self, data: dict) -> TrackState:
        clips = [ClipState(**c) for c in data.get("clips", [])]
        lanes = [
            AutomationLane(
                id=l["id"],
                target_param=l["target_param"],
                armed=l.get("armed", False),
                min=l.get("min", 0.0),
                max=l.get("max", 1.0),
                points=[AutomationPoint(**p) for p in l.get("points", [])],
            )
            for l in data.get("automation_lanes", [])
        ]
        return TrackState(
            id=data["id"],
            name=data.get("name", "Track"),
            track_type=data.get("track_type", "audio"),
            volume=data.get("volume", 0.0),
            pan=data.get("pan", 0.0),
            muted=data.get("muted", False),
            solo=data.get("solo", False),
            armed=data.get("armed", False),
            automation_armed=data.get("automation_armed", False),
            group_id=data.get("group_id"),
            group_expanded=data.get("group_expanded", True),
            color=data.get("color", "#8b5cf6"),
            height=data.get("height", 80),
            routing_id=data.get("routing_id"),
            plugin_chain=[PluginChainState(**p) for p in data.get("plugin_chain", [])],
            clips=clips,
            automation_lanes=lanes,
        )

    def _save_session(self, session: StudioSession) -> None:
        file_path = self._sessions_dir / f"{session.id}.json"
        with open(file_path, "w") as f:
            json.dump(asdict(session), f, indent=2)

    def save(self, session_id: str) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.updated_at = datetime.utcnow().isoformat()
        file_path = self._project_file_path(session_id)
        data = self._serialize_session(session)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        self._save_session(session)
        self._touch_recent(session_id)
        return session

    def load(self, session_id: str) -> StudioSession | None:
        file_path = self._project_file_path(session_id)
        if not file_path.exists():
            file_path = self._sessions_dir / f"{session_id}.json"
            if not file_path.exists():
                return None
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
            session = self._deserialize_session(data)
            self._sessions[session.id] = session
            self._touch_recent(session_id)
            return session
        except Exception:
            return None

    def create_session(
        self,
        name: str = "Untitled Session",
        bpm: int = 120,
        key: str = "C",
        template_name: str | None = None,
    ) -> StudioSession:
        now = datetime.utcnow().isoformat()

        if template_name and template_name in PROJECT_TEMPLATES:
            tmpl = PROJECT_TEMPLATES[template_name]
            bpm = tmpl.get("bpm", bpm)
            key = tmpl.get("key", key)
            track_data = tmpl.get("tracks", [])
        else:
            track_data = []

        session = StudioSession(
            id=str(uuid.uuid4()),
            name=name,
            created_at=now,
            updated_at=now,
            bpm=bpm,
            key=key,
            description=tmpl.get("description", "") if template_name else "",
            tags=[template_name] if template_name else [],
            vocal_rack=VocalRackState(
                enabled=True, hpf=True, hpf_freq=0.1, de_ess=True, de_ess_threshold=0.5,
                compress=True, comp_threshold=0.4, comp_ratio=0.5, comp_attack=0.3, comp_release=0.5,
                eq=True, eq_low=0.5, eq_mid=0.5, eq_high=0.5,
                de_reverb=True, reverb_type="plate", reverb_size=0.5, reverb_damping=0.5, reverb_mix=0.25,
                formant=False, formant_shift=0.0, formant_preserve=0.5,
                tune=False, tune_speed=0.5, tune_scale="major",
                pitch_shift=0.0,
            ),
            plugin_chain=[],
            autotune_config={"mode": "auto", "scale_type": "major", "root_midi": 60, "strength": 1.0, "speed": 0.5},
            recordings=[],
            audio_clips=[],
            prompt="",
            generation_settings={"provider": "auto", "depth": "standard"},
            tracks=[
                TrackState(
                    id=str(uuid.uuid4()),
                    name=t.get("name", "Track"),
                    track_type=t.get("track_type", "audio"),
                    volume=t.get("volume", 0.0),
                    pan=t.get("pan", 0.0),
                    muted=t.get("muted", False),
                    solo=t.get("solo", False),
                    armed=t.get("armed", False),
                    color=t.get("color", "#8b5cf6"),
                )
                for t in track_data
            ],
        )
        self._sessions[session.id] = session
        self._save_session(session)
        self._touch_recent(session.id)
        return session

    def list_templates(self) -> list[dict]:
        return [
            {"name": key, "label": tmpl["name"], "description": tmpl["description"], "bpm": tmpl["bpm"], "key": tmpl["key"], "track_count": len(tmpl["tracks"])}
            for key, tmpl in PROJECT_TEMPLATES.items()
        ]

    def get_session(self, session_id: str) -> StudioSession | None:
        return self._sessions.get(session_id)

    def list_sessions(self, search: str | None = None) -> list[StudioSession]:
        sessions = list(self._sessions.values())
        if search:
            search_lower = search.lower()
            sessions = [s for s in sessions if search_lower in s.name.lower()]
        return sorted(sessions, key=lambda s: s.updated_at, reverse=True)

    def update_session(self, session_id: str, updates: dict) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None

        for key, value in updates.items():
            if hasattr(session, key):
                setattr(session, key, value)

        session.updated_at = datetime.utcnow().isoformat()
        self._save_session(session)
        self._touch_recent(session_id)
        return session

    def update_vocal_rack(self, session_id: str, vocal_rack: dict) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None

        session.vocal_rack = VocalRackState(**vocal_rack)
        session.updated_at = datetime.utcnow().isoformat()
        self._save_session(session)
        return session

    def update_plugin_chain(self, session_id: str, chain: list[dict]) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None

        session.plugin_chain = [PluginChainState(**p) for p in chain]
        session.updated_at = datetime.utcnow().isoformat()
        self._save_session(session)
        return session

    def add_recording(self, session_id: str, recording_id: str) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None

        if recording_id not in session.recordings:
            session.recordings.append(recording_id)
            session.updated_at = datetime.utcnow().isoformat()
            self._save_session(session)
        return session

    def add_audio_clip(self, session_id: str, clip_id: str) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None

        if clip_id not in session.audio_clips:
            session.audio_clips.append(clip_id)
            session.updated_at = datetime.utcnow().isoformat()
            self._save_session(session)
        return session

    def add_track(self, session_id: str, track: TrackState) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.tracks.append(track)
        session.updated_at = datetime.utcnow().isoformat()
        self._save_session(session)
        return session

    def remove_track(self, session_id: str, track_id: str) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.tracks = [t for t in session.tracks if t.id != track_id]
        session.updated_at = datetime.utcnow().isoformat()
        self._save_session(session)
        return session

    def freeze_track(self, session_id: str, track_id: str) -> StudioSession | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        track = next((t for t in session.tracks if t.id == track_id), None)
        if not track:
            return None
        track.track_type = "audio"
        track.plugin_chain = []
        track.automation_lanes = []
        session.updated_at = datetime.utcnow().isoformat()
        self._save_session(session)
        return session

    def duplicate_session(self, session_id: str, new_name: str | None = None) -> StudioSession | None:
        original = self._sessions.get(session_id)
        if not original:
            return None

        now = datetime.utcnow().isoformat()
        duplicate = StudioSession(
            id=str(uuid.uuid4()),
            name=new_name or f"{original.name} (Copy)",
            created_at=now,
            updated_at=now,
            bpm=original.bpm,
            key=original.key,
            description=original.description,
            tags=original.tags.copy(),
            vocal_rack=original.vocal_rack,
            plugin_chain=original.plugin_chain,
            autotune_config=original.autotune_config.copy(),
            recordings=original.recordings.copy(),
            audio_clips=original.audio_clips.copy(),
            prompt=original.prompt,
            generation_settings=original.generation_settings.copy(),
            tracks=[self._deserialize_track(self._serialize_track(t)) for t in original.tracks],
            graph=original.graph,
            arrangement_markers=original.arrangement_markers.copy(),
        )
        self._sessions[duplicate.id] = duplicate
        self._save_session(duplicate)
        self._touch_recent(duplicate.id)
        return duplicate

    def delete_session(self, session_id: str) -> bool:
        if session_id in self._sessions:
            for pattern in [f"{session_id}.json", f"{session_id}.calliope"]:
                for directory in [self._sessions_dir, self._projects_dir]:
                    file_path = directory / pattern
                    if file_path.exists():
                        file_path.unlink()
            del self._sessions[session_id]
            recent = self._load_recent_projects()
            recent = [p for p in recent if p["id"] != session_id]
            self._save_recent_projects(recent)
            return True
        return False

    def export_session(self, session_id: str) -> dict | None:
        session = self._sessions.get(session_id)
        if session:
            return self._serialize_session(session)
        return None

    def export_stems(self, session_id: str) -> dict | None:
        session = self._sessions.get(session_id)
        if not session:
            return None
        return {
            "session_id": session.id,
            "session_name": session.name,
            "stems": [
                {
                    "track_id": t.id,
                    "track_name": t.name,
                    "track_type": t.track_type,
                    "clip_count": len(t.clips),
                }
                for t in session.tracks
            ],
        }

    def import_session(self, data: dict) -> StudioSession:
        if "version" in data:
            data["id"] = str(uuid.uuid4())
            session = self._deserialize_session(data)
        else:
            data["id"] = str(uuid.uuid4())
            session = StudioSession(**data)
        self._sessions[session.id] = session
        self._save_session(session)
        self._touch_recent(session.id)
        return session


_session_manager: SessionManager | None = None


def get_session_manager() -> SessionManager:
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager
