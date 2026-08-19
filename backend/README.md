# Backend (Poetry)

Requires **Python 3.12+** (including 3.14). Local Macs on Homebrew’s current Python are fine.

## Run API locally

```bash
cd backend
poetry install
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export DATABASE_URL=sqlite+aiosqlite:///./calliope.db
poetry run uvicorn calliope.main:app --reload --port 8080
```

Audio/project files land under `backend/data/` by default (gitignored). Set `DATABASE_URL` and `OLLAMA_BASE_URL` for your environment. SQLite is enough for local hacking; Postgres is optional.

## Optional: CREPE pitch detection

CREPE is an optional extra used by autotune / pitch features. It does **not** install cleanly on Python 3.14 (legacy `setuptools` / `pkg_resources`). On 3.12–3.13 you can add it with:

```bash
poetry install -E crepe
```

Without CREPE, those code paths degrade gracefully (`ImportError` → no pitch track).
