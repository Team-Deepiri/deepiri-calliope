# deepiri-calliope

Local-first AI music studio stack for Team Deepiri: FastAPI backend, Vite React UI, PostgreSQL, and Ollama with shared [`deepiri-ollama-utils`](https://github.com/Team-Deepiri/deepiri-ollama-utils). Groove and mood tooling integrates the [`Aamati`](https://github.com/jrb00013/Aamati) ML tree (cloned at image build time).

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

- API: `http://localhost:8080`
- Web (dev): `http://localhost:5173`
- Ollama: `http://localhost:11434`
- Postgres: `localhost:5432` (user `calliope`, db `calliope`)

## Netlify

The `netlify.toml` builds the Vite app in `frontend/` and publishes `frontend/dist`. Point the Netlify site root at this repository and set `base` to the repo root (or split the frontend later).

## Python layout

Poetry project lives in `backend/`. Core package: `calliope`.

## License

MIT — see `LICENSE`.
