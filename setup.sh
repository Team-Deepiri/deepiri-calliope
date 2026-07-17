#!/usr/bin/env bash
# Calliope development environment setup
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Calliope Setup ==="

# Git Hooks
if [ -d ".git-hooks" ]; then
    git config core.hooksPath .git-hooks
    echo "Git hooks configured (core.hooksPath = .git-hooks)"
else
    echo "No .git-hooks directory found, skipping hooks setup"
fi

# Environment file
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "Created .env from .env.example — edit with your API keys"
    else
        echo "No .env.example found, skipping .env creation"
    fi
else
    echo ".env already exists, skipping"
fi

# Docker
if command -v docker >/dev/null 2>&1; then
    echo "Building Docker containers..."
    docker compose build
    echo "Starting services..."
    docker compose up -d
    echo ""
    echo "Services:"
    echo "  API:      http://localhost:8080"
    echo "  Web:      http://localhost:5173"
    echo "  Ollama:   http://localhost:11434"
    echo "  Postgres: localhost:5432"
else
    echo "Docker not found, skipping container setup"
fi

echo ""
echo "=== Setup complete ==="
