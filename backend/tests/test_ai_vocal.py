import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from calliope.audio.speech_to_singing import sing_from_speech, tts_available
from calliope.audio.svs_diffsinger import diffsinger_available, ipa_to_opencpop, synthesize_diffsinger
from calliope.audio.vocal_synth import AIVocalSynthesizer, lyric_tokens, melody_from_lyrics
from calliope.main import app


def test_lyric_tokens_split_syllables():
    toks = lyric_tokens("Floating through the neon sky")
    assert len(toks) >= 5
    assert lyric_tokens("") == ["la"]


def test_melody_from_lyrics_is_longer_than_a_boop():
    melody = melody_from_lyrics("Floating through the neon sky, AI singing high", bpm=120)
    assert len(melody) >= 6
    last_end = melody[-1][1] + melody[-1][2]
    assert last_end > 1.0


def test_vocal_mlp_writes_scale_pitches():
    from calliope.audio.vocal_melody_ml import melody_model_id, weights_available
    from calliope.audio.vocal_synth import VOICE_RANGES

    if not weights_available():
        pytest.skip("vocal melody MLP weights not trained")
    lo, hi = VOICE_RANGES["tenor"]
    melody = melody_from_lyrics(
        "Floating through the neon sky, AI singing high",
        bpm=120,
        voice_name="tenor",
        genre_preset="pop",
    )
    assert melody_model_id() == "vocal_mlp"
    assert len(melody) >= 6
    assert all(lo <= midi <= hi for midi, _s, _d in melody)


def test_formant_synth_renders_audio():
    lyrics = "Hello neon"
    melody = melody_from_lyrics(lyrics, bpm=100, voice_name="tenor")
    y = AIVocalSynthesizer(sr=16_000).synthesize(lyrics, melody, voice_name="tenor")
    assert y.size > 16_000  # > 1s at 16 kHz, not a 0.35s beep
    assert float(abs(y).max()) > 0.05


def test_ipa_to_opencpop_maps_english():
    phones = ipa_to_opencpop("həlˈoʊ nˈiːɑːn skˈaɪ")
    assert "h" in phones
    assert "ou" in phones or "u" in phones
    assert "ai" in phones


def test_diffsinger_renders_when_weights_present():
    if not diffsinger_available():
        pytest.skip("DiffSinger ONNX weights not installed")
    lyrics = "Hello neon"
    melody = melody_from_lyrics(lyrics, bpm=100, voice_name="soprano")
    y = synthesize_diffsinger(lyrics, melody, sr=16_000)
    assert y is not None
    assert y.size > 8_000
    assert float(abs(y).max()) > 0.05


def test_sing_from_speech_retunes_voiced_audio():
    sr = 16_000
    t = np.arange(int(0.8 * sr)) / sr
    speech = 0.3 * np.sin(2 * np.pi * 180 * t) + 0.12 * np.sin(2 * np.pi * 360 * t)
    melody = [(64, 0.0, 0.35), (67, 0.4, 0.35)]
    y = sing_from_speech(speech, sr, melody, sr=sr)
    assert y.size > int(0.6 * sr)
    assert float(abs(y).max()) > 0.05
    # Contour should move pitch, not leave the take as spoken.
    n = min(y.size, speech.size)
    assert not np.allclose(y[:n], speech[:n], atol=1e-3)


@pytest.mark.asyncio
async def test_synthesize_lyrics_is_not_a_demo_tone():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/ai-vocal/synthesize",
            json={
                "lyrics": "Hello neon sky",
                "voice_model": "tenor",
                "genre_preset": "pop",
                "sample_rate": 16_000,
            },
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] in ("lyrics_sts", "lyrics_svs", "lyrics_formant")
    if tts_available():
        assert body["source"] == "lyrics_sts"
        assert body["metrics"].get("tts_backend") in ("piper", "openai_tts", "macos_say")
    assert body["duration_sec"] > 1.0
    assert len(body["waveform"]) > 100
    assert max(abs(v) for v in body["waveform"]) > 0.02
    assert body["output_file"]
    from calliope.audio.vocal_melody_ml import weights_available

    if weights_available():
        assert body["metrics"].get("melody_model") == "vocal_mlp"


@pytest.mark.asyncio
async def test_synthesize_without_lyrics_stays_demo_tone():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/v1/ai-vocal/synthesize",
            json={"lyrics": "   ", "sample_rate": 16_000},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "demo_tone"
    assert body["duration_sec"] < 1.0


@pytest.mark.asyncio
async def test_synthesize_into_session_registers_file():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        sess = await c.post("/v1/recordings/sessions", json={"name": "svs", "sample_rate": 16000})
        assert sess.status_code == 200
        session_id = sess.json()["id"]

        r = await c.post(
            "/v1/ai-vocal/synthesize",
            json={
                "lyrics": "Sing this line",
                "voice_model": "bass",
                "session_id": session_id,
                "sample_rate": 16_000,
                "bpm": 100,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["source"] in ("lyrics_sts", "lyrics_svs", "lyrics_formant")
        assert body["session_id"] == session_id
        assert body["recording_id"]
        dl = await c.get(body["output_file"])
        assert dl.status_code == 200
        assert len(dl.content) > 44
