#!/usr/bin/env bash
# Sets up git hooks for branch protection
set -euo pipefail

if [ -d ".git-hooks" ]; then
    git config core.hooksPath .git-hooks
    echo "Git hooks configured (core.hooksPath = .git-hooks)"
else
    echo "No .git-hooks directory found, skipping hooks setup"
fi
