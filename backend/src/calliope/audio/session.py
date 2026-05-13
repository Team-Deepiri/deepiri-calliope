"""Professional recording session with takes, tracks, and comping."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import uuid4


class TrackType(str, Enum):
    VOCAL = "vocal"
    INSTRUMENTAL = "instrumental"
    AUX_SEND = "aux"
    MASTER = "master"


class TakeStatus(str, Enum):
    INACTIVE = "inactive"
    RECORDING = "recording"
    COMPLETE = "complete"
    COMPOSITE = "composite"


@dataclass
class Take:
    id: str
    name: str
    filename: str
    duration_samples: int
    sample_rate: int
    status: TakeStatus = TakeStatus.COMPLETE
    recorded_at: datetime = field(default_factory=datetime.utcnow)
    regions: list[tuple[int, int]] = field(default_factory=list)
    color: str = "#FF6B6B"
    notes: str = ""
    peak_level: float = 0.0
    rms_level: float = -60.0


@dataclass
class Track:
    id: str
    name: str
    track_type: TrackType
    color: str
    volume: float = 1.0
    pan: float = 0.0
    muted: bool = False
    solo: bool = False
    armed: bool = False
    input_source: str = "mic_1"
    takes: list[Take] = field(default_factory=list)
    active_take_id: str | None = None
    fx_chain: list[dict] = field(default_factory=list)
    eq: dict | None = None
    compressor: dict | None = None


@dataclass
class RecordingSession:
    id: str
    name: str
    sample_rate: int = 48000
    bit_depth: int = 24
    bpm: float = 120.0
    time_signature: tuple[int, int] = (4, 4)
    created_at: datetime = field(default_factory=datetime.utcnow)
    tracks: list[Track] = field(default_factory=list)
    markers: list[dict] = field(default_factory=list)
    regions: list[dict] = field(default_factory=list)
    global_takes: list[Take] = field(default_factory=list)


class SessionManager:
    """
    Manages professional recording sessions with multiple tracks and takes.
    """

    def __init__(self):
        self._sessions: dict[str, RecordingSession] = {}
        self._current_session: RecordingSession | None = None
        self._current_take_id: str | None = None

    def create_session(
        self,
        name: str,
        sample_rate: int = 48000,
        bpm: float = 120.0,
    ) -> RecordingSession:
        """Create a new recording session."""
        session = RecordingSession(
            id=str(uuid4()),
            name=name,
            sample_rate=sample_rate,
            bpm=bpm,
        )
        self._sessions[session.id] = session
        self._current_session = session
        return session

    def load_session(self, session_id: str) -> RecordingSession | None:
        """Load an existing session."""
        session = self._sessions.get(session_id)
        if session:
            self._current_session = session
        return session

    def get_current_session(self) -> RecordingSession | None:
        """Get the currently active session."""
        return self._current_session

    def add_track(
        self,
        name: str,
        track_type: TrackType = TrackType.VOCAL,
        color: str = "#FF6B6B",
    ) -> Track:
        """Add a new track to the current session."""
        if not self._current_session:
            raise RuntimeError("No active session")

        track = Track(
            id=str(uuid4()),
            name=name,
            track_type=track_type,
            color=color,
        )
        self._current_session.tracks.append(track)
        return track

    def add_take(
        self,
        track_id: str,
        filename: str,
        duration_samples: int,
        name: str | None = None,
    ) -> Take:
        """Add a new take to a track."""
        if not self._current_session:
            raise RuntimeError("No active session")

        track = next((t for t in self._current_session.tracks if t.id == track_id), None)
        if not track:
            raise ValueError(f"Track not found: {track_id}")

        take = Take(
            id=str(uuid4()),
            name=name or f"Take {len(track.takes) + 1}",
            filename=filename,
            duration_samples=duration_samples,
            sample_rate=self._current_session.sample_rate,
        )
        track.takes.append(take)
        track.active_take_id = take.id
        return take

    def start_recording(self, track_id: str) -> str:
        """Start recording a new take on a track."""
        if not self._current_session:
            raise RuntimeError("No active session")

        track = next((t for t in self._current_session.tracks if t.id == track_id), None)
        if not track:
            raise ValueError(f"Track not found: {track_id}")

        take_id = str(uuid4())
        self._current_take_id = take_id

        return take_id

    def stop_recording(
        self,
        track_id: str,
        take_id: str,
        filename: str,
        duration_samples: int,
    ) -> Take:
        """Stop recording and create the take."""
        return self.add_take(track_id, filename, duration_samples, name=f"Take {len(self.get_track(track_id).takes) + 1}")

    def get_track(self, track_id: str) -> Track | None:
        """Get a track by ID."""
        if not self._current_session:
            return None
        return next((t for t in self._current_session.tracks if t.id == track_id), None)

    def create_comp(
        self,
        track_id: str,
        regions: list[tuple[int, int]],
    ) -> Take:
        """Create a composite take from regions of multiple takes."""
        if not self._current_session:
            raise RuntimeError("No active session")

        track = self.get_track(track_id)
        if not track:
            raise ValueError(f"Track not found: {track_id}")

        total_samples = sum(r[1] - r[0] for r in regions)

        comp_take = Take(
            id=str(uuid4()),
            name="Composite",
            filename="composite.wav",
            duration_samples=total_samples,
            sample_rate=self._current_session.sample_rate,
            status=TakeStatus.COMPOSITE,
            regions=regions,
        )

        track.takes.append(comp_take)
        track.active_take_id = comp_take.id
        return comp_take

    def add_marker(
        self,
        name: str,
        position_samples: int,
        color: str = "#FFFF00",
    ) -> dict:
        """Add a marker to the current session."""
        if not self._current_session:
            raise RuntimeError("No active session")

        marker = {
            "id": str(uuid4()),
            "name": name,
            "position_samples": position_samples,
            "position_time": position_samples / self._current_session.sample_rate,
            "color": color,
        }
        self._current_session.markers.append(marker)
        return marker

    def set_track_volume(self, track_id: str, volume: float) -> None:
        """Set track volume (0.0 to 2.0)."""
        track = self.get_track(track_id)
        if track:
            track.volume = max(0.0, min(2.0, volume))

    def set_track_pan(self, track_id: str, pan: float) -> None:
        """Set track pan (-1.0 to 1.0)."""
        track = self.get_track(track_id)
        if track:
            track.pan = max(-1.0, min(1.0, pan))

    def toggle_mute(self, track_id: str) -> bool:
        """Toggle track mute state."""
        track = self.get_track(track_id)
        if track:
            track.muted = not track.muted
            return track.muted
        return False

    def toggle_solo(self, track_id: str) -> bool:
        """Toggle track solo state."""
        track = self.get_track(track_id)
        if track:
            track.solo = not track.solo
            return track.solo
        return False

    def delete_take(self, track_id: str, take_id: str) -> bool:
        """Delete a take from a track."""
        track = self.get_track(track_id)
        if track:
            track.takes = [t for t in track.takes if t.id != take_id]
            if track.active_take_id == take_id:
                track.active_take_id = track.takes[-1].id if track.takes else None
            return True
        return False

    def export_session_info(self) -> dict:
        """Export session info as dict."""
        if not self._current_session:
            return {}

        return {
            "id": self._current_session.id,
            "name": self._current_session.name,
            "sample_rate": self._current_session.sample_rate,
            "bpm": self._current_session.bpm,
            "time_signature": f"{self._current_session.time_signature[0]}/{self._current_session.time_signature[1]}",
            "track_count": len(self._current_session.tracks),
            "total_duration_samples": sum(
                len(t.takes) * (t.takes[0].duration_samples if t.takes else 0)
                for t in self._current_session.tracks
            ),
            "tracks": [
                {
                    "id": t.id,
                    "name": t.name,
                    "type": t.track_type.value,
                    "take_count": len(t.takes),
                    "active_take": t.active_take_id,
                    "volume": t.volume,
                    "pan": t.pan,
                    "muted": t.muted,
                    "solo": t.solo,
                }
                for t in self._current_session.tracks
            ],
        }


import numpy as np