from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

from calliope.audio.session_manager import get_session_manager
from calliope.config import get_settings

router = APIRouter(tags=["session-advanced"])


class CreateFromTemplateRequest(BaseModel):
    template_id: str
    name: str = "Untitled Session"
    bpm: int = 120
    key: str = "C"


class SessionTemplate(BaseModel):
    id: str
    name: str
    description: str = ""
    category: str = "general"
    track_count: int = 0
    preview_path: str | None = None


BUILT_IN_TEMPLATES: list[SessionTemplate] = [
    SessionTemplate(id="empty", name="Empty", description="Blank session", category="general", track_count=0),
    SessionTemplate(id="basic-tracks", name="Basic Tracks", description="Drums, bass, pads, lead", category="electronic", track_count=4),
    SessionTemplate(id="vocal-production", name="Vocal Production", description="Vocal chain with effects", category="vocal", track_count=2),
    SessionTemplate(id="orchestral", name="Orchestral", description="Strings, brass, woodwinds, percussion", category="orchestral", track_count=8),
    SessionTemplate(id="lo-fi", name="Lo-Fi", description="Lo-fi hip-hop setup", category="hip-hop", track_count=5),
]


@router.post("/v1/sessions/from-template")
async def create_session_from_template(body: CreateFromTemplateRequest) -> dict:
    manager = get_session_manager()
    template_ids = [t.id for t in BUILT_IN_TEMPLATES]
    if body.template_id not in template_ids:
        raise HTTPException(status_code=400, detail=f"Unknown template: {body.template_id}")
    template = next(t for t in BUILT_IN_TEMPLATES if t.id == body.template_id)
    session = manager.create_session(name=body.name, bpm=body.bpm, key=body.key)
    session.tags.append(template.category)
    session.description = template.description
    return {
        "id": session.id,
        "name": session.name,
        "template": body.template_id,
        "bpm": session.bpm,
        "key": session.key,
        "track_count": len(session.tracks),
        "created_at": session.created_at,
    }


@router.get("/v1/sessions/browse")
async def browse_sessions(
    search: str | None = None,
    sort: str = "updated_at",
    filter_category: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    manager = get_session_manager()
    all_sessions = manager.list_sessions(search)
    if filter_category:
        all_sessions = [s for s in all_sessions if filter_category in s.tags]
    reverse = sort.startswith("-")
    sort_key = sort.lstrip("-")
    all_sessions.sort(key=lambda s: getattr(s, sort_key, ""), reverse=reverse)
    page = all_sessions[offset : offset + limit]
    return {
        "total": len(all_sessions),
        "offset": offset,
        "limit": limit,
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
            for s in page
        ],
    }


@router.delete("/v1/sessions/{session_id}")
async def delete_session_advanced(session_id: str) -> dict:
    manager = get_session_manager()
    if not manager.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "session_id": session_id}


@router.post("/v1/sessions/{session_id}/duplicate")
async def duplicate_session_advanced(session_id: str, new_name: str | None = None) -> dict:
    manager = get_session_manager()
    session = manager.duplicate_session(session_id, new_name)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"id": session.id, "name": session.name, "created_at": session.created_at}


@router.post("/v1/sessions/{session_id}/export-bundle")
async def export_session_bundle(session_id: str) -> dict:
    manager = get_session_manager()
    session = manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    settings = get_settings()
    bundle_dir = settings.data_path / "bundles"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = bundle_dir / f"{session_id}.calliope"
    data = manager.export_session(session_id)
    bundle_path.write_text(json.dumps(data, indent=2, default=str))
    return {"bundle_path": str(bundle_path), "session_id": session_id, "size_bytes": bundle_path.stat().st_size}


@router.post("/v1/sessions/import-bundle")
async def import_session_bundle(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.endswith(".calliope"):
        raise HTTPException(status_code=400, detail="Expected .calliope bundle file")
    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid bundle file")
    manager = get_session_manager()
    session = manager.import_session(data)
    return {"id": session.id, "name": session.name, "created_at": session.created_at}


@router.get("/v1/sessions/templates")
async def list_session_templates(category: str | None = None) -> dict:
    if category:
        templates = [t for t in BUILT_IN_TEMPLATES if t.category == category]
    else:
        templates = BUILT_IN_TEMPLATES
    return {"templates": [t.model_dump() for t in templates], "total": len(templates)}


@router.get("/v1/sessions/{session_id}/history")
async def get_session_history(session_id: str) -> dict:
    manager = get_session_manager()
    session = manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        history_manager = manager.get_history_manager(session_id)
        history = history_manager.get_history()
    except (AttributeError, NotImplementedError):
        history = [
            {
                "version": 1,
                "timestamp": session.updated_at,
                "description": "Initial save",
            }
        ]
    return {"session_id": session_id, "history": history, "current_version": len(history)}
