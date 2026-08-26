import io
import struct
import wave

import pytest
from httpx import ASGITransport, AsyncClient

from calliope.main import app


def _tiny_wav(duration_sec: float = 0.05, sr: int = 48_000) -> bytes:
    n = max(1, int(duration_sec * sr))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = struct.pack("<" + "h" * n, *([8000] * n))
        wf.writeframes(frames)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_commit_rap_take_registers_new_session_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        sess = await c.post("/v1/recordings/sessions", json={"name": "rap-test", "sample_rate": 48000})
        assert sess.status_code == 200
        session_id = sess.json()["id"]

        wav = _tiny_wav()
        up = await c.post(
            f"/v1/recordings/sessions/{session_id}/upload",
            files={"file": ("take.wav", wav, "audio/wav")},
            data={"track_type": "vocal"},
        )
        assert up.status_code == 200
        source_id = up.json()["recording_id"]

        commit = await c.post(
            f"/v1/recordings/sessions/{session_id}/commit-rap-take",
            json={"source_recording_id": source_id},
        )
        assert commit.status_code == 200, commit.text
        body = commit.json()
        assert body["recording_id"] != source_id
        assert body["duration_sec"] > 0

        files = await c.get(f"/v1/recordings/sessions/{session_id}/files")
        assert files.status_code == 200
        ids = {f["id"] for f in files.json()}
        assert source_id in ids
        assert body["recording_id"] in ids

        dl = await c.get(
            f"/v1/recordings/sessions/{session_id}/files/{body['recording_id']}/download",
        )
        assert dl.status_code == 200
        assert len(dl.content) > 44


@pytest.mark.asyncio
async def test_commit_rap_take_survives_in_memory_session_reset():
    """After API reload the session dict is empty but files remain on disk."""
    from calliope.routes import recordings as rec_mod

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        sess = await c.post("/v1/recordings/sessions", json={"name": "persist", "sample_rate": 48000})
        session_id = sess.json()["id"]

        wav = _tiny_wav()
        up = await c.post(
            f"/v1/recordings/sessions/{session_id}/upload",
            files={"file": ("take.wav", wav, "audio/wav")},
            data={"track_type": "vocal"},
        )
        source_id = up.json()["recording_id"]

        rec_mod._recordings.clear()

        commit = await c.post(
            f"/v1/recordings/sessions/{session_id}/commit-rap-take",
            json={"source_recording_id": source_id},
        )
        assert commit.status_code == 200, commit.text
