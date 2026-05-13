# deepiri-calliope

Local-first AI music studio stack for Team Deepiri: FastAPI backend, Vite React UI, PostgreSQL, and Ollama with shared [`deepiri-ollama-utils`](https://github.com/Team-Deepiri/deepiri-ollama-utils). Groove and mood tooling integrates the [`Aamati`](https://github.com/jrb00013/Aamati) ML tree (cloned at image build time).

## Quick start

```bash
cp .env.example .env
export DOCKER_BUILDKIT=1
docker compose build --ssh default
docker compose up
```

The API image clones [Aamati](https://github.com/jrb00013/Aamati) over SSH during build; ensure your SSH agent can reach GitHub (`ssh-add -l`).

- API: `http://localhost:8080`
- Web (dev): `http://localhost:5173`
- Ollama: `http://localhost:11434`
- Postgres: `localhost:5432` (user `calliope`, db `calliope`)

## Netlify

The `netlify.toml` builds the Vite app in `frontend/` and publishes `frontend/dist`. Point the Netlify site root at this repository and set `base` to the repo root (or split the frontend later).

## Model router

`POST /v1/generate/plan` accepts:

- `provider`: `auto` (default), `ollama`, `openai`, `anthropic`, or `openrouter`
- `model`: optional; if omitted with `auto`, `DEFAULT_LLM_PROVIDER` selects the backend and its default model

With `provider=auto` and a `model` set, the backend infers the provider from the id (e.g. `gpt-*` → OpenAI, `claude-*` → Anthropic, `vendor/model` → OpenRouter, `ollama/mistral` → Ollama).

`GET /v1/router/providers` returns which API keys are configured (booleans only).

Set keys in `.env` (see `.env.example`).

## Python layout

Poetry project lives in `backend/`. Core package: `calliope`.

## License

Apache License 2.0 — see `LICENSE`.
