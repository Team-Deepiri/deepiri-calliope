"""Session save/load functionality for projects."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from dataclasses import dataclass, asdict

from calliope.config import get_settings


@dataclass
class PluginChainState:
    id: str
    plugin_name: str
    enabled: bool
    mix: float
    parameters: dict[str, float]


@dataclass
class VocalRackState:
    enabled: bool
    hpf: bool
    hpf_freq: float
    de_ess: bool
    de_ess_threshold: float
    compress: bool
    comp_threshold: float
    comp_ratio: float
    comp_attack: float
    comp_release: float
    eq: bool
    eq_low: float
    eq_mid: float
    eq_high: float
    de_reverb: bool
    reverb_type: str
    reverb_size: float
    reverb_damping: float
    reverb_mix: float
    formant: bool
    formant_shift: float
    formant_preserve: float
    tune: bool
    tune_speed: float
    tune_scale: str
    pitch_shift: float


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


class SessionManager:
    """Manages project sessions with save/load functionality."""

    def __init__(self):
        self._settings = get_settings()
        self._sessions_dir = self._settings.data_path / "sessions"
        self._sessions_dir.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, StudioSession] = {}
        self._load_all_sessions()

    def _load_all_sessions(self) -> None:
        for file in self._sessions_dir.glob("*.json"):
            try:
                with open(file, "r") as f:
                    data = json.load(f)
                    session = StudioSession(**data)
                    self._sessions[session.id] = session
            except Exception:
                pass

    def _save_session(self, session: StudioSession) -> None:
        file_path = self._sessions_dir / f"{session.id}.json"
        with open(file_path, "w") as f:
            json.dump(asdict(session), f, indent=2)

    def create_session(
        self,
        name: str = "Untitled Session",
        bpm: int = 120,
        key: str = "C",
    ) -> StudioSession:
        now = datetime.utcnow().isoformat()
        session = StudioSession(
            id=str(uuid.uuid4()),
            name=name,
            created_at=now,
            updated_at=now,
            bpm=bpm,
            key=key,
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
        )
        self._sessions[session.id] = session
        self._save_session(session)
        return session

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
            vocal_rack=original.vocal_rack,
            plugin_chain=original.plugin_chain,
            autotune_config=original.autotune_config.copy(),
            recordings=original.recordings.copy(),
            audio_clips=original.audio_clips.copy(),
            prompt=original.prompt,
            generation_settings=original.generation_settings.copy(),
        )
        self._sessions[duplicate.id] = duplicate
        self._save_session(duplicate)
        return duplicate

    def delete_session(self, session_id: str) -> bool:
        if session_id in self._sessions:
            file_path = self._sessions_dir / f"{session_id}.json"
            if file_path.exists():
                file_path.unlink()
            del self._sessions[session_id]
            return True
        return False

    def export_session(self, session_id: str) -> dict | None:
        session = self._sessions.get(session_id)
        if session:
            return asdict(session)
        return None

    def import_session(self, data: dict) -> StudioSession:
        data["id"] = str(uuid.uuid4())
        session = StudioSession(**data)
        self._sessions[session.id] = session
        self._save_session(session)
        return session


_session_manager: SessionManager | None = None


def get_session_manager() -> SessionManager:
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager