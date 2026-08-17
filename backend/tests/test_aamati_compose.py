import pytest
from httpx import ASGITransport, AsyncClient

from calliope.main import app


@pytest.mark.asyncio
async def test_aamati_compose_constrain_true():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(
            "/v1/aamati/compose",
            json={"text": "174 bpm neurofunk reese dark", "constrain": True},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["constrain"] is True
    steer = body["steer"]
    assert steer["bpm"] >= 60
    assert 0.0 <= steer["drum_density"] <= 1.0
    assert "arrangement" in body
    assert body["arrangement"]["bpm"] == steer["bpm"]
    assert "hard parameters" in body["llm_block"]


@pytest.mark.asyncio
async def test_aamati_compose_ab_differs():
    transport = ASGITransport(app=app)
    payload = {"text": "dark ambient drone pads"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        locked = await client.post("/v1/aamati/compose", json={**payload, "constrain": True})
        free = await client.post("/v1/aamati/compose", json={**payload, "constrain": False})
    assert locked.status_code == 200
    assert free.status_code == 200
    a = locked.json()["steer"]
    b = free.json()["steer"]
    assert a["source"] in ("aamati", "brief")
    assert b["source"] == "brief"
    assert a["rationale"] != b["rationale"] or a["drum_density"] != b["drum_density"]
