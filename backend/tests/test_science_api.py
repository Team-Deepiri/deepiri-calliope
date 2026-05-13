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


@pytest.mark.asyncio
async def test_science_pitch_shift_returns_waveform():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/science/pitch-shift",
            json={"samples": [], "sample_rate": 48_000, "demo_tone_hz": 220.0, "semitones": 2.0},
        )
    assert r.status_code == 200
    data = r.json()
    assert "samples" in data and len(data["samples"]) > 0


@pytest.mark.asyncio
async def test_science_autotune_render_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/science/autotune-render",
            json={
                "samples": [],
                "sample_rate": 48_000,
                "demo_tone_hz": 330.0,
                "strength": 0.5,
                "et_snap": True,
                "max_return_samples": 12000,
            },
        )
    assert r.status_code == 200
    assert len(r.json()["samples"]) <= 12_000


@pytest.mark.asyncio
async def test_science_chroma_and_onsets():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        rc = await c.post("/v1/science/chroma", json={"samples": [], "sample_rate": 16_000})
        ro = await c.post("/v1/science/onsets", json={"samples": [], "sample_rate": 16_000})
    assert rc.status_code == 200
    assert len(rc.json()["chroma"]) == 12
    assert ro.status_code == 200
    assert "onset_frame_indices" in ro.json()
