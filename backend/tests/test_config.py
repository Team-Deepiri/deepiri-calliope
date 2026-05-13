from calliope.config import Settings


def test_settings_defaults():
    s = Settings()
    assert "5432" in s.database_url or "postgres" in s.database_url
