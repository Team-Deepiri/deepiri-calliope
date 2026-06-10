import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from calliope import models as _models  # noqa: F401 — register metadata
from calliope.config import get_settings
from calliope.db import init_db
from calliope.integrations.synapse_stub import log_synapse_style_banner
from calliope.middleware.request_id import RequestIdMiddleware
from calliope.routes import aamati, arrangement, generate, health, jobs, music, ollama as ollama_routes, science, voice, recordings, plugins, websocket, presets, clips, vocal_effects, visualization, sessions, stems, midi, batch, export, ai_mix, synth, monitoring, loops, automation, modulation, routing

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log_synapse_style_banner()
    await init_db()
    settings = get_settings()
    settings.ensure_directories()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

    app = FastAPI(
        title="Deepiri Calliope",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(aamati.router)
    app.include_router(ollama_routes.router)
    app.include_router(generate.router)
    app.include_router(music.router)
    app.include_router(jobs.router)
    app.include_router(science.router)
    app.include_router(voice.router)
    app.include_router(recordings.router)
    app.include_router(plugins.router)
    app.include_router(presets.router)
    app.include_router(clips.router)
    app.include_router(vocal_effects.router)
    app.include_router(visualization.router)
    app.include_router(sessions.router)
    app.include_router(stems.router)
    app.include_router(midi.router)
    app.include_router(batch.router)
    app.include_router(export.router)
    app.include_router(arrangement.router)
    app.include_router(ai_mix.router)
    app.include_router(synth.router)
    app.include_router(monitoring.router)
    app.include_router(loops.router)
    app.include_router(automation.router)
    app.include_router(modulation.router)
    app.include_router(routing.router)
    app.include_router(websocket.router)
    return app


app = create_app()
