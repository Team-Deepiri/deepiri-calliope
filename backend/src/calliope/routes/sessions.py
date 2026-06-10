"""Session management API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from calliope.audio.session_manager import get_session_manager

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@router.get("/recent")
async def list_recent_sessions(limit: int = 10) -> dict:
    """
    List recently accessed sessions.
    """
    manager = get_session_manager()
    projects = manager.list_recent_projects(limit)
    return {"recent": projects}


@router.get("/templates")
async def list_templates() -> dict:
    """
    List available project templates.
    """
    manager = get_session_manager()
    templates = manager.list_templates()
    return {"templates": templates}


@router.post("/create-from-template")
async def create_session_from_template(
    name: str = "Untitled Session",
    template: str = "empty",
) -> dict:
    """
    Create a new session from a template.
    """
    manager = get_session_manager()
    if template not in [t["name"] for t in manager.list_templates()]:
        raise HTTPException(status_code=400, detail=f"Unknown template: {template}")
    session = manager.create_session(name=name, template_name=template)
    return {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
        "bpm": session.bpm,
        "key": session.key,
        "track_count": len(session.tracks),
    }


@router.post("/create")
async def create_session(
    name: str = "Untitled Session",
    bpm: int = 120,
    key: str = "C",
) -> dict:
    """
    Create a new studio session.
    """
    manager = get_session_manager()
    session = manager.create_session(name, bpm, key)
    return {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
        "bpm": session.bpm,
        "key": session.key,
        "track_count": len(session.tracks),
    }


@router.get("/list")
async def list_sessions(search: str | None = None) -> dict:
    """
    List all sessions with optional search.
    """
    manager = get_session_manager()
    sessions = manager.list_sessions(search)
    return {
        "sessions": [
            {
                "id": s.id,
                "name": s.name,
                "created_at": s.created_at,
                "updated_at": s.updated_at,
                "bpm": s.bpm,
                "key": s.key,
                "track_count": len(s.tracks),
                "tags": s.tags,
                "description": s.description,
            }
            for s in sessions
        ],
    }


@router.get("/{session_id}")
async def get_session(session_id: str) -> dict:
    """
    Get full session data.
    """
    manager = get_session_manager()
    session = manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "bpm": session.bpm,
        "key": session.key,
        "description": session.description,
        "tags": session.tags,
        "tracks": [
            {
                "id": t.id,
                "name": t.name,
                "track_type": t.track_type,
                "volume": t.volume,
                "pan": t.pan,
                "muted": t.muted,
                "solo": t.solo,
                "armed": t.armed,
                "automation_armed": t.automation_armed,
                "group_id": t.group_id,
                "group_expanded": t.group_expanded,
                "color": t.color,
                "height": t.height,
                "clip_count": len(t.clips),
            }
            for t in session.tracks
        ],
        "vocal_rack": {
            "enabled": session.vocal_rack.enabled,
            "hpf": session.vocal_rack.hpf,
            "hpf_freq": session.vocal_rack.hpf_freq,
            "de_ess": session.vocal_rack.de_ess,
            "de_ess_threshold": session.vocal_rack.de_ess_threshold,
            "compress": session.vocal_rack.compress,
            "comp_threshold": session.vocal_rack.comp_threshold,
            "comp_ratio": session.vocal_rack.comp_ratio,
            "comp_attack": session.vocal_rack.comp_attack,
            "comp_release": session.vocal_rack.comp_release,
            "eq": session.vocal_rack.eq,
            "eq_low": session.vocal_rack.eq_low,
            "eq_mid": session.vocal_rack.eq_mid,
            "eq_high": session.vocal_rack.eq_high,
            "de_reverb": session.vocal_rack.de_reverb,
            "reverb_type": session.vocal_rack.reverb_type,
            "reverb_size": session.vocal_rack.reverb_size,
            "reverb_damping": session.vocal_rack.reverb_damping,
            "reverb_mix": session.vocal_rack.reverb_mix,
            "formant": session.vocal_rack.formant,
            "formant_shift": session.vocal_rack.formant_shift,
            "formant_preserve": session.vocal_rack.formant_preserve,
            "tune": session.vocal_rack.tune,
            "tune_speed": session.vocal_rack.tune_speed,
            "tune_scale": session.vocal_rack.tune_scale,
            "pitch_shift": session.vocal_rack.pitch_shift,
        },
        "plugin_chain": [
            {
                "id": p.id,
                "plugin_name": p.plugin_name,
                "enabled": p.enabled,
                "mix": p.mix,
                "parameters": p.parameters,
            }
            for p in session.plugin_chain
        ],
        "autotune_config": session.autotune_config,
        "recordings": session.recordings,
        "audio_clips": session.audio_clips,
        "prompt": session.prompt,
        "generation_settings": session.generation_settings,
        "arrangement_markers": [
            {"id": m.id, "name": m.name, "bar": m.bar, "color": m.color}
            for m in session.arrangement_markers
        ],
    }


@router.put("/{session_id}")
async def update_session(
    session_id: str,
    name: str | None = None,
    bpm: int | None = None,
    key: str | None = None,
    prompt: str | None = None,
    generation_settings: dict | None = None,
    tags: list[str] | None = None,
    description: str | None = None,
) -> dict:
    """
    Update session metadata.
    """
    manager = get_session_manager()
    updates = {}
    if name is not None:
        updates["name"] = name
    if bpm is not None:
        updates["bpm"] = bpm
    if key is not None:
        updates["key"] = key
    if prompt is not None:
        updates["prompt"] = prompt
    if generation_settings is not None:
        updates["generation_settings"] = generation_settings
    if tags is not None:
        updates["tags"] = tags
    if description is not None:
        updates["description"] = description

    session = manager.update_session(session_id, updates)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"id": session.id, "updated_at": session.updated_at}


@router.post("/{session_id}/save")
async def save_session(session_id: str) -> dict:
    """
    Explicitly save session to .calliope project file.
    """
    manager = get_session_manager()
    session = manager.save(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "name": session.name,
        "updated_at": session.updated_at,
        "saved": True,
    }


@router.post("/{session_id}/load")
async def load_session(session_id: str) -> dict:
    """
    Load session from .calliope project file.
    """
    manager = get_session_manager()
    session = manager.load(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session.id,
        "name": session.name,
        "bpm": session.bpm,
        "key": session.key,
        "track_count": len(session.tracks),
    }


@router.post("/{session_id}/freeze-track")
async def freeze_track(session_id: str, track_id: str) -> dict:
    """
    Freeze/bounce a track to audio.
    """
    manager = get_session_manager()
    session = manager.freeze_track(session_id, track_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session or track not found")
    return {
        "id": session.id,
        "track_id": track_id,
        "frozen": True,
    }


@router.get("/{session_id}/export-stems")
async def export_stems(session_id: str) -> dict:
    """
    Export all tracks as stems metadata.
    """
    manager = get_session_manager()
    data = manager.export_stems(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")
    return data


@router.put("/{session_id}/vocal-rack")
async def update_session_vocal_rack(session_id: str, vocal_rack: dict) -> dict:
    """
    Update session vocal rack settings.
    """
    manager = get_session_manager()
    session = manager.update_vocal_rack(session_id, vocal_rack)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"id": session.id, "updated_at": session.updated_at}


@router.put("/{session_id}/plugin-chain")
async def update_session_plugin_chain(session_id: str, chain: list[dict]) -> dict:
    """
    Update session plugin chain.
    """
    manager = get_session_manager()
    session = manager.update_plugin_chain(session_id, chain)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"id": session.id, "updated_at": session.updated_at}


@router.post("/{session_id}/duplicate")
async def duplicate_session(session_id: str, new_name: str | None = None) -> dict:
    """
    Duplicate a session.
    """
    manager = get_session_manager()
    session = manager.duplicate_session(session_id, new_name)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"id": session.id, "name": session.name, "created_at": session.created_at}


@router.delete("/{session_id}")
async def delete_session(session_id: str) -> dict:
    """
    Delete a session.
    """
    manager = get_session_manager()
    if not manager.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": "deleted", "session_id": session_id}


@router.get("/{session_id}/export")
async def export_session(session_id: str) -> dict:
    """
    Export session data for backup/sharing.
    """
    manager = get_session_manager()
    data = manager.export_session(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")

    return data


@router.post("/import")
async def import_session(data: dict) -> dict:
    """
    Import session data.
    """
    manager = get_session_manager()
    session = manager.import_session(data)
    return {"id": session.id, "name": session.name, "created_at": session.created_at}
