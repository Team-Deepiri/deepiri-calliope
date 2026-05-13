from calliope.services.ollama_bridge import OllamaMusicBridge


def test_bridge_has_default_model():
    b = OllamaMusicBridge()
    assert isinstance(b.default_model, str)
    assert len(b.default_model) > 0
