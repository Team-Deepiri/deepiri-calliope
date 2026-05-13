import pytest
from httpx import ASGITransport, AsyncClient

from calliope.main import app


@pytest.mark.asyncio
async def test_voice_process_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/voice/process",
            json={
                "samples": [],
                "sample_rate": 48_000,
                "demo_tone_hz": 220.0,
                "rack": {"role": "single_lead", "tune_tightness": 30, "room_send": 15},
                "output_stereo": True,
                "max_return_samples": 8000,
            },
        )
    assert r.status_code == 200
    body = r.json()
    assert "channel_left" in body and len(body["channel_left"]) <= 8000
    assert "metrics" in body and "rms_out_dbfs" in body["metrics"]
