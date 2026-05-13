"""Preset management API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from calliope.plugins.presets import (
    PluginPreset,
    PresetCategory,
    get_preset_manager,
)

router = APIRouter(prefix="/v1/presets", tags=["presets"])


@router.get("/list")
async def list_presets(
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    favorites_only: bool = False,
) -> dict:
    """
    List all presets with optional filtering.
    """
    manager = get_preset_manager()
    
    cat = PresetCategory(category) if category else None
    
    presets = manager.list_presets(
        category=cat,
        tag=tag,
        search=search,
        favorites_only=favorites_only,
    )
    
    return {
        "presets": [p.to_dict() for p in presets],
        "categories": [c.value for c in PresetCategory],
    }


@router.post("/create")
async def create_preset(
    name: str,
    plugins: list[dict],
    description: str = "",
    category: str = "custom",
    tags: list[str] | None = None,
) -> dict:
    """
    Create a new preset from a plugin chain.
    """
    manager = get_preset_manager()
    
    cat = PresetCategory(category) if category else PresetCategory.CUSTOM
    
    preset = manager.create_preset(
        name=name,
        plugins=plugins,
        description=description,
        category=cat,
        tags=tags,
    )
    
    return preset.to_dict()


@router.get("/{preset_id}")
async def get_preset(preset_id: str) -> dict:
    """Get a specific preset by ID."""
    manager = get_preset_manager()
    
    preset = manager.get_preset(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return preset.to_dict()


@router.put("/{preset_id}")
async def update_preset(
    preset_id: str,
    name: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
    favorite: bool | None = None,
    rating: int | None = None,
) -> dict:
    """Update preset metadata."""
    manager = get_preset_manager()
    
    updates = {}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    if tags is not None:
        updates["tags"] = tags
    if favorite is not None:
        updates["favorite"] = favorite
    if rating is not None:
        updates["rating"] = rating
    
    preset = manager.update_preset(preset_id, updates)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return preset.to_dict()


@router.delete("/{preset_id}")
async def delete_preset(preset_id: str) -> dict:
    """Delete a preset."""
    manager = get_preset_manager()
    
    if not manager.delete_preset(preset_id):
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return {"deleted": True}


@router.post("/{preset_id}/favorite")
async def toggle_favorite(preset_id: str) -> dict:
    """Toggle preset favorite status."""
    manager = get_preset_manager()
    
    favorite = manager.toggle_favorite(preset_id)
    if favorite is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return {"favorite": favorite}


@router.post("/{preset_id}/rating")
async def set_rating(preset_id: str, rating: int) -> dict:
    """Set preset rating (0-5 stars)."""
    manager = get_preset_manager()
    
    if not manager.set_rating(preset_id, rating):
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return {"rating": rating}


@router.post("/{preset_id}/duplicate")
async def duplicate_preset(preset_id: str, new_name: str) -> dict:
    """Duplicate a preset with a new name."""
    manager = get_preset_manager()
    
    preset = manager.duplicate_preset(preset_id, new_name)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return preset.to_dict()


@router.get("/{preset_id}/export")
async def export_preset(preset_id: str) -> dict:
    """Export preset data for sharing."""
    manager = get_preset_manager()
    
    data = manager.export_preset(preset_id)
    if not data:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return data


@router.post("/import")
async def import_preset(data: dict) -> dict:
    """Import a preset from shared data."""
    manager = get_preset_manager()
    
    preset = manager.import_preset(data)
    return preset.to_dict()