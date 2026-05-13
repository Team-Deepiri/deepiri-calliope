# Backend (Poetry)

Run API locally:

```bash
poetry install
poetry run uvicorn calliope.main:app --reload --port 8080
```

Set `DATABASE_URL` and `OLLAMA_BASE_URL` for your environment.
