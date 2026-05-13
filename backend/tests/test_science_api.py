import pytest
from httpx import ASGITransport, AsyncClient

from calliope.main import app


@pytest.mark.asyncio
async def test_science_pitch_demo():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/science/pitch-contour",
            json={"samples": [], "sample_rate": 48_000, "demo_tone_hz": 440.0},
        )
    assert r.status_code == 200
    body = r.json()
    assert any(f > 200 for f in body["f0_hz"])


@pytest.mark.asyncio
async def test_science_features_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/v1/science/features", json={"samples": [], "sample_rate": 16_000})
    assert r.status_code == 200
    assert "spectral_centroid_hz" in r.json()
