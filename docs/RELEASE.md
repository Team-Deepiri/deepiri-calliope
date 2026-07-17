# Calliope Desktop Release Notes

## Prerequisites

- Docker Desktop (or Docker Engine on Linux)
- Ollama with `ollama pull mistral`
- Optional: cloud API key in desktop stack `.env`

## CI notes

- Aamati is public and cloned over HTTPS during the API image build — **no deploy key required**.
- GHCR package `ghcr.io/team-deepiri/calliope-api` must be **Public** so desktop users can `docker compose pull` without login.
- Org package visibility **cannot** be flipped with `GITHUB_TOKEN` (the Packages API returns 404). Do it once in the UI:
  1. Open [calliope-api package](https://github.com/orgs/Team-Deepiri/packages/container/package/calliope-api) (or **Repo → Packages**).
  2. **Package settings → Change visibility → Public**.
- `docker-publish` only builds/pushes; `release` verifies the image with a GHCR login so CI still works while the package is private.

## Linux AppImage note

- Some Linux environments require `libfuse2` for AppImage execution.
- If AppImage mount fails, run with:

```bash
./Calliope-latest.AppImage --appimage-extract-and-run
```

- For Docker usage, prefer adding your user to the `docker` group so stack scripts can run without `sudo`.

## Latest asset checks

```bash
BASE=https://github.com/Team-Deepiri/deepiri-calliope/releases/latest/download
curl -I "$BASE/Calliope-latest.dmg"
curl -I "$BASE/Calliope-latest.AppImage"
curl -I "$BASE/Calliope-latest-setup.exe"
```

## macOS

- v1 ships an **arm64** DMG (`Calliope-latest.dmg`).
