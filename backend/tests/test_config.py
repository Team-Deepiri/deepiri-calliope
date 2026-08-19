from calliope.config import Settings


def test_settings_defaults():
    s = Settings()
    # Local default is SQLite; Docker/desktop stacks override via env.
    assert "sqlite" in s.database_url or "postgres" in s.database_url
    assert s.data_path.as_posix() == "data"
